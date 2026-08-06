# Nina — 美強光廣告科技官網 · 印刷檔線上收稿 · 自動建工單

**官網**（`/`）：依 `design_handoff_mei5899_web`（Direction B）建置。Header／Hero／服務項目三軸橫向捲動列／深色作品牆／頁尾 ＋ 右下角 AI 詢價浮動視窗。**價格不公開**，一律走 AI 對話詢價。

**收稿**（`/upload`）：填聯絡資訊（姓名/Email/手機）→ 上傳印刷檔 → 系統檢查檔名格式 → 格式錯 AI 引導改名（**不收檔**）→ 格式正確才收檔（存 Supabase Storage）。客戶只看到「送件成功／失敗」，**看不到工單**。可一次上傳多個檔。

**管理後台**（`/admin`，多帳號密碼登入）：看每個收稿案件的聯絡資訊、完整對話紀錄、收件狀態，以及收件成功後自動建立的工單（可列印）。工單為內部文件，僅後台可見。

## 官網（前台）

- 路由群組 `app/(site)/`：`layout.tsx` 內含 SiteHeader / SiteFooter / ChatWidget；頁面有 `/`、`/about`、`/downloads`、`/upload`。
- 元件在 `components/mei/`，內容常數在 `lib/site/content.ts`（服務 8 項、作品 4 件、聯絡資訊、導覽）。
- 樣式：`app/globals.css` 第 337 行之後的 `.mei` 區塊。設計 token 一律 `--mei-*`，**全部限縮在 `.mei` scope 之下**，與後台 `.adm-*`、工單 `.wo-*` 互不影響；**不使用 `!important`**。
  - 米白 `#f7f5f2`／墨黑 `#181513`／唯一強調色洋紅 `#e6007e`；Noto Serif TC（標題）+ Noto Sans TC + JetBrains Mono。
  - RWD 手機優先，斷點 `<640` 手機（漢堡右滑抽屜）／`640–1024` 平板（nav 只露 3 項）／`>1024` 桌機（nav 5 項，內容 max-width 1280）。
  - ⚠️ 區塊樣式**不要用 `padding` 簡寫**，會把 `.mei-pad` 的左右內距洗掉；只寫 `padding-top` / `padding-bottom`。
- 圖片位走 `components/mei/Slot.tsx`：有圖顯示圖，沒圖 fallback 成條紋佔位＋mono 標籤。目前 13 個圖位（hero 1＋服務 8＋作品 4）皆為佔位，待接 `site_images`。
- Logo：`public/logo-mei.png`（去背 500×500 PNG）。原始檔在 `design_handoff_mei5899_web/assets/logo-source.jpg`（2048×2048，**不要直接開，先 `sips -Z 1024` 產縮圖**）。

## 客戶／後台流程

- 收稿頁：`app/(site)/upload/page.tsx` → `components/intake/IntakeFlow.tsx`（ContactGate 聯絡表單 → ChatUpload 上傳）。案件與對話存 `intake_sessions`。
- 收檔：`app/api/upload/route.ts` 伺服器端再驗檔名 → 存 storage → 建工單（關聯 `session_id`）→ 更新案件狀態；回客戶**只有** `{ok, fileName}`。
- 後台：`/admin`（總覽）、`/admin/cases`（案件列表）、`/admin/cases/[id]`（聯絡卡＋對話＋工單清單）、`/admin/orders/[id]`（可列印工單）、`/admin/users`（管理員帳號）。
- 認證：`lib/adminAuth.ts`（HMAC 簽章 cookie，Edge-safe）+ `lib/adminPassword.ts`（pbkdf2，Node）+ `middleware.ts` 閘門。多帳號在 `admin_users` 表；`node scripts/createAdmin.mjs <email> <password> [name]` 建帳號。

## 檔名命名規則

正確範例：
```
069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M.ai
```

用底線 `_` 分三段：
1. `069871` — 6 碼流水號
2. `{(月匯)百陽廣告}` — `{(付款別)客戶名稱}`
3. `(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M` — 內容尾段（無分隔，靠有序 regex 逐段消耗）：
   類別`(78)` · 日期`20260625` · 案主`WG` · 案名`星雲AI地板` · 尺寸`90x100cm` · 材質`pvc+霧` · 數量`-1` · **商品編號`CCPVC720N10M`**

**驗證是 deterministic**：`lib/filename/parser.ts` 是唯一真相，AI（Gemini）只把錯誤潤飾成親切引導。upload API **伺服器端會再驗一次**，永不信任前端。
要改命名規則只需改 `lib/filename/segments.ts` 這張設定表。

## 商品名稱來自 ERP 主檔

工單「商品名稱」由檔名末段的**商品編號**查 `erp_product_master`（來源：城盛ERP規劃.xlsx，699 商品）帶出：
`CCPVC720N10M` →（最長前綴相符）→ `CCPVC720N` → **高遮PVC+霧**。
查不到 → 仍收檔，但工單標「⚠ 非標準商品，請人工確認」（soft）。比對邏輯在 DB function `match_product()`。

## 技術

- Next.js 14 App Router + `@supabase/supabase-js`
- Gemini `gemini-3.5-flash`（原生 REST，無 SDK；僅用於潤飾引導文字，未設 key 時用內建純文字 fallback）
- Supabase：`work_orders`（工單，RLS 開、service_role 專用）+ `print-files` 私有 bucket + ERP 參照表（`erp_product_master` / `erp_processing_items` / `erp_main_products` / `erp_sub_products`）

## 開發

```bash
npm install
cp .env.example .env.local   # 填 Supabase + Gemini
npm run test:parser          # 檔名 parser 單元測試
npm run dev
```

## 資料庫 / 主檔匯入

```bash
# 建表：在 Supabase 執行 supabase/schema.sql 與 supabase/erp_schema.sql
node scripts/importErp.mjs    # 把 supabase/erp_data/*.json 匯入參照表（冪等）
```

## 環境變數

| 變數 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 專案 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role（僅 server，勿加 `NEXT_PUBLIC_`） |
| `GEMINI_API_KEY` | Gemini（選配，僅潤飾引導文字） |
| `ADMIN_SESSION_SECRET` | 後台 HMAC 簽 cookie 密鑰（`openssl rand -hex 32`） |
