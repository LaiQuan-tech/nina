# Handoff: 美強光廣告科技 官方網站（A 版）

## Overview
新版官方網站，取代舊站 `https://www.mei5899.com/`。三個核心目標：

1. **快速看到服務項目** — 首頁即可一次瀏覽 12 個服務類別（大圖示格狀）。
2. **快速看到作品集** — 可依分類篩選的圖庫牆。
3. **AI 客服／報價精靈** — 對話式流程完成「諮詢 → 即時估價 → 收稿 → 成立訂單 → 轉真人」。

目標客群：廣告同業／同行代工、企業行銷與活動公司、選舉／政治團體。語言：繁體中文為主。文案語氣：專業可靠、直接（同業取向）。核心差異點：**出貨快、FTP 24 小時收檔**。

## About the Design Files
本包內的 `design/` 檔案是**用 HTML 製作的設計稿（design reference）**，用來表達最終的視覺與互動，**不是可直接上線的產品程式碼**。

請在目標環境（本專案建議 Next.js，見 `DEPLOYMENT.md`）中，依該環境既有的模式與元件庫**重新實作**這些設計，而不是把 HTML 直接搬進去。設計稿內的顏色、字級、間距、格線與文案應被視為規格；結構與狀態管理則依框架慣例重寫。

`design/美強光官網 A版.dc.html` 需要同資料夾的 `support.js` 才能在瀏覽器直接打開（雙擊即可預覽）。

## Fidelity
**High-fidelity（hifi）。** 顏色、字級、間距、框線、互動狀態皆為最終值，請像素級還原。所有數值列於本文件〈Design Tokens〉與各區塊說明中。

---

## Design Tokens

### Colors
| Token | Hex | 用途 |
| --- | --- | --- |
| `bg` | `#f3f2f2` | 頁面底色 |
| `surface` | `#eae9e9` | 次級區塊底色（AI 報價區、AI 對話泡泡） |
| `ink` | `#201e1d` | 主文字、所有框線與格線 |
| `brand-red` | `#ec3013` | 品牌主色（主要按鈕、強調字、同業代工整幅） |
| `brand-red-hover` | `#dd2b0f` | 主要按鈕 hover／pressed |
| `red-deep` | `#ae1800` | 段落級紅字（kicker、價格、分類標籤）— 對比足夠 |
| `red-tint` | `#ffe0d9` | 次要按鈕 hover 底色 |
| `text-muted` | `#444141` | 內文 |
| `text-dim` | `#605d5d` | 說明文字 |
| `text-faint` | `#7d7979` | 英文 kicker |
| `stripe-a` / `stripe-b` | `#d7d3d3` / `#eae9e9` | 圖片佔位斜紋 |
| `on-dark-1` | `#d7d3d3` | 深底上的內文 |
| `on-dark-2` | `#bab6b6` | 深底上的次要文字 |
| `on-dark-3` | `#9b9797` | 深底上的標籤 |
| `selection` | `#ffc4b8` | `::selection` |

**品牌 CMYK 點綴色**（取自 logo 的 CMYK「M」，只做小面積使用：色條、服務項目色塊、作品分類色點）：

| Token | Hex |
| --- | --- |
| `cmyk-c` | `#00a3e0` |
| `cmyk-m` | `#e6007e` |
| `cmyk-y` | `#f5c400` |
| `cmyk-k` | `#201e1d` |

依序循環套用（`index % 4`）。

### Typography
- 標題／內文：`Archivo`（Google Fonts，weights 400 / 500 / 600 / 800），中文 fallback `Noto Sans TC`（400 / 500 / 700 / 900）。
  `font-family: 'Archivo','Noto Sans TC',sans-serif`
- 標籤／數據／英文 kicker：`IBM Plex Mono`（400 / 500）。

| 角色 | 值 |
| --- | --- |
| H1 | `clamp(36px,6.4vw,76px)` / 800 / `line-height:1.04` / `letter-spacing:-.02em` |
| H2（區塊標題） | `clamp(26px,4vw,44px)` / 800 / `letter-spacing:-.02em` |
| 同業代工大標 | `clamp(30px,5.4vw,64px)` / 800 / `line-height:1.06` / `letter-spacing:-.025em` |
| Hero 內文 | `clamp(15px,1.5vw,18px)` / 400 / `line-height:1.7` / `text-wrap:pretty` |
| 卡片標題 | `clamp(17px,2vw,19px)` / 800 / `letter-spacing:-.01em` |
| 作品標題 | `16px` / 700 |
| 一般說明 | `13–15px` / `line-height:1.55–1.7` |
| 數據數字 | `clamp(26px,3vw,34px)` / 800 |
| 估價金額 | `clamp(28px,4.4vw,40px)` / 800 / `letter-spacing:-.02em` |
| Mono 標籤 | `10–12px` / 500 / `letter-spacing:.12em–.16em` |
| 品牌副標 | `9px` mono / `letter-spacing:.16em` |

### Geometry
- **Border radius：全站 0px。任何角都不要圓角。**
- 主框線：`2px solid #201e1d`（區塊上下界、卡片外框、按鈕外框）。
- 格線做法：格容器 `background:#201e1d; padding:2px; gap:2px`，格子本身 `background:#f3f2f2`。**不要**用每格 border（換行時會雙線）。
- 陰影：不使用。頁面靠框線與對齊組織，不靠浮起。

### Spacing
- 頁面左右內距：`clamp(16px,4vw,40px)`（全站統一）。
- 區塊上內距：`clamp(36px,5vw,52px)`；大區塊 `clamp(40px,6vw,64px)`。
- 卡片內距：`18px`；報價面板每列 `18px`。

### Responsive（RWD）
沒有 media query 斷點，全部流動式，避免斷點跳動：

| 區塊 | grid-template-columns |
| --- | --- |
| Hero | `repeat(auto-fit,minmax(min(100%,400px),1fr))` |
| 數據列 | `repeat(auto-fit,minmax(140px,1fr))` |
| 服務項目 | `repeat(auto-fill,minmax(min(100%,250px),1fr))` |
| AI 報價區 | `repeat(auto-fit,minmax(min(100%,420px),1fr))` |
| 尺寸輸入 | `repeat(auto-fit,minmax(90px,1fr))` |
| 作品牆 | `repeat(auto-fill,minmax(min(100%,260px),1fr))` |
| 同業代工三欄 | `repeat(auto-fit,minmax(min(100%,240px),1fr))` |
| 頁尾 | `repeat(auto-fit,minmax(min(100%,240px),1fr))` |

其餘規則：所有字級 `clamp()`；導覽列 `flex-wrap:wrap`（品牌 order 預設、選單 `order:2`、CTA `order:3; margin-left:auto`）；所有可點元素最小高度 **44px**；根容器 `overflow-x:hidden`；grid 子項一律 `min-width:0`。

---

## Screens / Views

單頁（one-page）＋錨點導覽。區塊順序如下。

### 0. Header（sticky）
- `position:sticky; top:0; z-index:20`，底部 `2px solid ink`，底色 `bg`。
- 內距 `14px clamp(16px,4vw,40px)`，`display:flex; flex-wrap:wrap; gap:16px; align-items:center`。
- 左：logo 圖 42×42（`object-fit:cover; object-position:50% 56%`）＋ 兩行文字：`美強光廣告科技`（800 / `clamp(16px,2.2vw,19px)`）與 `MEI CHIANG KUANG · SINCE 1998`（mono 9px / `letter-spacing:.16em` / `#7d7979`）。
- 中：選單 `服務項目`（目前頁，底線 `2px solid brand-red`）／`作品展示`／`AI 報價`／`同業代工`／`聯絡我們`，15px / 500，間距 `clamp(14px,2vw,28px)`。
- 右：CTA `AI 線上報價 →`，實心 `brand-red`、白字、`12px 18px`、600、hover `brand-red-hover`。

### 1. Hero（`#top`）
兩欄，`border-bottom:2px solid ink`；左欄 `border-right:2px solid ink`、內距 `clamp(32px,5vw,56px) clamp(16px,4vw,40px)`。
- **CMYK 色條**：四段 `width:clamp(28px,6vw,46px); height:7px`，依序 C / M / Y / K，無間隙，下方 `margin-bottom:18px`。
- Kicker：`01 — 出貨快 ／ 24 小時收檔`（mono 12px / `.16em` / `red-deep`）。
- H1：`今天發稿` / `明天上架的` / `大圖輸出廠`（第三行 `color:brand-red`），共三行硬換行。
- 內文：`大圖輸出、廣告帆布、旗幟布條、UV 直噴、衣服印花、招牌燈箱、施工安裝。FTP 24 小時接收檔案，人工審稿 09:00–21:00，同業代工歡迎詢問。`（`max-width:560px`）
- 按鈕列（`flex-wrap:wrap; gap:12px`）：主要 `開始 AI 報價精靈`（實心紅，`16px 22px`，`flex:1 1 220px`）；次要 `看服務項目`（`2px` ink 外框，hover 底 `red-tint`，`flex:1 1 160px`）。
- 右欄上：圖片佔位（`min-height:240px`，斜紋 `repeating-linear-gradient(135deg,#d7d3d3 0 8px,#eae9e9 8px 16px)`），左下白底 mono 標籤 `［ 現場照：捲對捲輸出機 ］黑白`。**真實照片請以黑白（grayscale）輸出。**
- 右欄下：四格數據，`24H / FTP 收檔`、`5M / 最大幅寬`、`27 / 年產業經驗`、`12 / 服務類別`。

### 2. 服務項目（`#service`）
- 標頭：kicker `02 — OUR SERVICE`、H2 `服務項目一覽`、右側說明 `價格為常見規格參考區間，實際以稿件、材質與後加工由 AI 報價精靈或業務確認。`（`max-width:420px`，`#605d5d`）。
- 12 張卡片。每張：上方 132px 斜紋佔位（中央 mono 標籤，內容見資料表）；下方 `18px` 內距，依序
  1. 一行：`10px` CMYK 色塊（實心方形）＋ 英文 kicker（mono 10px / `.12em` / `#7d7979`）
  2. 中文品名（800）
  3. 說明（13px / `#605d5d`）
  4. 參考價（`margin-top:auto`、`padding-top:12px`、13px / 600 / `red-deep`）
- 整張卡片 hover：底色 `surface`；點擊導向報價精靈。

服務資料（`en` / `name` / `note` / `price` / 佔位標籤）：

| en | name | note | price | slot |
| --- | --- | --- | --- | --- |
| INKJET STICKER | 大圖輸出・貼紙 | 相紙、透明貼、地貼、抗UV戶外貼 | 參考 NT$22–35 ／才 | ［ 貼紙輸出 ］ |
| FABRIC PRINT | 大圖布類輸出 | 珍珠棉布、燈箱布、網眼布垂吊 | 參考 NT$25–40 ／才 | ［ 布類垂吊 ］ |
| BANNER | 廣告帆布 | 無接縫帆布，最大幅寬 5 米 | 參考 NT$15–25 ／才 | ［ 廣告帆布 ］ |
| FLAG | 旗幟布條 | 關東旗、水滴旗、竹竿布條、掛旗 | 參考 NT$180 起 ／支 | ［ 旗幟布條 ］ |
| UV DIRECT | UV 直噴・捲板材 | 板材、捲材，可自備材料代噴 | 參考 NT$35–55 ／才 | ［ UV 直噴 ］ |
| APPAREL | 衣服・團體服 | 數位直噴、熱轉印、少量客製 | 參考 NT$180 起 ／件 | ［ 團體服 ］ |
| TRANSFER | 熱轉印・數位印花 | 全彩印花、布料轉印、少量開版 | 參考 NT$150 起 ／件 | ［ 數位印花 ］ |
| LIGHTBOX | 招牌燈箱・卡布 | 卡布燈箱、圓形燈箱、燈箱布輸出 | 需丈量報價 | ［ 卡布燈箱 ］ |
| DIMENSIONAL | 立體字・保麗龍 | 電腦割字、保麗龍字、金屬字 | 需依字高報價 | ［ 立體字 ］ |
| ACRYLIC | 壓克力製品 | 雕刻、彎折、燈板、告示牌 | 需依尺寸報價 | ［ 壓克力 ］ |
| VEHICLE | 車體廣告・車貼 | 全車包膜、局部車貼、施工到府 | 需丈量報價 | ［ 車體廣告 ］ |
| INSTALLATION | 施工系列 | 背板、窗貼、吊掛、拆除與復原 | 需現場評估 | ［ 現場施工 ］ |

### 3. AI 報價精靈（`#quote`）
整區底色 `surface`，上下 `2px solid ink`。左右兩欄，左欄 `border-right:2px solid ink`。

**左欄（說明）**：kicker `03 — AI 報價精靈`；H2 `問材質、算價格、／收稿、下單，一次做完`（兩行）；內文說明；五個步驟（每項上方 `2px solid ink` 分隔，左側 mono 編號 `brand-red` 寬 26px）：

| # | 標題 | 說明 |
| --- | --- | --- |
| 01 | 問清用途與環境 | 室內或室外、懸掛多久、有無風壓，AI 據此推薦材質與工法，避免選錯材質重做。 |
| 02 | 依尺寸數量即時估價 | 輸入寬高與數量，加選後加工，立刻給出價格區間；區間為參考值，非最終報價。 |
| 03 | 收檔與稿件檢查 | 直接拖檔上傳或給 FTP 路徑，AI 自動組好檔名並提醒解析度、出血與色彩模式。 |
| 04 | 確認訂單並產生編號 | 確認品項後生成訂單編號與預計出貨日，同步寄送確認信與 LINE 通知。 |
| 05 | 一鍵轉真人／LINE | 議價、特殊工法、急件插件，直接轉業務接手，對話紀錄與稿件一併帶過去。 |

**右欄（試算面板）**：`2px solid ink`、底 `bg`，由上到下每段以 `2px solid ink` 分隔：
1. 標題列：`QUOTE WIZARD · 試算`（mono 11px）＋ 右側 `8px` 紅方塊 ＋ `AI 線上`（12px / 600 / `red-deep`）。
2. 對話：AI 泡泡（底 `surface`，`max-width:86%`）／使用者泡泡（底 `ink`、白字，`margin-left:auto`）。示範三句：
   - AI：`您好，這次是室內還是室外用？大概要掛多久？我幫您挑材質。`
   - 使用者：`戶外，活動三天，兩塊帆布。`
   - AI：`短期戶外建議無接縫帆布＋車邊打孔。選一下材質與尺寸，我馬上算區間。`
3. 材質選鈕（單選）：`2px` ink 外框；未選 `transparent` / ink 字；選中 `ink` 底 / `bg` 字；`min-height:44px`。
4. 尺寸列：`寬 CM`、`高 CM`、`數量` 三個數字輸入（`2px` ink 外框、600、`min-height:44px`、隱藏 spinner）。
5. 後加工（多選）：同材質鈕，但選中底色為 **`brand-red`**、白字。
6. 估價區：整段 `brand-red` 底、白字。`估價區間 ／ 未稅`（mono 11px）＋金額區間＋一行明細。
7. 動作列：`上傳稿件並成立訂單`（ink 實心，`flex:1 1 200px`，hover `#444141`）／`轉真人／LINE`（`2px` ink 外框，hover `surface`）。

### 4. 作品展示（`#works`）
- 標頭：kicker `04 — PROJECTS`、H2 `作品展示`、右側 `{n} 件案例`（mono 12px）。
- 分類鈕（單選，同材質鈕樣式）：`全部`、`油性大圖輸出`、`水性大圖輸出`、`帆布`、`車貼`、`背板`、`窗貼`、`招牌燈箱`、`旗幟`、`立牌`、`立體字`、`扶輪專區`。
- 卡片：180px 斜紋佔位（左下 mono 標籤 `［ 分類 ］`）＋ `8px` CMYK 色點 ＋ 分類（mono 10px / `red-deep`）＋ 標題（16px / 700）＋ 規格（13px / `#605d5d`）。
- `全部` 顯示前 8 筆；選特定分類則顯示該分類全部。

作品資料（分類 / 標題 / 規格）：

| cat | title | meta |
| --- | --- | --- |
| 油性大圖輸出 | 連鎖藥局季節主視覺 | 2024 ／ 300×180 cm ／ 12 門市 |
| 水性大圖輸出 | 百貨櫃位室內看板 | 2025 ／ 240×120 cm ／ 裱板 |
| 帆布 | 大型活動舞台背板 | 2025 ／ 900×450 cm ／ 無接縫 |
| 車貼 | 物流車隊車體廣告 | 2024 ／ 8 台 ／ 到府施工 |
| 背板 | 記者會簽名背板 | 2025 ／ 600×250 cm ／ 含桁架 |
| 窗貼 | 門市騎樓落地窗貼 | 2024 ／ 抗UV ／ 施工含拆舊 |
| 招牌燈箱 | 街邊店卡布燈箱 | 2025 ／ 420×90 cm ／ 含丈量 |
| 旗幟 | 候選人關東旗組 | 2026 ／ 300 支 ／ 三日出貨 |
| 立牌 | 展場人形立牌 | 2025 ／ 180 cm ／ KT 裱板 |
| 立體字 | 辦公室大廳立體字 | 2024 ／ 不鏽鋼 ／ 含安裝 |
| 扶輪專區 | 社團年會布幕組 | 2025 ／ 布條＋背板 ／ 全套 |
| 帆布 | 選舉造勢場地帆布 | 2026 ／ 1200×400 cm ／ 急件 |

> 以上為示範資料，正式站應由 CMS／資料庫供給（見 `DEPLOYMENT.md` 的 `projects` 表）。

### 5. 同業代工（`#oem`）
整幅 `brand-red` 底、白字，`border-top:2px solid ink`。CMYK 色條（第四段改為 `#f3f2f2`）＋ kicker `05 — 同業代工` ＋ 大標 `檔案給我們，／剩下的交期我們負責。` ＋ 三欄（格線色 `#f3f2f2`，格內仍 `brand-red`）：
- `FTP 24 小時收檔` — 夜間發稿隔日排版，人工審稿 09:00–21:00，檔案異常主動回報。
- `同業價・不搶客` — 代工件不留品牌、不接觸您的客戶，出貨可代寄指定地址。
- `材質齊・自備代噴` — 捲材、板材、壓克力、立體字一站完成，也接受自備材料代噴。

### 6. 頁尾（`#contact`）
`ink` 底、`bg` 字，三欄：
- 品牌欄：logo 34×34 ＋ `美強光廣告科技有限公司`；`新北市三重區光復路二段 88 巷 13 號`、`(02) 2995-6268 ／ m29095878@gmail.com`；兩個外框按鈕 `LINE 加好友`、`Facebook`（hover 轉 `brand-red` 實心）。LINE 連結 `https://line.me/R/ti/p/@qif5433b`，FB `https://www.facebook.com/jfcflag`。
- 營業時間：`週一–週五 09:00–22:00`、`週六 09:00–18:00`、`人工審稿 09:00–21:00`、`FTP 24 小時接收`。
- 發稿檔名規則：`公司寶號 ｝材質 ｝尺寸 ｝數量 ｝後加工`，附註 `上傳前 AI 會自動幫您組好檔名。`

---

## Interactions & Behavior
- **導覽**：header 錨點平滑滾動至 `#service` / `#works` / `#quote` / `#oem` / `#contact`。sticky header 需設定 `scroll-margin-top`（約 96px）避免遮擋標題。
- **Hover**：實心紅按鈕 → `#dd2b0f`；外框按鈕 → 底色 `red-tint`（淺底）或 `surface`（面板內）；卡片 → 底色 `surface`。**不使用位移、縮放或陰影**。
- **Focus**：`:focus-visible { outline:2px solid #ec3013; outline-offset:2px }`，不留瀏覽器預設藍框。
- **Selection**：`::selection { background:#ffc4b8 }`。
- **報價試算**：材質單選、後加工多選、寬／高／數量為 `number` 輸入（`onChange` 時解析整數，`NaN` 視為 0）。任一變動即時重算金額區間與明細，不需按鈕。
- **作品篩選**：點分類即時過濾，同時更新 `{n} 件案例`。
- **無動畫需求**：本設計不含轉場動畫。若要加，限 120–180ms、`ease-out`、僅作用於 `background-color`。
- **RWD**：見〈Design Tokens → Responsive〉。所有互動元素 ≥44px 高。

## State Management
設計稿的本地狀態（正式站可放進 URL query 以便業務複製報價連結）：

| state | 型別 | 預設 | 說明 |
| --- | --- | --- | --- |
| `mat` | number（索引） | `0` | 選定材質 |
| `w` | number | `300` | 寬 cm |
| `h` | number | `90` | 高 cm |
| `q` | number | `2` | 數量 |
| `fins` | number[] | `[0]` | 後加工索引集合 |
| `cat` | string | `'全部'` | 作品分類 |

衍生值（每次 state 變動重算）：`range`（金額區間字串）、`detail`（明細字串）、`works`（過濾後清單）、`count`。

正式站另需：AI 對話 `messages[]`、上傳檔案清單、訂單建立狀態（idle / submitting / created / error）、以及「轉真人」的 handoff 狀態。

### 估價公式（請完整沿用）
```
才 (cai)  = max(w * h / 900, 1)            // 1 才 = 30cm × 30cm
mult      = 1 + Σ(選中後加工的加成)
base      = max(cai * unitPrice * max(q,1) * mult, 300)   // 最低消費 NT$300
low       = round(base * 0.90 / 50) * 50
high      = round(base * 1.15 / 50) * 50
顯示       = "NT${low} – NT${high}"（千分位）
明細       = "{材質} ／ {w}×{h} cm ／ {q} 件 ／ 約 {cai.toFixed(1)} 才 ／ {後加工用、連接，無則「無後加工」}"
```

材質單價（元／才）：無接縫帆布 `18`、PVC 相紙貼紙 `25`、珍珠棉布（垂吊）`30`、網眼布 `22`、UV 板材直噴 `40`。

後加工加成：車邊打孔 `+8%`、上下車套管 `+12%`、裱板 `+35%`、上霧膜 `+20%`。

> 這組數字是設計稿用的示範值。上線前務必由業務確認真實單價，並改由資料庫 `materials` / `finishings` 表供給（見 `DEPLOYMENT.md`）。

## Assets
| 檔案 | 說明 |
| --- | --- |
| `design/assets/logo-mark.png` | 公司 logo（使用者提供的 JPG 縮放為 180×180 PNG）。底圖是彩色馬賽克，導覽列以 `object-fit:cover` 裁切顯示。**建議請客戶提供去背 SVG／PNG 再替換。** |
| 圖片佔位 | 所有照片位置目前為 CSS 斜紋佔位＋mono 說明標籤。需替換為真實作品照與廠內照；hero 與內文照片依系統風格以**黑白**呈現。 |
| 圖示 | 設計稿未使用圖示。若需要，統一使用 [Lucide](https://lucide.dev)。 |
| 字型 | Google Fonts：`Archivo`、`Noto Sans TC`、`IBM Plex Mono`。 |

## Files
| 路徑 | 說明 |
| --- | --- |
| `design/美強光官網 A版.dc.html` | 完整設計稿（可直接用瀏覽器打開） |
| `design/support.js` | 設計稿執行所需的執行環境檔（僅供預覽，不要移植） |
| `design/assets/logo-mark.png` | logo |
| `DEPLOYMENT.md` | Vercel ＋ GitHub ＋ Supabase ＋ Railway 的架構、資料表、環境變數與部署步驟 |
| `CLAUDE_CODE_PROMPT.md` | 可直接貼給 Claude Code 的起始指令 |
