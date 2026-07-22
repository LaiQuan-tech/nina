# Nina — 印刷檔線上收稿 · 檔名檢查 · 自動建工單

客戶上傳印刷檔 → 系統檢查檔名格式 → 格式錯就引導客戶改檔名（**不收檔**）→ 格式正確才收檔（存 Supabase Storage）並自動用檔名拆解產生一張工單（存 DB、畫面可列印）。

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
