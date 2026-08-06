# CLAUDE.md — 給 Claude Code 的執行指引

你要為「美強光廣告科技有限公司」建立新官網（含 AI 客服詢價接單）。

## 先讀這三份
1. `README.md` — 設計規格與 design tokens（**首頁已定案，必須像素級重建**）
2. `ARCHITECTURE.md` — 技術棧、資料模型、AI 流程、部署
3. `design/homepage-direction-b.html` — 首頁定案稿，用瀏覽器打開對照著做

## 鐵則
- `design/` 內的 HTML 是**設計參考**，不是要上線的程式碼。用 Next.js + React + Tailwind 重建，不要照抄 inline style。
- 顏色、字體、字級、間距、圓角一律取自 `README.md` 的 Design Tokens；**不要自行發明新顏色**。強調色只有洋紅 `#e6007e`。
- **價格不公開**：不做公開價目表，`pricing_rule` 只在 server 端讀取。
- **AI 不可自行報價**，一律呼叫 `calculate_quote` tool；超出規則範圍就 `escalate_to_human`。
- 圖片全是佔位框，換成真實照片前保留相同比例與圓角，不要改版面。
- 全站純繁體中文；桌機與手機都要完整（設計寬 1280，手機 breakpoint < 640）。
- 文字不得小於 12px；按鈕／可點區域手機上不得小於 44px。

## 起手式
```bash
pnpm dlx create-next-app@latest apps/web --ts --tailwind --app --no-src-dir
# 依 ARCHITECTURE.md 的 repo 結構補上 apps/worker 與 packages/{db,pricing,ui}
```
1. 先把 design tokens 寫進 `packages/ui/tokens.css` 與 Tailwind theme。
2. 重建首頁全部區塊（Header / Hero / ServiceRail / ProjectWall / Footer / ChatWidget），先用 `packages/db` 的假資料。
3. 建 Supabase schema（`supabase/schema.sql`）→ 換成真實查詢。
4. 依 `ARCHITECTURE.md` 的「實作順序建議」往下做。

## 完成定義（每個階段）
- `pnpm typecheck && pnpm lint && pnpm test` 全綠。
- 首頁與設計稿並排比對，間距與字級一致。
- Lighthouse 桌機／手機 Performance ≥ 90、Accessibility ≥ 95。
- AI 詢價 happy path 有 Playwright e2e：問答 → 取得初估 → 上傳檔案（檔名檢查）→ 產生訂單編號。

## 需要向客戶索取
- logo 向量檔（AI/SVG）與去背版本 —— 目前只有方形彩色 JPG（`assets/logo-source.jpg`）
- 各服務項目與作品的實拍照片（作品集需分類：帆布／車貼／燈箱／立體字／窗貼／旗幟／立牌／背板…）
- 各材質的計價規則（單價、最低消費、開機費、後加工費、可做尺寸上限）
- 公司沿革內容、版型下載檔案
- 金流帳號（綠界或藍新）、LINE Official Account 的 Messaging API 憑證、FTP 主機資訊
- 舊站 `products.php?PID=n` 對應新 `/services/{slug}` 的對照表（做 301 用）
