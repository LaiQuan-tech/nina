-- Nina Demo 客戶知識後台：客戶樣貌、報價、回訪與 Demo 隔離。
-- 冪等，可重複執行。所有資料只由 server-side service_role 存取。

alter table members add column if not exists is_demo boolean not null default false;
alter table intake_sessions add column if not exists is_demo boolean not null default false;
alter table work_orders add column if not exists is_demo boolean not null default false;

create index if not exists members_demo_idx on members (is_demo, created_at desc);
create index if not exists intake_sessions_demo_idx on intake_sessions (is_demo, updated_at desc);
create index if not exists work_orders_demo_idx on work_orders (is_demo, created_at desc);

create table if not exists customer_profiles (
  member_id uuid primary key references members(id) on delete cascade,
  industry text,
  customer_tier text not null default 'standard' check (customer_tier in ('standard', 'growth', 'vip')),
  tags text[] not null default '{}',
  preferred_contact text,
  preferred_materials text[] not null default '{}',
  preferred_products text[] not null default '{}',
  preferred_processing text[] not null default '{}',
  preferred_delivery text[] not null default '{}',
  common_sizes text[] not null default '{}',
  price_sensitivity text not null default 'medium' check (price_sensitivity in ('low', 'medium', 'high')),
  ai_summary text,
  service_notes text,
  last_summary_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  quote_no text unique not null,
  member_id uuid not null references members(id) on delete cascade,
  session_id text,
  title text not null,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'expired', 'lost')),
  items jsonb not null default '[]'::jsonb,
  valid_until date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customer_followups (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  title text not null,
  reason text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  assignee text,
  due_at timestamptz not null,
  completed_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_profiles_demo_idx on customer_profiles (is_demo, customer_tier);
create index if not exists customer_profiles_industry_idx on customer_profiles (industry);
create index if not exists quotes_member_created_idx on quotes (member_id, created_at desc);
create index if not exists quotes_demo_status_idx on quotes (is_demo, status, created_at desc);
create index if not exists followups_member_due_idx on customer_followups (member_id, due_at);
create index if not exists followups_demo_status_due_idx on customer_followups (is_demo, status, due_at);

create or replace function set_customer_knowledge_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_customer_profiles_updated on customer_profiles;
create trigger trg_customer_profiles_updated before update on customer_profiles
  for each row execute function set_customer_knowledge_updated_at();
drop trigger if exists trg_quotes_updated on quotes;
create trigger trg_quotes_updated before update on quotes
  for each row execute function set_customer_knowledge_updated_at();
drop trigger if exists trg_customer_followups_updated on customer_followups;
create trigger trg_customer_followups_updated before update on customer_followups
  for each row execute function set_customer_knowledge_updated_at();

alter table customer_profiles enable row level security;
alter table quotes enable row level security;
alter table customer_followups enable row level security;

revoke all on customer_profiles, quotes, customer_followups from anon, authenticated;
grant select, insert, update, delete on customer_profiles, quotes, customer_followups to service_role;
revoke execute on function set_customer_knowledge_updated_at() from public, anon, authenticated;
grant execute on function set_customer_knowledge_updated_at() to service_role;

notify pgrst, 'reload schema';
