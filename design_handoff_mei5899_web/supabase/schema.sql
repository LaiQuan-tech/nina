-- 美強光新官網 Supabase schema
-- 執行：supabase db push（或貼進 SQL Editor）
-- 慣例：所有金額為 TWD 整數（元，不含小數）；尺寸一律以 mm 存放。

create extension if not exists "pgcrypto";

-- ============ 內容 ============

create type service_axis as enum ('use', 'material', 'process');

create table service_categories (
  id          uuid primary key default gen_random_uuid(),
  axis        service_axis not null,
  slug        text not null,
  name        text not null,
  sort        int not null default 0,
  unique (axis, slug)
);

create table services (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,               -- 例：廣告帆布 / 無接縫
  summary       text not null,               -- 卡片下方一行說明
  body          text,                        -- 單頁詳細內容（markdown）
  cover_url     text,
  gallery       text[] not null default '{}',
  specs         jsonb not null default '{}', -- 材質、尺寸上限、後加工選項、工期
  pricing_rule  jsonb not null default '{}', -- ⚠ server only，勿回傳給 client
  is_active     boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now()
);

create table service_category_links (
  service_id  uuid references services(id) on delete cascade,
  category_id uuid references service_categories(id) on delete cascade,
  primary key (service_id, category_id)
);

create table projects (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category_slug text not null,               -- canvas / vehicle / lightbox / 3dletter / window / flag / standee / backdrop ...
  client_type   text,                        -- 中小企業 / 展場 / 競選 / 同業代工
  material      text,
  size_text     text,                        -- 例：3m × 6m
  lead_time     text,                        -- 例：3 個工作日
  images        text[] not null default '{}',
  is_featured   boolean not null default false,
  sort          int not null default 0,
  created_at    timestamptz not null default now()
);

create table posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  slug        text unique not null,
  body        text not null,
  published_at timestamptz,
  created_at  timestamptz not null default now()
);

create table downloads (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  file_url    text not null,
  note        text,
  sort        int not null default 0
);

-- ============ AI 對話 ============

create type chat_stage as enum ('intake','quote','upload','confirm','handoff','paid');

create table chat_sessions (
  id          uuid primary key default gen_random_uuid(),
  stage       chat_stage not null default 'intake',
  source      text not null default 'web',   -- web / line
  contact     jsonb not null default '{}',   -- name, phone, email, company
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table chat_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references chat_sessions(id) on delete cascade,
  role        text not null check (role in ('user','assistant','tool')),
  content     text,
  tool_name   text,
  tool_input  jsonb,
  tool_output jsonb,
  created_at  timestamptz not null default now()
);
create index on chat_messages (session_id, created_at);

-- ============ 詢價 / 訂單 ============

create type quote_status as enum ('draft','estimated','needs_human','confirmed','expired','cancelled');

create table quote_requests (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references chat_sessions(id) on delete set null,
  status      quote_status not null default 'draft',
  contact     jsonb not null default '{}',
  needs_install boolean not null default false,
  due_date    date,
  subtotal    int,                            -- 系統初估金額（TWD）
  breakdown   jsonb,                          -- 計價明細快照
  human_note  text,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table quote_items (
  id            uuid primary key default gen_random_uuid(),
  quote_id      uuid not null references quote_requests(id) on delete cascade,
  service_id    uuid references services(id),
  width_mm      int,
  height_mm     int,
  qty           int not null default 1,
  material      text,
  finishing     text[] not null default '{}',  -- 打孔/車邊/縫繩/裱板/上框
  seamless      boolean,
  price_snapshot jsonb,                        -- 當時套用的規則與計算結果
  note          text
);

create type payment_status as enum ('unpaid','pending','paid','refunded','failed');

create table orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      text unique not null,          -- M260806-014
  quote_id      uuid references quote_requests(id) on delete set null,
  contact       jsonb not null default '{}',
  amount        int not null,
  payment_status payment_status not null default 'unpaid',
  payment_ref   text,
  promised_date date,
  note          text,
  created_at    timestamptz not null default now()
);

create table payment_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references orders(id) on delete cascade,
  provider    text not null,
  event_id    text not null,                   -- idempotency
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  unique (provider, event_id)
);

-- 訂單編號：M{YYMMDD}-{每日序號3碼}
create table order_seq (
  day   date primary key,
  seq   int  not null default 0
);

create or replace function next_order_no() returns text as $$
declare n int;
begin
  insert into order_seq (day, seq) values (current_date, 1)
  on conflict (day) do update set seq = order_seq.seq + 1
  returning seq into n;
  return 'M' || to_char(current_date, 'YYMMDD') || '-' || lpad(n::text, 3, '0');
end;
$$ language plpgsql;

-- ============ 上傳檔案 ============

create table uploads (
  id                uuid primary key default gen_random_uuid(),
  quote_id          uuid references quote_requests(id) on delete set null,
  order_id          uuid references orders(id) on delete set null,
  storage_path      text not null,             -- artwork/{yyyy}/{mm}/{uuid}-{name}
  original_filename text not null,
  filename_ok       boolean not null default false,
  filename_segments jsonb,                     -- 公司寶號/材質/尺寸/數量/後加工
  file_size         bigint,
  mime_type         text,
  width_px          int,
  height_px         int,
  dpi               int,
  color_mode        text,                      -- CMYK / RGB
  issues            text[] not null default '{}',
  source            text not null default 'web', -- web / ftp / line
  created_at        timestamptz not null default now()
);

create table handoffs (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references chat_sessions(id) on delete cascade,
  quote_id    uuid references quote_requests(id) on delete set null,
  reason      text not null,
  handled_by  uuid,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- ============ 後台使用者 ============

create table admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  name        text,
  role        text not null default 'staff'    -- owner / staff
);

create or replace function is_admin() returns boolean as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$ language sql stable security definer;

-- ============ RLS ============

alter table services              enable row level security;
alter table service_categories    enable row level security;
alter table service_category_links enable row level security;
alter table projects              enable row level security;
alter table posts                 enable row level security;
alter table downloads             enable row level security;
alter table quote_requests        enable row level security;
alter table quote_items           enable row level security;
alter table orders                enable row level security;
alter table payment_events        enable row level security;
alter table uploads               enable row level security;
alter table chat_sessions         enable row level security;
alter table chat_messages         enable row level security;
alter table handoffs              enable row level security;
alter table admins                enable row level security;

-- 公開內容：anon 可讀（services 的 pricing_rule 請透過 view 或 API 過濾，勿直接 select *）
create policy public_read_services   on services   for select using (is_active);
create policy public_read_cats       on service_categories for select using (true);
create policy public_read_cat_links  on service_category_links for select using (true);
create policy public_read_projects   on projects   for select using (true);
create policy public_read_posts      on posts      for select using (published_at is not null);
create policy public_read_downloads  on downloads  for select using (true);

-- 不含價格規則的公開 view（前台請查這個）
create view services_public as
  select id, slug, name, summary, body, cover_url, gallery, specs, sort
  from services where is_active;

-- 管理員可讀寫全部營運資料；一般使用者無權限（寫入一律由 service role 經 API 進行）
create policy admin_all_quotes    on quote_requests for all using (is_admin());
create policy admin_all_items     on quote_items    for all using (is_admin());
create policy admin_all_orders    on orders         for all using (is_admin());
create policy admin_all_payevents on payment_events for all using (is_admin());
create policy admin_all_uploads   on uploads        for all using (is_admin());
create policy admin_all_sessions  on chat_sessions  for all using (is_admin());
create policy admin_all_messages  on chat_messages  for all using (is_admin());
create policy admin_all_handoffs  on handoffs       for all using (is_admin());
create policy admin_read_admins   on admins         for select using (is_admin());
create policy admin_write_content_services on services for all using (is_admin());
create policy admin_write_projects on projects       for all using (is_admin());
create policy admin_write_posts    on posts          for all using (is_admin());
create policy admin_write_downloads on downloads     for all using (is_admin());

-- ============ Storage ============
-- 於 Supabase Dashboard 建立：
--   artwork       (private) 客戶印刷檔，僅簽章網址存取，90 天生命週期
--   public-media  (public)  作品照、服務照
