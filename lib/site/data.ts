// 官網內容資料（來源：design_handoff_mei5899_site/README.md 規格表，文案一字不改）
// 正式站可改由 CMS／資料庫供給，先以常數維護。

export const CMYK = ["#00a3e0", "#e6007e", "#f5c400", "#201e1d"] as const;

export type Material = { name: string; unit: number }; // unit = 元／才
export const MATS: Material[] = [
  { name: "無接縫帆布", unit: 18 },
  { name: "PVC 相紙貼紙", unit: 25 },
  { name: "珍珠棉布（垂吊）", unit: 30 },
  { name: "網眼布", unit: 22 },
  { name: "UV 板材直噴", unit: 40 },
];

export type Finishing = { name: string; add: number }; // add = 加成比例
export const FINS: Finishing[] = [
  { name: "車邊打孔", add: 0.08 },
  { name: "上下車套管", add: 0.12 },
  { name: "裱板", add: 0.35 },
  { name: "上霧膜", add: 0.2 },
];

export type Service = { name: string; en: string; note: string; price: string; slot: string; c: string };
export const SERVICES: Service[] = [
  { name: "大圖輸出・貼紙", en: "INKJET STICKER", note: "相紙、透明貼、地貼、抗UV戶外貼", price: "參考 NT$22–35 ／才", slot: "［ 貼紙輸出 ］" },
  { name: "大圖布類輸出", en: "FABRIC PRINT", note: "珍珠棉布、燈箱布、網眼布垂吊", price: "參考 NT$25–40 ／才", slot: "［ 布類垂吊 ］" },
  { name: "廣告帆布", en: "BANNER", note: "無接縫帆布，最大幅寬 5 米", price: "參考 NT$15–25 ／才", slot: "［ 廣告帆布 ］" },
  { name: "旗幟布條", en: "FLAG", note: "關東旗、水滴旗、竹竿布條、掛旗", price: "參考 NT$180 起 ／支", slot: "［ 旗幟布條 ］" },
  { name: "UV 直噴・捲板材", en: "UV DIRECT", note: "板材、捲材，可自備材料代噴", price: "參考 NT$35–55 ／才", slot: "［ UV 直噴 ］" },
  { name: "衣服・團體服", en: "APPAREL", note: "數位直噴、熱轉印、少量客製", price: "參考 NT$180 起 ／件", slot: "［ 團體服 ］" },
  { name: "熱轉印・數位印花", en: "TRANSFER", note: "全彩印花、布料轉印、少量開版", price: "參考 NT$150 起 ／件", slot: "［ 數位印花 ］" },
  { name: "招牌燈箱・卡布", en: "LIGHTBOX", note: "卡布燈箱、圓形燈箱、燈箱布輸出", price: "需丈量報價", slot: "［ 卡布燈箱 ］" },
  { name: "立體字・保麗龍", en: "DIMENSIONAL", note: "電腦割字、保麗龍字、金屬字", price: "需依字高報價", slot: "［ 立體字 ］" },
  { name: "壓克力製品", en: "ACRYLIC", note: "雕刻、彎折、燈板、告示牌", price: "需依尺寸報價", slot: "［ 壓克力 ］" },
  { name: "車體廣告・車貼", en: "VEHICLE", note: "全車包膜、局部車貼、施工到府", price: "需丈量報價", slot: "［ 車體廣告 ］" },
  { name: "施工系列", en: "INSTALLATION", note: "背板、窗貼、吊掛、拆除與復原", price: "需現場評估", slot: "［ 現場施工 ］" },
].map((s, i) => ({ ...s, c: CMYK[i % 4] }));

export type Step = { n: string; t: string; d: string };
export const STEPS: Step[] = [
  { n: "01", t: "問清用途與環境", d: "室內或室外、懸掛多久、有無風壓，AI 據此推薦材質與工法，避免選錯材質重做。" },
  { n: "02", t: "依尺寸數量即時估價", d: "輸入寬高與數量，加選後加工，立刻給出價格區間；區間為參考值，非最終報價。" },
  { n: "03", t: "收檔與稿件檢查", d: "直接拖檔上傳或給 FTP 路徑，AI 自動組好檔名並提醒解析度、出血與色彩模式。" },
  { n: "04", t: "確認訂單並產生編號", d: "確認品項後生成訂單編號與預計出貨日，同步寄送確認信與 LINE 通知。" },
  { n: "05", t: "一鍵轉真人／LINE", d: "議價、特殊工法、急件插件，直接轉業務接手，對話紀錄與稿件一併帶過去。" },
];

export type Work = { cat: string; title: string; meta: string; slot: string; c: string };
export const WORKS: Work[] = [
  { cat: "油性大圖輸出", title: "連鎖藥局季節主視覺", meta: "2024 ／ 300×180 cm ／ 12 門市" },
  { cat: "水性大圖輸出", title: "百貨櫃位室內看板", meta: "2025 ／ 240×120 cm ／ 裱板" },
  { cat: "帆布", title: "大型活動舞台背板", meta: "2025 ／ 900×450 cm ／ 無接縫" },
  { cat: "車貼", title: "物流車隊車體廣告", meta: "2024 ／ 8 台 ／ 到府施工" },
  { cat: "背板", title: "記者會簽名背板", meta: "2025 ／ 600×250 cm ／ 含桁架" },
  { cat: "窗貼", title: "門市騎樓落地窗貼", meta: "2024 ／ 抗UV ／ 施工含拆舊" },
  { cat: "招牌燈箱", title: "街邊店卡布燈箱", meta: "2025 ／ 420×90 cm ／ 含丈量" },
  { cat: "旗幟", title: "候選人關東旗組", meta: "2026 ／ 300 支 ／ 三日出貨" },
  { cat: "立牌", title: "展場人形立牌", meta: "2025 ／ 180 cm ／ KT 裱板" },
  { cat: "立體字", title: "辦公室大廳立體字", meta: "2024 ／ 不鏽鋼 ／ 含安裝" },
  { cat: "扶輪專區", title: "社團年會布幕組", meta: "2025 ／ 布條＋背板 ／ 全套" },
  { cat: "帆布", title: "選舉造勢場地帆布", meta: "2026 ／ 1200×400 cm ／ 急件" },
].map((w, i) => ({ ...w, slot: `［ ${w.cat} ］`, c: CMYK[i % 4] }));

export const CATS = [
  "全部",
  "油性大圖輸出",
  "水性大圖輸出",
  "帆布",
  "車貼",
  "背板",
  "窗貼",
  "招牌燈箱",
  "旗幟",
  "立牌",
  "立體字",
  "扶輪專區",
];

// 頁尾 / 聯絡資訊
export const CONTACT = {
  company: "美強光廣告科技有限公司",
  address: "新北市三重區光復路二段 88 巷 13 號",
  phone: "(02) 2995-6268",
  email: "m29095878@gmail.com",
  line: "https://line.me/R/ti/p/@qif5433b",
  facebook: "https://www.facebook.com/jfcflag",
  hours: ["週一–週五 09:00–22:00", "週六 09:00–18:00", "人工審稿 09:00–21:00", "FTP 24 小時接收"],
  fileRule: "公司寶號 ｝材質 ｝尺寸 ｝數量 ｝後加工",
};
