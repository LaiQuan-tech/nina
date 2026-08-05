# 部署與架構：Vercel ＋ GitHub ＋ Supabase ＋ Railway

本文件是給 Claude Code 的實作藍圖。設計規格見 `README.md`。

## 職責分工

| 平台 | 負責 |
| --- | --- |
| **GitHub** | 單一 repo（monorepo）、PR 流程、CI（lint / typecheck / build） |
| **Vercel** | Next.js 前台網站 ＋ 輕量 API Route（頁面、AI 對話串流、報價試算、建立訂單） |
| **Supabase** | Postgres（服務項目、作品、材質單價、報價、訂單、對話紀錄）、Storage（客戶稿件）、Auth（後台業務登入）、RLS |
| **Railway** | 長時間／背景工作：稿件檢查 worker（解析度・出血・色彩模式）、縮圖與預覽產生、LINE Webhook 服務、Email 通知、定時任務 |

> 原則：**能在 Vercel 完成的請求就留在 Vercel**（有 10–60s 執行上限）；任何檔案處理、長流程、webhook 常駐服務放 Railway。

---

## 建議 Repo 結構（monorepo，pnpm workspaces）

```
mei5899/
├─ apps/
│  ├─ web/                     # Next.js 15 App Router → Vercel
│  │  ├─ app/
│  │  │  ├─ page.tsx           # 首頁（README 的六個區塊）
│  │  │  ├─ works/page.tsx     # 作品完整列表（可選）
│  │  │  ├─ quote/page.tsx     # 全頁式 AI 報價精靈
│  │  │  ├─ admin/             # 業務後台（Supabase Auth 保護）
│  │  │  └─ api/
│  │  │     ├─ chat/route.ts        # AI 對話（streaming）
│  │  │     ├─ quote/route.ts       # 估價試算（伺服器端重算，勿信前端）
│  │  │     ├─ orders/route.ts      # 建立訂單、產生訂單編號
│  │  │     └─ uploads/sign/route.ts# 取得 Supabase Storage 簽署上傳 URL
│  │  ├─ components/
│  │  │  ├─ site/              # Header, Hero, ServiceGrid, WorksWall, OemBanner, Footer
│  │  │  └─ quote/             # ChatPanel, MaterialPicker, SizeFields, FinishingPicker, PriceRange
│  │  └─ lib/
│  │     ├─ supabase/          # server / browser client
│  │     └─ pricing.ts         # 估價公式（與 worker 共用，見 packages/pricing）
│  └─ worker/                  # Node/Fastify 服務 → Railway
│     ├─ src/index.ts          # health + queue consumer
│     ├─ src/artwork.ts        # 稿件檢查（sharp / pdfjs / ghostscript）
│     ├─ src/line.ts           # LINE Messaging API webhook + push
│     └─ src/notify.ts         # Email（Resend）
├─ packages/
│  ├─ pricing/                 # 估價公式（唯一真實來源，web 與 worker 共用）
│  └─ db/                      # Supabase 型別（supabase gen types）＋ migrations
├─ supabase/
│  └─ migrations/*.sql
├─ .github/workflows/ci.yml
└─ package.json
```

技術選擇：Next.js 15（App Router、Server Components）、TypeScript、Tailwind CSS v4（把 README 的 tokens 寫進 `@theme`）、Vercel AI SDK（`ai` 套件）＋ Anthropic provider、`@supabase/ssr`、Zod 驗證、pnpm。

> **不要**引入元件庫的預設樣式（shadcn 等）而破壞設計：本設計是零圓角、2px 框線、無陰影的系統。若使用 shadcn，請覆寫 `--radius: 0`、移除 shadow、按鈕改為 2px border。

---

## Supabase 資料模型

```sql
-- 服務項目
create table services (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name_zh       text not null,
  name_en       text not null,
  note          text not null,
  price_hint    text,                -- 例：'參考 NT$22–35 ／才'
  accent        text not null,       -- '#00a3e0' | '#e6007e' | '#f5c400' | '#201e1d'
  image_path    text,                -- Supabase Storage 路徑
  sort_order    int not null default 0,
  is_active     boolean not null default true
);

-- 作品分類
create table work_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  sort_order int not null default 0
);

-- 作品
create table projects (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid references work_categories(id) on delete set null,
  title         text not null,
  meta          text not null,       -- '2025 ／ 900×450 cm ／ 無接縫'
  year          int,
  image_path    text,
  sort_order    int not null default 0,
  is_featured   boolean not null default false,
  is_active     boolean not null default true
);

-- 材質單價（估價來源）
create table materials (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  unit         text not null default 'cai',   -- 'cai'(才) | 'piece'(件) | 'sqm'
  unit_price   numeric(10,2) not null,
  min_charge   numeric(10,2) not null default 300,
  service_id   uuid references services(id) on delete set null,
  is_active    boolean not null default true
);

-- 後加工
create table finishings (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  rate       numeric(5,4) not null,   -- 0.08 = +8%
  is_active  boolean not null default true
);

-- 報價（每次試算可留存，供業務追單）
create table quotes (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,          -- Q-20260806-0031
  material_id   uuid references materials(id),
  width_cm      numeric(10,2) not null,
  height_cm     numeric(10,2) not null
    ,
  qty           int not null,
  finishing_ids uuid[] not null default '{}',
  cai           numeric(10,2) not null,
  price_low     numeric(12,2) not null,
  price_high    numeric(12,2) not null,
  detail        text not null,
  contact_name  text,
  contact_phone text,
  contact_email text,
  source        text not null default 'web',    -- 'web' | 'line'
  created_at    timestamptz not null default now()
);

-- 訂單
create table orders (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,          -- MK-20260806-0007
  quote_id       uuid references quotes(id),
  status         text not null default 'pending',
  -- pending | reviewing | confirmed | in_production | shipped | done | cancelled
  contact_name   text not null,
  contact_phone  text not null,
  contact_email  text,
  company        text,
  note           text,
  due_date       date,
  assigned_to    uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 稿件
create table order_files (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid references orders(id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  normalized_name text,              -- 公司寶號}材質}尺寸}數量}後加工
  size_bytes   bigint,
  check_status text not null default 'queued',  -- queued | ok | warning | failed
  check_report jsonb,                -- {dpi, bleed_mm, color_mode, warnings[]}
  created_at   timestamptz not null default now()
);

-- AI 對話
create table conversations (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null default 'web',      -- 'web' | 'line'
  external_id text,                             -- LINE userId
  quote_id    uuid references quotes(id),
  order_id    uuid references orders(id),
  handed_off  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role            text not null,                -- 'user' | 'assistant' | 'agent'
  content         text not null,
  created_at      timestamptz not null default now()
);
```

**RLS**
- `services` / `projects` / `work_categories` / `materials` / `finishings`：`select` 開放 `anon`（僅 `is_active = true`），寫入僅 `service_role` 與後台已登入使用者。
- `quotes` / `orders` / `order_files` / `conversations` / `messages`：**anon 完全不可讀**。前台建立資料一律經由 API Route 用 `service_role` 寫入；後台讀取用已登入使用者的 policy。
- Storage bucket `artwork`（private）：上傳走簽署 URL；下載僅後台。bucket `public-media`（public）：服務項目與作品照片。

**編號產生**：用 Postgres function ＋ 每日 sequence，避免競態：
```sql
create sequence order_seq;
create or replace function next_order_code() returns text language sql as $$
  select 'MK-' || to_char(now() at time zone 'Asia/Taipei','YYYYMMDD') || '-' ||
         lpad((nextval('order_seq') % 10000)::text, 4, '0');
$$;
```

---

## 環境變數

`apps/web`（Vercel）
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
WORKER_BASE_URL=            # Railway 服務網址
WORKER_SHARED_SECRET=       # web ↔ worker 互相驗證
NEXT_PUBLIC_SITE_URL=
```

`apps/worker`（Railway）
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
WORKER_SHARED_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
RESEND_API_KEY=
NOTIFY_EMAIL_TO=m29095878@gmail.com
TZ=Asia/Taipei
```

`.env.example` 兩份都要提交進 repo；真實金鑰只放平台環境變數，**不要**進 git。

---

## API 合約（web）

| Route | Method | 說明 |
| --- | --- | --- |
| `/api/quote` | POST | body `{materialId, width, height, qty, finishingIds[]}` → `{cai, low, high, detail}`。**伺服器端用 `packages/pricing` 重算**，前端只做即時預覽。 |
| `/api/chat` | POST | Vercel AI SDK streaming。system prompt 內嵌材質／後加工／營業資訊；提供 tools：`estimate_price`、`recommend_material`、`create_order`、`handoff_to_human`。 |
| `/api/uploads/sign` | POST | 回傳 Supabase Storage 簽署上傳 URL＋建議檔名（`公司寶號}材質}尺寸}數量}後加工`）。 |
| `/api/orders` | POST | 建立 `orders` ＋ 關聯 `order_files`，呼叫 `next_order_code()`，並向 Railway worker 派送稿件檢查與通知任務。 |

AI 客服的五段流程（README 的 01–05）請以 tool calling 實作，不要靠自由對話推測價格：估價一律呼叫 `estimate_price`（走同一份公式）。

---

## 部署步驟

1. **GitHub**：建立 repo，push monorepo；加 `.github/workflows/ci.yml`（pnpm install → lint → typecheck → build）。
2. **Supabase**：建立 project（region 選 Southeast Asia / Singapore）→ 跑 `supabase/migrations` → 建立 `artwork`（private）與 `public-media`（public）兩個 bucket → 設定 RLS → `supabase gen types typescript` 產生型別到 `packages/db`。
3. **Vercel**：Import GitHub repo，Root Directory 設 `apps/web`，填入環境變數，Production branch = `main`，Preview 走 PR。網域接 `mei5899.com`（保留舊站直到驗收完成）。
4. **Railway**：新建 service，Root Directory `apps/worker`，指令 `pnpm build && pnpm start`，開 public domain（給 LINE webhook），填入環境變數。若要排程，加 Railway Cron。
5. **LINE**：Messaging API channel → webhook URL 指向 Railway 服務 `/line/webhook` → 綁定官方帳號 `@qif5433b`。
6. **驗收**：估價數字與業務逐項對過；上傳 5MB／500MB 稿件各測一次；手機（iOS Safari／Android Chrome）確認 RWD 與 44px 觸控；Lighthouse 行動版 ≥ 90。

## 內容遷移
舊站 `https://www.mei5899.com/` 的產品分類與作品分類已對應到 `services` / `work_categories`（清單見 `README.md`）。作品照片需向客戶取得原始檔後上傳 `public-media`；目前設計稿以斜紋佔位標示每個位置該放什麼。

## SEO / 其他
- `metadata`：沿用舊站描述關鍵字（大圖輸出、廣告帆布、車體廣告、旗幟布條、卡布燈箱……）。
- 加 `LocalBusiness` JSON-LD（地址、電話、營業時間）。
- 舊站路徑做 301：`/service.php` → `/#service`、`/projects.php` → `/works`、`/products.php` → `/#service`、`/contact.php` → `/#contact`。
- 圖片一律 `next/image`；hero 與內文照片以 CSS `filter: grayscale(1)` 或事先轉黑白（設計要求）。
