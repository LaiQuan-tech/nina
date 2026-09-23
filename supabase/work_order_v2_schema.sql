-- Nina 工單改版 v2：對齊客戶實體 A4 工單所需欄位 + 加工/配件明細 + 條碼掃描事件
-- 冪等，可重複執行。RLS 開、不建任何 policy → 只有 service_role 能存取（沿用專案慣例）。
-- 套用：Management API POST /v1/projects/vsnvgvkkyvisummilpux/database/query（curl + jq）。

-- ── work_orders 新增欄位（全部 nullable）──────────────────────────────
alter table public.work_orders add column if not exists machine_model    text;  -- 機台型號（ERP 四表皆無，手填）
alter table public.work_orders add column if not exists lamination       text;  -- 護貝膜 亮/霧/細霧
alter table public.work_orders add column if not exists ink_type         text;  -- 油墨類別（ERP 子商品，白名單）
alter table public.work_orders add column if not exists print_method     text;  -- 列印方式
alter table public.work_orders add column if not exists plate_material   text;  -- 版材
alter table public.work_orders add column if not exists remark           text;  -- 備註
alter table public.work_orders add column if not exists ship_name        text;  -- 貨物寄送-姓名
alter table public.work_orders add column if not exists ship_phone       text;  -- 貨物寄送-電話
alter table public.work_orders add column if not exists ship_address     text;  -- 貨物寄送-地址
alter table public.work_orders add column if not exists thumbnail_path   text;  -- print-files 內縮圖物件路徑
alter table public.work_orders add column if not exists diagram_path     text;  -- 加工示意小圖物件路徑
alter table public.work_orders add column if not exists station          text;  -- 目前站別快取（由掃描事件重算維護）
alter table public.work_orders add column if not exists thumbnail_status text;  -- pending/ok/failed/unsupported/manual
alter table public.work_orders add column if not exists thumbnail_meta   jsonb not null default '{}'::jsonb;  -- 產製狀態/重試/錯誤
alter table public.work_orders add column if not exists erp_enrich       jsonb not null default '{}'::jsonb;  -- ERP 補值完整結果+信心度（低信心不寫欄位、只留這裡當下拉建議）
-- 註：不新增 operator，「接單人員」沿用既有 receiver（同一人）。

-- 會員地址 → 貨物寄送預設值（members 原本無地址欄）
alter table public.members add column if not exists address text;

create index if not exists work_orders_station_idx on public.work_orders (station, created_at desc);
create index if not exists work_orders_thumb_pending_idx
  on public.work_orders (created_at)
  where thumbnail_status is null or thumbnail_status = 'pending';

-- ── 加工說明／配件明細（表單各印 5 列，資料表不限列數）────────────────
create table if not exists public.work_order_items (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  kind text not null check (kind in ('processing','accessory')),  -- 加工說明 / 配件
  sort int not null,
  code text,                                   -- erp_processing_items.code，例 ZA0024
  name text not null,
  qty numeric,
  unit text,
  created_at timestamptz not null default now(),
  unique (work_order_id, kind, sort)           -- 讓編輯表單能 upsert
);
create index if not exists work_order_items_order_idx
  on public.work_order_items (work_order_id, kind, sort);
alter table public.work_order_items enable row level security;

-- ── 條碼掃描事件（append-only 稽核；station/status 由此重算）──────────
create table if not exists public.work_order_events (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  station text not null check (station in ('output','process','accessory','packed','delivered')),
  admin_id uuid,
  admin_name text,
  scanned_at timestamptz not null default now(),
  note text
);
create index if not exists work_order_events_order_idx
  on public.work_order_events (work_order_id, scanned_at desc);
create index if not exists work_order_events_station_idx
  on public.work_order_events (station, scanned_at desc);
alter table public.work_order_events enable row level security;

-- ── 建單時自動帶一列預設加工說明（對齊既有 processing_items default '四邊切齊'）──
-- 用 trigger 而非 TS 兩段 insert：supabase-js 無交易，trigger 才原子。ZA0024=四邊切齊。
create or replace function public.seed_work_order_items() returns trigger language plpgsql as $$
begin
  insert into public.work_order_items (work_order_id, kind, sort, code, name)
  values (new.id, 'processing', 1, 'ZA0024', coalesce(nullif(new.processing_items,''), '四邊切齊'))
  on conflict (work_order_id, kind, sort) do nothing;
  return new;
end $$;
drop trigger if exists trg_work_order_items_seed on public.work_orders;
create trigger trg_work_order_items_seed after insert on public.work_orders
  for each row execute function public.seed_work_order_items();

-- ── 既有工單回填：把 processing_items 文字切成明細列（冪等）──────────────
insert into public.work_order_items (work_order_id, kind, sort, name)
select w.id, 'processing', t.i, btrim(t.v)
from public.work_orders w
cross join lateral unnest(
  string_to_array(regexp_replace(coalesce(w.processing_items,''), '[、,，/;；]', '|', 'g'), '|')
) with ordinality as t(v, i)
where btrim(t.v) <> ''
on conflict (work_order_id, kind, sort) do nothing;

-- ── 整組取代加工/配件明細（編輯表單用；delete+insert 需原子，故走 RPC）──
create or replace function public.replace_work_order_items(p_order uuid, p_kind text, p_rows jsonb)
returns void language plpgsql as $$
begin
  if p_kind not in ('processing','accessory') then
    raise exception 'invalid kind: %', p_kind;
  end if;
  delete from public.work_order_items where work_order_id = p_order and kind = p_kind;
  insert into public.work_order_items (work_order_id, kind, sort, code, name, qty, unit)
  select p_order, p_kind,
         (row_number() over (order by t.ord))::int - 1,   -- 0-based、密集重編（跳過空白列）
         nullif(t.r->>'code',''), btrim(t.r->>'name'),
         nullif(t.r->>'qty','')::numeric, nullif(t.r->>'unit','')
  from jsonb_array_elements(p_rows) with ordinality t(r, ord)
  where nullif(btrim(t.r->>'name'),'') is not null;
end $$;

-- ── ERP 補值一次取回所需全部欄位（原 match_product 不動，避免動到既有呼叫端）──
-- erp_product_master.subcategory_code join erp_sub_products.code（實測 699/699 全解、code 唯一）
-- 不 join erp_main_products（同 code 語意不同會錯）。
create or replace function public.match_product_v2(p_spec text)
returns table(
  code text, name text, exact boolean,
  subcategory_code text, sub_name text, main_product_name text,
  unit text, note text, work_days int, sides text
)
language sql stable as $$
  select m.code, m.name, (m.code = p_spec) as exact,
         m.subcategory_code, s.name, s.main_product_name,
         m.unit, m.note, m.work_days::int, m.sides
  from public.erp_product_master m
  left join public.erp_sub_products s on s.code = m.subcategory_code
  where p_spec = m.code or p_spec like m.code || '%'
  order by (m.code = p_spec) desc, length(m.code) desc
  limit 1
$$;
