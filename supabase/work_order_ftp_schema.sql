-- Nina 工單改版：收到的印刷檔自動推上美強光 Synology NAS 的 FTP（網站收稿資料夾）
-- 冪等。收檔存進 Supabase Storage 後標 ftp_status='pending'，由 Vercel Cron 非同步推、
-- 失敗重試，絕不擋客人上傳。RLS 沿用 work_orders 既有設定（service_role 專用）。

alter table public.work_orders add column if not exists ftp_status text;   -- null(不推)/pending/ok/failed/skipped
alter table public.work_orders add column if not exists ftp_path   text;   -- 推成功後在 NAS 上的完整路徑（Big5 對應的 UTF-8 顯示）
alter table public.work_orders add column if not exists ftp_meta    jsonb not null default '{}'::jsonb;  -- {tries,last_error,last_try_at,pushed_at}

-- Cron 撈「待推」用：只挑 pending，已終態(ok/failed/skipped)或 null(不推)不掃。
create index if not exists work_orders_ftp_pending_idx
  on public.work_orders (created_at)
  where ftp_status = 'pending';

-- 註：既有工單「不」回填成 pending（避免把過去的檔一次倒上 NAS）；
--     只有本次改動上線後新收的檔，createWorkOrder 會標 pending 進入推送佇列。
