-- ══════════════════════════════════════════════════════════
-- 前台會員（客戶帳號）
--
-- 設計重點：登入帳號是「手機號碼」不是 Email —— 本專案沒有任何寄信管道，
-- Email 驗證信／密碼重設信都寄不出去；而印刷業客戶的實質 identity 本來就是電話
-- （work_orders.customer_phone 早就在收）。Email 只當聯絡欄位、不驗證。
--
-- status：
--   guest  = 從 /upload 的聯絡表單「無痛入會」建立的，還沒設密碼 → 換裝置進不來
--   active = 已設密碼（自助註冊，或 guest 事後升級）
--   disabled = 停用
--
-- 慣例同其他 schema：冪等、enable RLS、不建任何 policy（service_role 專用）。
-- ══════════════════════════════════════════════════════════

create table if not exists members (
  id uuid primary key default gen_random_uuid(),

  phone text unique not null,                   -- 登入帳號，normalize 後只留數字
  phone_display text,                           -- 客戶原本輸入的字串，顯示用
  name text not null,
  company text,
  email text,                                   -- 只當聯絡欄位，不驗證、不當帳號

  password_hash text,                           -- pbkdf2 hex；guest 期間為 null
  password_salt text,
  status text not null default 'guest',         -- guest / active / disabled

  -- ★ 收稿授信：「是否已付款過」的真相在這裡，不是去查有沒有 paid order。
  -- 月結客戶（檔名第二段的「月匯」）永遠不會線上付款，用付款紀錄判定會把
  -- 最重要的客戶擋在門外。
  credit_status text not null default 'prepay', -- prepay / approved / suspended
  payment_terms text not null default 'cash',   -- cash / monthly / cod
  erp_customer_name text,                       -- 對應檔名 {(月匯)◯◯◯} 的客戶寶號
  erp_customer_no text,
  credit_note text,
  approved_by uuid,
  approved_at timestamptz,

  -- 付款歷史（derived，只當自動升級的觸發條件）
  paid_order_count int not null default 0,
  first_paid_at timestamptz,
  last_order_at timestamptz,

  -- 忘記密碼：沒有寄信管道 → 由後台產生 single-use 連結，店員用 LINE/電話給客戶
  reset_token_hash text,
  reset_expires_at timestamptz,

  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists members_status_idx on members (status);
create index if not exists members_credit_idx on members (credit_status);

alter table members enable row level security;

create or replace function set_members_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_members_updated on members;
create trigger trg_members_updated
  before update on members
  for each row execute function set_members_updated_at();

-- ── 既有表關聯到會員 ──
-- 訪客先聊/先傳，登入後把當下的 session 補上 member_id（「認領」），對話不斷線。
alter table intake_sessions add column if not exists member_id uuid;
create index if not exists intake_sessions_member_idx on intake_sessions (member_id, updated_at desc);

alter table work_orders add column if not exists member_id uuid;
create index if not exists work_orders_member_idx on work_orders (member_id, created_at desc);
