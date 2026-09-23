# Nina — 美強光廣告科技 官網 · AI 收稿 · 自動工單 · 客戶知識後台

Next.js 14 App Router + Supabase + Gemini。

> ## ⚠️ 先讀這段：哪些是正式功能，哪些是 Demo 雛形
>
> 這個 repo 有兩塊性質完全不同的東西，**對外說明或做簡報時不要混為一談**：
>
> | 區塊 | 狀態 | 資料 |
> |---|---|---|
> | 官網、會員、AI 收稿、檔名驗證、自動工單、ERP 主檔比對 | **正式功能** | 真實資料 |
> | 客戶知識庫、報價、追蹤回訪、後台 AI 小幫手 | **Demo 雛形** | **全虛構**，`is_demo=true` 隔離 |
>
> Demo 那塊的設計目的寫在 [`docs/plans/2026-08-06-demo-customer-knowledge-admin-design.md`](docs/plans/2026-08-06-demo-customer-knowledge-admin-design.md)：
> 「先建立可操作的 Demo 雛形，以全虛構資料展示未來正式 CRM 的使用方式」，
> 並明確排除「真正的 AI 摘要生成、外部通知或 **ERP 寫入**」。
>
> **ERP 是唯讀比對，不是接管。** 主檔匯進 Supabase 供 `match_product` 查詢商品名稱，
> 系統不回寫任何資料到 ERP。

## 正式功能

### 官網（前台）
路由群組 `app/(site)/`：`/`、`/about`、`/downloads`、`/upload`、`/login`、`/register`、`/member`。
**價格不公開**，一律走右下角 AI 詢價浮動視窗。設計依 `design_handoff_mei5899_web`（Direction B）。

樣式在 `app/globals.css` 的 `.mei` 區塊，token 一律 `--mei-*` 並**全部限縮在 `.mei` scope 下**，
與後台 `.adm-*`、工單 `.wo-*` 互不影響；**不使用 `!important`**。
⚠️ 區塊樣式**不要用 `padding` 簡寫**，會把 `.mei-pad` 的左右內距洗掉，只寫 `padding-top` / `padding-bottom`。

圖片位走 `components/mei/Slot.tsx`（無圖時 fallback 成條紋佔位）。共 14 個圖位，由 `site_images` 讀取，
管理員可在 `/admin/site-images` 上傳替換（JPG/PNG/WebP，單檔 4 MB）。
`npm run seed:site-images` 冪等上架 `public/generated/site/` 的初始圖。

### 會員（客戶帳號）
**登入帳號是手機號碼，不是 Email** —— 本專案沒有任何寄信管道，見 `supabase/member_schema.sql` 開頭說明。
`api/member/*`：register / login / session / set-password / quick-start。

### AI 收稿與檔名驗證
`/upload` → `components/intake/IntakeFlow.tsx`（ContactGate 聯絡表單 → ChatUpload 上傳）。
填聯絡資訊 → 上傳 → 檢查檔名 → **格式錯不收檔**、AI 引導改名 → 格式正確才存進 Supabase Storage。
客戶只看到「送件成功／失敗」，**看不到工單**。案件與對話存 `intake_sessions`。

**驗證是 deterministic**：`lib/filename/parser.ts` 是唯一真相，Gemini 只把錯誤潤飾成親切引導。
`app/api/upload/route.ts` **伺服器端會再驗一次，永不信任前端**。
要改命名規則只需改 `lib/filename/segments.ts` 這張設定表。

正確檔名範例：
```
069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M
```
底線分三段：6 碼流水號 ／ `{(付款別)客戶名稱}` ／ 內容尾段（類別·日期·案主·案名·尺寸·材質·數量·**商品編號**，靠有序 regex 逐段消耗）。

### 自動工單與 ERP 主檔比對
收檔成功 → 建工單（`work_orders`，單號由 `gen_work_order_no` 產生）→ 可在 `/admin/orders/[id]` 列印。
工單「商品名稱」由檔名末段的商品編號查 ERP 主檔帶出，走 `match_product` RPC（先完全相符，否則**最長前綴相符**）：
`CCPVC720N10M` → `CCPVC720N` → **高遮PVC+霧**。
查不到 → 仍收檔，工單標「⚠ 非標準商品，請人工確認」（soft fail）。

ERP 參照資料共 **1,039 筆**（來源：城盛ERP規劃.xlsx），以 `node scripts/importErp.mjs` 冪等匯入：

| 資料表 | 筆數 |
|---|---|
| `erp_product_master` 商品主檔 | 699 |
| `erp_sub_products` 子產品 | 161 |
| `erp_processing_items` 加工項目 | 149 |
| `erp_main_products` 主產品 | 30 |

### 管理後台
`/admin`（總覽）、`/admin/cases`、`/admin/cases/[id]`（聯絡卡＋對話＋工單）、`/admin/orders/[id]`（可列印工單）、
`/admin/site-images`、`/admin/users`。

認證：`lib/adminAuth.ts`（HMAC 簽章 cookie，Edge-safe）+ `lib/adminPassword.ts`（pbkdf2，Node）+ `middleware.ts` 閘門。
多帳號存 `admin_users`；`node scripts/createAdmin.mjs <email> <password> [name]` 建帳號。

## Demo 雛形（全虛構資料）

**這一塊是給簡報與教育訓練看的，不是正式營運資料。**

- `/admin/customers`、`/admin/customers/[id]` — 客戶知識庫（`customer_profiles`：產業、分級、標籤、偏好材質／商品／加工）
- `/admin/knowledge` — 服務知識庫
- `/admin/followups` — 追蹤與回訪（`customer_followups`）
- 報價（`quotes`）
- **後台 AI 小幫手**（右下角，`lib/admin/adminAssistant.ts`）——自然語言查總覽／客戶／回訪／報價／工單／材料用量

AI 小幫手的安全邊界（見 `docs/plans/2026-08-06-admin-ai-assistant-design.md`）：
**只讀 `is_demo=true` 的資料**、不接受 SQL、不執行任意查詢、不修改任何資料；
報表先由白名單查詢器產生再交給 Gemini 潤飾，Gemini 失敗時仍回固定格式報表。

Demo 資料管理：
```bash
npm run seed:demo-crm     # 建立 10 位虛構客戶（固定 UUID，冪等）
npm run clean:demo-crm    # 只刪 is_demo=true，依相依順序逆序移除
```
⚠️ 虛構資料用明顯的測試電話與 `example.com` Email，公司與人名皆為虛構。
前台會員登入、快速入會與紀錄頁**都排除 `is_demo=true`**。

## 技術

- Next.js 14 App Router + `@supabase/supabase-js`
- Gemini（原生 REST，無 SDK）——僅用於**潤飾**引導文字與報表，未設 key 時退化為內建純文字，流程不中斷
- Supabase：12 張表 + `print-files` 私有 bucket，RLS 開、service_role 專用

## 開發

```bash
npm install
cp .env.example .env.local   # 填 Supabase + Gemini + 兩組 session secret
npm run test                 # 全部單元測試（10 個測試檔）
npm run test:parser          # 只跑檔名 parser
npm run dev
```

## 資料庫

在 Supabase 依序執行：`supabase/schema.sql` → `erp_schema.sql` → `site_schema.sql` →
`member_schema.sql` → `admin_schema.sql` → `customer_knowledge_schema.sql` → `migrations/*.sql` → `work_order_v2_schema.sql`（工單改版 v2：明細/掃描事件/ERP 補值 RPC，冪等）。

```bash
node scripts/importErp.mjs    # 匯入 ERP 參照表（冪等）
npm run seed:site-images      # 上架官網 14 張圖（冪等）
```

## 環境變數

| 變數 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 前端 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role，**僅 server**，勿加 `NEXT_PUBLIC_` |
| `GEMINI_API_KEY` | 選配，僅潤飾文字 |
| `ADMIN_SESSION_SECRET` / `MEMBER_SESSION_SECRET` | 後台與會員 session 簽章（`openssl rand -hex 32`） |
