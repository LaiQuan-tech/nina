# 貼給 Claude Code 的起始指令

把整個 `design_handoff_mei5899_site/` 資料夾放進你的工作目錄，然後貼下面這段：

---

我要建一個公司官網：**美強光廣告科技有限公司**（大圖輸出／廣告帆布／旗幟／UV 直噴／衣服印花／招牌燈箱／施工安裝），取代舊站 mei5899.com。

請先完整讀這三份文件，它們是唯一的規格來源：

- `design_handoff_mei5899_site/README.md` — 設計規格（顏色、字級、間距、每個區塊的版面與文案、估價公式、狀態）
- `design_handoff_mei5899_site/DEPLOYMENT.md` — 架構、repo 結構、Supabase 資料表、環境變數、API 合約、部署步驟
- `design_handoff_mei5899_site/design/美強光官網 A版.dc.html` — 設計稿本體，**請用瀏覽器打開對照**（同目錄的 `support.js` 是預覽用的執行環境，不要移植）

技術堆疊已決定：**GitHub ＋ Vercel（Next.js 15 App Router / TypeScript / Tailwind v4）＋ Supabase（Postgres・Storage・Auth）＋ Railway（背景 worker、LINE webhook）**，monorepo ＋ pnpm workspaces，照 `DEPLOYMENT.md` 的結構建。

實作要求：

1. **視覺 100% 還原**設計稿。這是 hifi 稿：零圓角、2px 實線框、無陰影、色票與字級照 README 的 tokens。Tailwind 請把 tokens 寫進 `@theme`，不要自己另創顏色或圓角。若使用任何元件庫，必須覆寫掉它的圓角與陰影預設。
2. **RWD 照設計稿的做法**：沒有斷點，全部用 `clamp()` 字級 ＋ `repeat(auto-fit/auto-fill, minmax(min(100%, Npx), 1fr))` 流動網格；所有可點元素最小 44px 高。
3. **估價公式**放在 `packages/pricing`，web 與 worker 共用；前端即時預覽、`/api/quote` 伺服器端重算，前端傳來的價格一律不信。公式與單價見 README〈估價公式〉。
4. **AI 報價精靈**用 Vercel AI SDK ＋ Anthropic，五段流程（問清用途 → 即時估價 → 收稿 → 產生訂單編號 → 轉真人／LINE）以 tool calling 實作：`estimate_price`、`recommend_material`、`create_order`、`handoff_to_human`。價格只能從 tool 回來，不能由模型自行推算。
5. **內容全部資料庫驅動**（services / projects / materials / finishings），並寫一份 seed script 把 README 表格裡的示範資料灌進去。
6. **圖片位置目前是斜紋佔位**，請保留佔位元件（含 mono 說明標籤）並讓它在沒有圖片時 fallback，等客戶給照片後直接替換。hero 與內文照片以黑白呈現。
7. 繁體中文為主，文案照 README 一字不改。

請先產出實作計畫與 repo 骨架給我確認，再開始寫程式。第一階段只做：首頁六個區塊（Header / Hero / 服務項目 / AI 報價精靈 / 作品展示 / 同業代工 / 頁尾）＋ `/api/quote` ＋ Supabase schema ＋ seed。AI 對話、上傳、訂單、LINE 留到第二階段。

---

## 待客戶補件（實作前先要到會省事）

- **去背 logo**（SVG 最佳，或透明 PNG）。目前只有彩色馬賽克底的方形 JPG，導覽列是裁切顯示。
- **真實作品照與廠內照**，對應設計稿每個斜紋佔位的說明標籤。
- **材質單價與後加工加成的真實數字**（設計稿是示範值）。
- 是否公開單價：目前設定為「只顯示參考區間」，實際由 AI／業務確認。
