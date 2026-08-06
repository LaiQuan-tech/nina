-- Nina — 工單資料表 + 工單編號自動產生 + 私有 Storage bucket
-- 一次性冪等：可重複執行。

-- ── 工單主表 ──
create table if not exists work_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique,                         -- CK<民國YYYMMDD>-<4碼序>，由 trigger 產生

  -- 檔名拆解（deterministic parser 結果）
  serial text,
  payment_type text,
  customer_name text,
  category_no text,
  file_date text,                               -- YYYYMMDD 原字串
  owner_code text,
  design_name text,
  size_w numeric,
  size_h numeric,
  size_unit text default 'cm',
  material_raw text,
  product_name text,                             -- 商品名稱（優先來自 ERP 主檔查表）
  product_code text,                             -- 命中的 ERP 商品編號（例 CCPVC720N）
  product_matched boolean default false,         -- 是否命中 ERP 商品主檔
  total_qty int,
  material_spec text,
  file_ext text,

  file_name text not null,                       -- 完整原始檔名（含中文），工單「檔案名稱」欄顯示用
  storage_path text not null,                    -- print-files bucket 內的物件路徑
  parsed jsonb not null default '{}'::jsonb,     -- 完整 segments 備查

  -- 檔名帶不出、可於工單頁手動補的欄位
  customer_no text,
  customer_phone text,
  contact_person text,
  received_at timestamptz default now(),         -- 接單日（收檔當下）
  delivery_date date,
  delivery_method text,
  draft_count int default 1,                     -- 稿件數
  single_qty int,                                -- 單一稿數量
  processing_items text default '四邊切齊',      -- 加工項目
  receiver text,                                 -- 接稿人

  status text not null default 'open',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_orders_created_idx on work_orders (created_at desc);

-- updated_at 自動更新
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_work_orders_updated on work_orders;
create trigger trg_work_orders_updated before update on work_orders
  for each row execute function set_updated_at();

-- ── 工單編號：CK + 民國(年-1911)MMDD + '-' + 4碼流水（Asia/Taipei）──
create sequence if not exists work_order_seq;

create or replace function gen_work_order_no() returns trigger language plpgsql as $$
declare
  tp timestamptz := now() at time zone 'Asia/Taipei';
begin
  new.order_no := 'CK'
    || lpad((extract(year from tp)::int - 1911)::text, 3, '0')
    || to_char(tp, 'MMDD')
    || '-'
    || lpad(nextval('work_order_seq')::text, 4, '0');
  return new;
end $$;

drop trigger if exists trg_work_order_no on work_orders;
create trigger trg_work_order_no before insert on work_orders
  for each row when (new.order_no is null) execute function gen_work_order_no();

-- ── RLS：啟用、不建任何 public policy → 只有 service_role 能存取 ──
alter table work_orders enable row level security;

-- ── 私有 Storage bucket（印刷檔）──
insert into storage.buckets (id, name, public)
values ('print-files', 'print-files', false)
on conflict (id) do nothing;
