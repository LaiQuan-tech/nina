-- Nina — ERP 參照主檔（來源：城盛ERP規劃.xlsx；由 scripts/importErp.mjs 匯入）
-- 全部 RLS 開、無 public policy → 只有 service_role 能讀（app 於 server 端查）。

-- 印刷商品主檔（商品編號 → 商品名稱 的權威來源）
create table if not exists erp_product_master (
  code text primary key,
  name text,
  subcategory_code text,
  unit text,
  pricing_method text,
  sides text,
  size_l numeric,
  size_w numeric,
  work_days int,
  vendor_code text,
  note text,
  base_unit_price numeric,
  active int default 1,
  web_sellable int default 0
);
create index if not exists erp_product_master_name_idx on erp_product_master (name);

-- 加工項目主檔
create table if not exists erp_processing_items (
  code text primary key,
  name text,
  subcategory_code text,
  unit text,
  pricing_method text,
  active int default 1
);

-- 主商品類別
create table if not exists erp_main_products (
  code text primary key,
  sort int,
  name text
);

-- 次商品類別（次商品編號可能非全域唯一 → 用 surrogate id）
create table if not exists erp_sub_products (
  id bigint generated always as identity primary key,
  code text,
  sort int,
  main_product_name text,
  name text
);
create index if not exists erp_sub_products_code_idx on erp_sub_products (code);

alter table erp_product_master enable row level security;
alter table erp_processing_items enable row level security;
alter table erp_main_products enable row level security;
alter table erp_sub_products enable row level security;

-- 商品碼比對：先完全相符，否則最長前綴相符（例 CCPVC720N10M → CCPVC720N）。
create or replace function match_product(p_spec text)
returns table(code text, name text, exact boolean)
language sql stable as $$
  select code, name, (code = p_spec) as exact
  from erp_product_master
  where p_spec = code or p_spec like code || '%'
  order by (code = p_spec) desc, length(code) desc
  limit 1
$$;
