# Handoff：美強光廣告科技 官方新網站（Direction B）

## Overview
為「美強光廣告科技有限公司」（mei5899.com，新北三重，大圖輸出／廣告帆布／UV 直噴／燈箱招牌／立體字／團體服）打造的新官網。舊站為傳統 PHP 目錄式網站，資訊密度高但難以快速找到服務與作品。

新站三個目標：
1. **快速看到服務項目** — 服務以視覺卡片牆呈現，可依「用途／材質／製程」三種軸切換。
2. **快速看到作品集** — 分類 + 滿版照片牆。
3. **AI 客服接單** — 一條對話流程完成：規格問答 → 即時報價 → 檔案上傳（含檔名規則檢查）→ 確認訂單並產生訂單編號 → 轉真人／LINE → 付款。**價格不公開，一律走 AI 詢價。**

語言：純繁體中文。裝置：桌機與手機都要完整。

## About the Design Files
本 bundle 內 `design/` 的 HTML 檔是**設計參考稿（design reference）**，用 HTML 手工做的高保真原型，用來定義視覺與行為，**不是要直接上線的產品程式碼**。

任務是：**在目標技術棧（Next.js + React）中重建這些設計**，沿用該專案的元件慣例；不要把這些 HTML 原封不動搬上去。設計稿使用純 inline style（因為原型環境需要串流渲染），實作時請改為 Tailwind CSS 或 CSS Modules。

- `design/homepage-direction-b.html` — **本次採用的首頁定案（Direction B）**，可直接用瀏覽器打開對照。
- `design/homepage-directions.dc.html` — 原始設計檔，內含 Direction A（深色、AI 輸入框置中）與 Direction B。A 版**不採用**，僅作為視覺語彙參考。

`ARCHITECTURE.md` = 技術棧、資料模型、API、AI 報價流程、部署（Vercel / GitHub / Supabase / Railway）。
`supabase/schema.sql` = 可直接執行的資料庫 schema。
`.env.example` = 所有環境變數。

## Fidelity
**High-fidelity（hifi）**。首頁的顏色、字體、字級、間距、圓角、陰影、hover 狀態都已定案，請像素級重建。
其他頁面（服務項目、作品集、公司簡介、聯絡我們、AI 對話全頁版）尚未出設計稿 —— 請**沿用本文件的 Design Tokens 與首頁既有的版面語彙**去延伸，規格見下方「Screens / Views」。

圖片全部是條紋佔位框（`repeating-linear-gradient`），中央或左下有等寬字說明該放什麼照片。實作時換成真實照片（由客戶提供），並保留同樣的長寬比與圓角。

---

## Design Tokens

### Colors
| Token | Hex | 用途 |
|---|---|---|
| `ink` | `#181513` | 主文字、深色區塊底、主要按鈕底 |
| `ink-deep` | `#121110` | Direction A 底色（備用） |
| `paper` | `#f7f5f2` | 頁面底色、深色區塊上的文字 |
| `paper-2` | `#f1eee9` | 次級卡片／對話泡泡底 |
| `line` | `#e2ddd6` | 淺色分隔線、卡片邊框 |
| `line-2` | `#d6d0c8` | 次級按鈕／chip 邊框 |
| `line-dark` | `#332e29` | 深色區塊上的邊框 |
| `line-dark-2` | `#262320` | 深色區塊分隔線 |
| `text-2` | `#5c554e` | 次級文字（淺底） |
| `text-3` | `#7a736c` / `#8f877f` | 三級文字、mono 標籤（淺底） |
| `text-dark-2` | `#a8a099` | 次級文字（深底） |
| `text-dark-3` | `#6b645c` | 佔位說明文字（深底） |
| `cmyk-c` | `#29abe2` | 品牌三色條（青） |
| `cmyk-m` | `#e6007e` | 品牌三色條（洋紅）＝**唯一強調色**：link hover、句點、送出鈕、線上狀態點 |
| `cmyk-y` | `#ffe600` | 品牌三色條（黃） |

取自公司 logo（CMYK 彩虹「M」）。**強調色只用洋紅 `#e6007e`**，青與黃只出現在三色條與少數狀態點，不要拿來做大面積色塊。

### Typography
- 標題：`'Noto Serif TC', serif` — 900（h1／區塊大標）、700（數字、次級標題）
- 內文／UI：`'Noto Sans TC', sans-serif` — 400 / 500 / 700
- 標籤與代碼感文字：`'JetBrains Mono', monospace` — 400 / 500，`letter-spacing: .14em ~ .24em`，多為大寫英文（`OUR SERVICE`、`MEI5899 · 廣告科技`、佔位說明）

Google Fonts：
```
https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700;900&family=Noto+Sans+TC:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap
```

字級（桌機，px）：h1 66 / line-height 1.16 / letter-spacing .02em；區塊大標 32；卡片標題 16；內文 16 / line-height 2；次級 13.5–15；小字 12.5–13；mono 標籤 9–11。
手機：h1 降至 36–40，區塊大標 24，內文 15 / line-height 1.9。**任何文字不得小於 12px。**

### Spacing / Radius / Shadow
- 頁面設計寬度 **1280px**（`.mei-page`），內容左右 padding 40px（手機 20px）。
- 區塊垂直節奏：56–76px（手機 40–48px）。
- 圓角：卡片 10px、圖片 8–10px、按鈕 8px、chip / pill 99px、AI 視窗 16px、對話泡泡 12px（尾端角 3px）。
- 陰影：AI 浮動視窗 `0 24px 60px -20px rgba(0,0,0,.35)`。頁面其他地方**不用陰影**，用 1px 線分隔。
- 邊框：淺底 `1px solid #e2ddd6`；按鈕外框 `1.5px solid #181513`；「看全部」卡片 `1.5px dashed #d6d0c8`。

---

## Screens / Views

### 1. 首頁 `/`（已定案，見 `design/homepage-direction-b.html`）

**Header**（sticky，高 66px，`border-bottom:1px solid #e2ddd6`，底 `#f7f5f2`）
- 左：三色條（三個 `7×26px`、`border-radius:99px`、間距 3px、依序 `#29abe2 / #e6007e / #ffe600`）＋「美強光」（Noto Serif TC 900 / 19px / ls .06em）＋下方 mono 小字「MEI5899 · 廣告科技」（9px / ls .24em / `#8f877f`）。實作時左側整組換成真實 logo SVG。
- 右：nav（14px / 500，間距 34px）服務項目、作品集、公司簡介、版型下載、聯絡我們；最右 CTA「線上詢價」（`1.5px solid #181513`，padding 10px 18px，radius 99px，700）。hover：文字轉 `#e6007e`；CTA hover 反白（底 `#181513`、字 `#f7f5f2`）。
- 手機：漢堡選單，抽屜由右滑入；CTA 常駐在 header 右側。

**Hero**（`grid-template-columns: 1fr 1.05fr`，min-height 520px）
- 左欄 padding `76px 48px 60px`，垂直居中，gap 26px：
  - mono 標籤「● FTP 24 小時收檔」（11px / ls .18em / `#8f877f`，圓點 `#e6007e`）
  - h1「你的招牌，<br>從這裡開始<span 洋紅>。</span>」
  - 內文（max-width 440px）「二十餘年大圖輸出經驗，機台自有、材質齊全。<br>報價、審稿、施工一次到位。」
  - 按鈕列：主「找 AI 幫我報價」（底 `#181513`、字 `#f7f5f2`、700 / 15px、padding 15px 26px、radius 8px）→ 開啟 AI 對話；次「看作品集」（`1.5px solid #d6d0c8`）→ `/projects`
  - 三組數據（上方 1px 分隔線，gap 40px）：`5米` 超大尺寸無接縫｜`24hr` FTP 收檔不打烊｜`15+` 材質與製程分類。數字 Noto Serif TC 700 / 30px，單位 16px，說明 12px `#8f877f`
- 右欄：滿版主視覺（現場施工／大圖近拍，直式），左下 mono 佔位說明。手機時移到 h1 上方，高 260px。

**服務項目區**（padding `56px 0 60px`，上方 1px 線）
- 標頭：mono `OUR SERVICE` + 大標「你要做的是哪一種？」；右側三個切換 chip：**依用途**（active：底 `#181513`、字白、700）／依材質／依製程（`1px solid #d6d0c8`、字 `#5c554e`）。切換時卡片重新分組（見下方 State）。
- 卡片橫向捲動列（`overflow-x:auto`，gap 14px，左右 padding 40px）：每張 `flex:0 0 232px` —— 圖 180px（radius 10px，條紋佔位）＋標題 16px/700 ＋說明 12.5px `#7a736c` / line-height 1.7。
- 尾端一張虛線卡「看全部服務項目 / 15+ 分類 →」連到 `/services`。
- 卡片 hover：圖片 `transform: scale(1.03)`（250ms ease-out，圖片容器 `overflow:hidden`），標題轉 `#e6007e`。
- 八張卡（文案照抄）：
  1. 廣告帆布 / 無接縫 — 3米、5米超大尺寸，網布、遮光布
  2. 大圖輸出 · 貼紙布類 — 油性、水性、乳膠噴印
  3. UV 直噴 — 捲材、板材，自備材料代噴
  4. 車體廣告 — 車貼、車體包膜、窗貼
  5. 招牌燈箱 — 卡布燈箱、圓形燈箱、施工
  6. 立體字 / 割字 — 保麗龍、壓克力、電腦割字
  7. 衣服 · 團體服 — 熱轉印、數位印花、網版印刷
  8. 旗幟布條 / 選舉 — 旗幟配件、選舉廣告專區

**近期作品區**（底色 `#181513`，padding `56px 40px 64px`，gap 24px）
- 標頭：大標「近期作品」（白）；右側篩選 chip：全部（底白字黑 700）／帆布／車貼／燈箱／立體字（`1px solid #332e29`、字 `#a8a099`）。
- 照片牆：`grid-template-columns: repeat(4,1fr)`、`grid-auto-rows:180px`、gap 10px。第一格 `span 2 / span 2`（大樓帆布），接兩格 1×1，再一格 `span 2`（卡布燈箱）。radius 8px。左下 mono 標題。
- 手機：2 欄，大格 `span 2`。
- 點擊 → lightbox（深色遮罩 `rgba(0,0,0,.88)`，左右鍵切換，Esc 關閉）。

**Footer**（padding `28px 40px 36px`，13px `#7a736c`，兩端對齊）
- 左：`新北市三重區光復路二段 88 巷 13 號 · (02) 2995-6268 · m29095878@gmail.com`
- 右：`週一–五 09:00–22:00 ｜ 週六 09:00–18:00`
- 正式版 footer 請補：LINE QR（`https://line.me/R/ti/p/@qif5433b`）、Facebook（`https://www.facebook.com/jfcflag`）、版型下載、檔名規則提醒「檔名請標示 —— 公司寶號 } 材質 } 尺寸 } 數量 } 後加工」、人工審稿 09:00–21:00 / FTP 24 小時。

**AI 浮動客服視窗**（`position: fixed; right:28px; bottom:28px; width:340px`，radius 16px，`box-shadow:0 24px 60px -20px rgba(0,0,0,.35)`，底白）
- 標題列：底 `#181513`、字 `#f7f5f2`，三色條小版（`4×16px`）＋「美強光 AI 詢價」14px/700 ＋右側 mono `ONLINE` 10px `#a8a099`。
- 訊息區 padding 16px、gap 12px：AI 泡泡靠左（底 `#f1eee9`、radius `12px 12px 12px 3px`）、使用者泡泡靠右（底 `#181513`、字 `#f7f5f2`、radius `12px 12px 3px 12px`），13.5px / line-height 1.75，max-width 80–88%。
- 快速回覆 chip：`1px solid #d6d0c8`、12.5px、radius 99px。
- 輸入列：上方 1px 線，左側 placeholder「輸入訊息…」13px `#a49c94`，右側 `30×30px` 圓形送出鈕 `#e6007e`。
- 收合狀態：`60×60px` 圓形按鈕（底 `#181513`，內含三色條），右下角；有未讀時右上 `#e6007e` 圓點。
- 手機：展開後全螢幕 sheet（由下滑入，200ms ease-out）。
- 示範對話（可作為第一輪腳本）：AI「您好！要做什麼尺寸的輸出？也可以直接把檔案丟給我。」→ 使用者「3×6 米帆布，2 張」→ AI「好的，無接縫還是拼接？需要四周打孔嗎？」＋ chip「無接縫」「要打孔」。

### 2. 服務項目 `/services`（待設計，沿用首頁語彙）
大圖卡片牆 + 分類篩選。頂部同 hero 的三軸切換（用途／材質／製程）＋關鍵字搜尋。卡片 `repeat(3,1fr)`（手機 1 欄），圖 16:10、radius 10px。每張卡片底部一顆文字鈕「問這項的價格 →」，點擊直接開啟 AI 視窗並預填該服務。單一服務頁 `/services/[slug]`：規格表（材質、可做尺寸上限、後加工選項、工期）＋相關作品＋「立即詢價」。**不顯示任何價格**。

### 3. 作品集 `/projects`（待設計）
分類 tab（沿用舊站分類：油性大圖輸出、水性大圖輸出、帆布、車貼、背板、窗貼、招牌燈箱、旗幟、立牌、立體字、扶輪專區）＋滿版照片牆（masonry，2/3/4 欄 responsive）。點擊進 lightbox 或 `/projects/[id]`：大圖、客戶類型、材質、尺寸、工期、施工照。

### 4. 公司簡介 `/about`、聯絡我們 `/contact`、版型下載 `/downloads`
- about：公司介紹 + 沿革時間軸（沿用舊站 about.php?sn=1,2）＋設備／機台清單。
- contact：地址、電話、Email、LINE QR、Google Map 嵌入、營業時間、FTP 收檔說明、檔名規則。
- downloads：公版／版型檔下載列表（沿用 about.php?sn=3）。

---

## Interactions & Behavior
- Header sticky，向下捲動 > 80px 時加 `box-shadow:0 1px 0 #e2ddd6`。
- 所有 hover 轉場 `150ms ease-out`；卡片圖片 scale `250ms ease-out`。
- 進場：區塊首次進入視窗時 `opacity 0→1 / translateY 12px→0`，320ms ease-out，`prefers-reduced-motion` 時停用。
- 服務三軸切換與作品分類篩選：**純前端切換，不重新載入**，狀態寫入 URL query（`?by=material`、`?cat=canvas`）以便分享。
- 橫向捲動列：桌機顯示左右箭頭鈕（hover 時淡入），手機用原生滑動 + `scroll-snap-type: x mandatory`。
- AI 視窗開啟時鎖背景捲動（手機）；對話內容存 `localStorage`（key `mei_chat_session`）以便重整後接續。
- Loading：AI 回覆時顯示三點跳動；卡片與圖片用 skeleton（`#f1eee9` 底 + shimmer）。
- Error：AI 服務失敗時泡泡顯示「連線不穩，已為您保留對話。可直接加 LINE 由專員接手 →」並附 LINE 按鈕。
- 表單驗證：電話（台灣手機／市話格式）、Email、檔案大小上限、**檔名規則**（見 ARCHITECTURE.md）。
- Responsive breakpoints：`< 640` 手機、`640–1024` 平板（2 欄）、`> 1024` 桌機（設計寬 1280，容器 max-width 1280 置中）。

## State Management
前端只需輕量狀態（React `useState` + URL query），不需要 Redux：
- `serviceAxis`: `'use' | 'material' | 'process'` — 服務分組軸
- `projectCategory`: string — 作品分類
- `chatOpen`: boolean，`chatMessages`: Message[]，`chatStage`: `'intake' | 'quote' | 'upload' | 'confirm' | 'handoff' | 'paid'`
- `quoteDraft`: 見 ARCHITECTURE.md 的 `quote_requests` 結構
- `lightbox`: `{ open, items, index }`

資料取得：服務、作品、消息全部來自 Supabase（server component 直接查詢，ISR 60s）。AI 對話走 `/api/chat`（streaming）。

## Assets
- Logo：`assets/logo-source.jpg`（客戶提供的 CMYK「M」logo，方形彩色底）。**需要向客戶索取向量檔（AI/SVG）與去背版本**；header 目前用三色條 + 中文字暫代。
- 作品照與服務照：**尚未提供**，設計稿內全為條紋佔位。舊站 `https://www.mei5899.com/userfiles/images/` 下有服務 ICON 圖與作品照可先抓取過渡使用（需客戶確認版權）。
- 字型：Google Fonts（Noto Serif TC / Noto Sans TC / JetBrains Mono），無授權問題。
- 圖示：建議用 Lucide（線性、與 mono 標籤調性相符）。設計稿刻意不用任何插畫式 SVG。

## Files
```
design_handoff_mei5899_web/
├── README.md                            ← 本文件（設計規格）
├── ARCHITECTURE.md                      ← 技術棧 / 資料模型 / API / 部署
├── CLAUDE.md                            ← 給 Claude Code 的執行指引
├── .env.example
├── supabase/schema.sql
├── assets/logo-source.jpg
└── design/
    ├── homepage-direction-b.html        ← 定案首頁（瀏覽器可直開）
    └── homepage-directions.dc.html      ← 原始設計檔（含未採用的 A 版）
```
