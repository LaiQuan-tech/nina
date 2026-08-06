# 技術架構：美強光新官網 + AI 接單

目標部署：**GitHub**（原始碼）→ **Vercel**（前台網站）＋ **Supabase**（資料庫 / Auth / Storage）＋ **Railway**（背景工作與長任務）。

## 為什麼要四個平台（職責切分）

| 平台 | 負責 |
|---|---|
| GitHub | 單一 monorepo，PR → Vercel Preview，main → Production |
| Vercel | Next.js 前台 + API Routes（AI 對話 streaming、報價計算、訂單建立、Webhook 入口） |
| Supabase | Postgres（服務、作品、報價、訂單、對話紀錄）、Storage（客戶上傳的印刷檔）、Auth（後台管理員）、Realtime（後台即時看到新詢價） |
| Railway | 不適合放在 serverless 的工作：**FTP 收檔監看**、大檔案解析（PDF/AI 尺寸與解析度檢查）、縮圖轉檔、排程（每日報價過期清理、報表）、LINE Bot worker、Email 佇列 |

> 判斷準則：有 request/response 且 < 60s 的放 Vercel；需要常駐、輪詢、處理大檔、跑超過 60s 的放 Railway。

## Repo 結構（monorepo，pnpm workspaces）

```
mei5899/
├── apps/
│   ├── web/                  # Next.js 15 App Router → Vercel
│   │   ├── app/
│   │   │   ├── (site)/page.tsx              # 首頁（Direction B）
│   │   │   ├── (site)/services/page.tsx
│   │   │   ├── (site)/services/[slug]/page.tsx
│   │   │   ├── (site)/projects/page.tsx
│   │   │   ├── (site)/about/page.tsx
│   │   │   ├── (site)/contact/page.tsx
│   │   │   ├── (site)/downloads/page.tsx
│   │   │   ├── (site)/quote/page.tsx        # AI 對話全頁版
│   │   │   ├── admin/                       # 後台（Supabase Auth 保護）
│   │   │   └── api/
│   │   │       ├── chat/route.ts            # Claude streaming + tool use
│   │   │       ├── quote/route.ts           # 報價計算（純函式，可測）
│   │   │       ├── orders/route.ts          # 建立訂單、產生訂單編號
│   │   │       ├── upload/route.ts          # 簽發 Supabase Storage 上傳網址
│   │   │       ├── payment/route.ts         # 金流建立
│   │   │       └── webhooks/{line,payment}/route.ts
│   │   └── components/       # Header, Hero, ServiceRail, ProjectWall, ChatWidget…
│   └── worker/               # Node 常駐服務 → Railway
│       ├── src/ftp-watcher.ts
│       ├── src/file-inspector.ts      # 尺寸/解析度/色彩模式檢查、縮圖
│       ├── src/line-bot.ts
│       ├── src/cron.ts
│       └── src/mailer.ts
└── packages/
    ├── db/                   # Supabase 型別、query helpers
    ├── pricing/              # 報價引擎（前後端共用、100% 單元測試）
    └── ui/                   # 共用元件與 design tokens
```

技術選擇：Next.js 15（App Router、RSC）、TypeScript strict、Tailwind CSS v4、Zod、`@supabase/ssr`、`@anthropic-ai/sdk`、Vitest、Playwright（AI 詢價 happy path）。

## 資料模型

完整 SQL 見 `supabase/schema.sql`。核心表：

- `service_categories` — 三軸分類（`axis: use | material | process`）
- `services` — 服務項目（slug、名稱、說明、圖片、規格、`pricing_rule` JSONB、`is_active`、`sort`）
- `projects` — 作品（標題、分類、材質、尺寸、工期、客戶類型、圖片陣列、`is_featured`）
- `posts` — 最新消息
- `quote_requests` — AI 詢價單（對話 id、聯絡人、需求結構、報價明細、狀態）
- `quote_items` — 單一品項（service_id、寬、高、單位、數量、材質、後加工陣列、計價快照）
- `orders` — 訂單（`order_no`、quote_request_id、金額、付款狀態、交期、備註）
- `uploads` — 上傳檔案（storage path、原始檔名、**檔名規則檢查結果**、尺寸/解析度/色彩模式、關聯訂單）
- `chat_sessions` / `chat_messages` — 對話紀錄（含 tool call 記錄，可稽核）
- `admins` — 後台使用者（對應 Supabase Auth `auth.users`）

RLS：公開表（services / projects / posts）僅開放 `select` 給 `anon`；`quote_requests`、`orders`、`uploads`、`chat_*` 一律**只允許 service role**（由 API route 寫入），前台不得直連。後台以 `admins` 表比對 `auth.uid()`。

## AI 客服接單流程（核心）

`/api/chat` 使用 Claude（建議 `claude-sonnet-4-5`）＋ **tool use**，以工具呼叫推進狀態機，避免讓模型自由發明價格。

狀態機：`intake → quote → upload → confirm → handoff | paid`

### System prompt 要點
- 身分：美強光廣告科技的線上詢價專員，講繁體中文，語氣專業、簡短、務實，不用表情符號。
- **絕對不可自行編造價格**，一律呼叫 `calculate_quote` 取得金額。
- 缺少必要欄位時一次只問 1–2 題，並盡量給快速選項（回傳 `quick_replies`）。
- 每個品項必須問到：服務類型、成品尺寸（寬×高、單位）、數量、材質、後加工（打孔／車邊／縫繩／裱板／上框／不需要）、是否需要施工、希望完成日。
- 超大尺寸（單邊 > 3m）、特殊材質、需現場施工或估價超出規則範圍 → 呼叫 `escalate_to_human`，不要硬報價。
- 提醒檔名規則：`公司寶號 } 材質 } 尺寸 } 數量 } 後加工`；並告知 FTP 24 小時收檔、人工審稿 09:00–21:00。

### Tools
| Tool | 作用 |
|---|---|
| `search_services(query)` | 從 `services` 查可做的服務與規格上限 |
| `calculate_quote(items[])` | 呼叫 `packages/pricing`，回傳明細與總價，寫入 `quote_requests` |
| `request_file_upload(quote_id)` | 產生 Supabase Storage 簽章上傳網址，前端切換成上傳 UI |
| `validate_filename(filename)` | 檢查檔名規則，回傳缺少的欄位 |
| `create_order(quote_id, contact)` | 建立訂單、產生 `order_no`、寄出確認信 |
| `create_payment_link(order_id)` | 產生付款連結 |
| `escalate_to_human(reason)` | 建立通知（後台 Realtime + LINE），回傳 LINE 加好友連結 |

### 報價引擎 `packages/pricing`
純函式，**不呼叫 AI**，可完整單元測試：

```ts
price = ceil(area_m2 * material_unit_price * qty)
      + sum(finishing_fees)          // 打孔、車邊、縫繩、裱板、上框…
      + setup_fee(if qty < min_qty)  // 少量開機費
      + install_fee(if needs_install)
      - volume_discount(qty | area)
```
- 每個 `services.pricing_rule` JSONB 存：`unit`（m² / 才 / 件）、`unit_price`、`min_charge`、`min_qty`、`setup_fee`、`finishing[]`、`max_width_mm`、`max_height_mm`、`tier_discounts[]`。
- **價格不公開**：`pricing_rule` 只在 server 端讀取，永不進入 client bundle；不要做公開價目表頁。
- 超出 `max_*` 或找不到規則 → 回傳 `needs_human: true`。
- 回覆客戶的金額一律標示「**此為系統初估，正式報價以審稿後回覆為準**」。

### 檔名規則檢查
規則：`公司寶號 } 材質 } 尺寸 } 數量 } 後加工`（以 `}` 分隔，共 5 段）。
`validate_filename` 需回傳：`{ ok, segments, missing[], suggestion }`；不符合時給出建議檔名，並允許客戶按一鍵套用（後端改名後存入 Storage，原始檔名一併記錄在 `uploads.original_filename`）。
Railway 的 `file-inspector` 接著檢查：檔案格式（PDF/AI/TIF/JPG）、實際尺寸 vs 訂單尺寸、解析度（大圖建議 ≥ 72dpi 原尺寸、近看物件 ≥ 150dpi）、色彩模式（建議 CMYK）、出血。有問題寫入 `uploads.issues[]` 並通知後台 + 回饋到對話。

### 訂單編號
格式 `M{YYMMDD}-{每日序號3碼}`，例：`M260806-014`。以 Postgres function + 每日序號表原子產生，避免併發重複。

### 付款
建議串接 **綠界 ECPay** 或 **藍新 NewebPay**（台灣本地、支援 ATM／超商／信用卡）。流程：`create_payment_link` → 導向金流頁 → `/api/webhooks/payment` 驗簽 → 更新 `orders.payment_status` → 寄收據信、通知 LINE。Webhook 必須驗證來源簽章並具備 idempotency（記錄 `payment_events`）。

### 轉真人 / LINE
`escalate_to_human` 寫入 `handoffs` 並：(1) Supabase Realtime 推到後台，(2) 由 Railway worker 透過 LINE Messaging API 通知公司帳號，(3) 前端顯示 LINE 加好友按鈕 `https://line.me/R/ti/p/@qif5433b` 與電話 `(02) 2995-6268`。營業時間外顯示「目前非營業時間（週一–五 09:00–22:00／週六 09:00–18:00），留下聯絡方式，上班第一時間回覆」。

## 部署

### GitHub
- `main` = production，`dev` = 整合分支，feature 分支開 PR。
- Actions：`typecheck`、`lint`、`vitest`、`playwright`（PR 必過）。
- Secrets 全部放 GitHub / Vercel / Railway 的環境變數，**不進 repo**。

### Vercel
- Root Directory `apps/web`，Framework Next.js，Build `pnpm build --filter web`。
- 環境變數見 `.env.example`（Production / Preview 分開設定；Preview 指向 Supabase 的 staging project）。
- Cron（`vercel.json`）：僅放輕量任務；重任務交給 Railway。
- 綁定網域 `mei5899.com` + `www`（www → apex 301）。舊站 PHP 路徑做 301：`/service.php → /services`、`/projects.php → /projects`、`/products.php?PID=n → /services/{slug}`（需一張對照表）、`/about.php?sn=1 → /about`、`/about.php?sn=3 → /downloads`、`/contact.php → /contact`、`/news.php → /news`。SEO 很重要，這些 301 不可省略。

### Supabase
- 兩個 project：`mei5899-prod`、`mei5899-staging`。
- `supabase db push` 套用 `supabase/schema.sql`；migration 進 repo（`supabase/migrations/`）。
- Storage buckets：`artwork`（私有，客戶印刷檔，簽章網址存取）、`public-media`（公開，作品照與服務照，走 Next Image + CDN）。
- 開啟 Point-in-time recovery；`artwork` 設定 90 天生命週期規則。

### Railway
- 一個 service 跑 `apps/worker`（Dockerfile 或 Nixpacks），`pnpm --filter worker start`。
- 需要固定 outbound IP 者（FTP）使用 Railway 靜態 IP。
- 環境變數：Supabase service role key、LINE token、SMTP、FTP 憑證。
- Healthcheck `/healthz`；設定 restart policy 與 log drain。

## 安全 / 合規
- Client 只用 `NEXT_PUBLIC_SUPABASE_ANON_KEY`；service role key 僅在 Vercel server / Railway。
- `/api/chat`、`/api/quote`、`/api/upload` 加 rate limit（IP + session，建議 Upstash Redis 或 Supabase 計數表）。
- 上傳檔案：限制 MIME 與大小（建議單檔 ≤ 500MB，超過走 FTP），簽章網址 15 分鐘過期。
- 個資：聯絡資訊與檔案僅供接單使用，需有隱私權政策頁；對話紀錄保留 12 個月。
- AI 回覆一律附「初估，正式報價以審稿為準」免責說明。

## 實作順序建議
1. Monorepo + Next.js + Tailwind + design tokens，重建首頁（Direction B）像素級。
2. Supabase schema + 服務／作品資料建檔 + 後台 CRUD。
3. `/services`、`/services/[slug]`、`/projects` 頁面。
4. `packages/pricing` + 單元測試（先寫規則，再接 AI）。
5. `/api/chat` + ChatWidget（intake → quote）。
6. 上傳 + 檔名檢查 + Railway file-inspector。
7. 訂單編號 + 通知信 + LINE 轉真人。
8. 金流。
9. 301 轉址、sitemap、結構化資料（LocalBusiness / Service）、GA4。
