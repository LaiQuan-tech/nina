-- ══════════════════════════════════════════════════════════
-- 官網站圖（Direction B）
-- slot_key 是「版面契約」：前台用固定 key 取圖，換圖不必改程式。
-- 圖檔放公開 bucket site-media（站圖本來就要公開，且首頁走 ISR，
-- 私有 bucket 的簽名 URL 會過期造成破圖）。
-- 慣例同其他 schema：冪等、enable RLS、不建任何 policy（service_role 專用）。
-- ══════════════════════════════════════════════════════════

create table if not exists site_images (
  id uuid primary key default gen_random_uuid(),
  slot_key text unique not null,              -- 'hero.main' / 'service.canvas' / 'work.1'
  group_key text not null,                    -- 'hero' | 'service' | 'work'（後台分組用）
  label text not null,                        -- 後台顯示的中文名稱
  storage_path text,                          -- site-media 內路徑
  public_url text,                            -- 快取好的公開網址（前台直接用）
  alt text not null default '',               -- 無障礙替代文字
  prompt text,                                -- 生成提示詞（後台可改後重生）
  aspect text,                                -- '3:4' / '4:3' / '16:9' / '16:10'
  source text not null default 'ai',          -- 'ai'（AI 生成）| 'upload'（後台上傳實拍）
  model text,                                 -- 生成模型，稽核用
  width int,
  height int,
  sort int not null default 0,
  is_active boolean not null default true,
  status text not null default 'empty',       -- empty / generating / ready / failed
  error text,
  updated_by uuid,                            -- admin_users.id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_images_group_idx on site_images (group_key, sort);

alter table site_images enable row level security;

create or replace function set_site_images_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_site_images_updated on site_images;
create trigger trg_site_images_updated
  before update on site_images
  for each row execute function set_site_images_updated_at();

-- ── 公開 Storage bucket（站圖）──
-- 與私有的 print-files 嚴格分開：print-files 裡全部是客戶機密印刷檔。
insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true)
on conflict (id) do update set public = true;
