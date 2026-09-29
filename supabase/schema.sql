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
-- 直傳收稿（/api/upload/complete）的冪等保證：同一個上傳物件只能對應一張工單。
-- 前端網路不穩時會自動重送 complete，兩個請求同時通過「先查」時只能靠這個唯一約束擋下
-- （程式遇到 23505 會回查同路徑的既有工單並回成功）。2026-09-29 已套用正式庫。
create unique index if not exists work_orders_storage_path_key on work_orders (storage_path);

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
-- file_size_limit = 10MB（= lib/upload/limits.ts MAX_UPLOAD_BYTES）：客人是拿伺服器簽的一次性網址直傳進來，
-- 這個上限讓外流的上傳網址也傳不了更大的檔。既有專案已於 2026-09-29 用 Storage API
-- （PUT /storage/v1/bucket/print-files，service_role）設定；這裡只影響新建環境（on conflict do nothing）。
insert into storage.buckets (id, name, public, file_size_limit)
values ('print-files', 'print-files', false, 10485760)
on conflict (id) do nothing;
