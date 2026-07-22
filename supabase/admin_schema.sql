-- Nina 階段二：多帳號管理員 + 收稿案件（對話紀錄）+ 工單關聯
-- 冪等，可重複執行。RLS 全開、無 public policy → 只有 service_role 能存取。

-- ── 管理員帳號（多帳號各自登入）──
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  password_hash text not null,      -- pbkdf2 hash (hex)
  password_salt text not null,      -- random salt (hex)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
alter table admin_users enable row level security;

-- ── 收稿案件＝一位客戶一次來訪（含完整對話）──
create table if not exists intake_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text unique not null,          -- 前端 crypto.randomUUID()
  contact_name text,
  contact_email text,
  contact_phone text,
  messages jsonb not null default '[]'::jsonb,   -- 完整對話 [{role,text}]
  message_count int not null default 0,
  submitted_count int not null default 0,        -- 成功收件檔數
  status text not null default 'active',         -- active / submitted
  last_file_name text,
  user_ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists intake_sessions_updated_idx on intake_sessions (updated_at desc);
create index if not exists intake_sessions_status_idx on intake_sessions (status, updated_at desc);
alter table intake_sessions enable row level security;

-- intake_sessions.updated_at 自動更新
create or replace function set_intake_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_intake_updated on intake_sessions;
create trigger trg_intake_updated before update on intake_sessions
  for each row execute function set_intake_updated_at();

-- ── 工單關聯到案件 ──
alter table work_orders add column if not exists session_id text;
create index if not exists work_orders_session_idx on work_orders (session_id);
