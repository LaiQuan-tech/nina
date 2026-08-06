// 官網內容（Direction B）。文案照抄 design_handoff_mei5899_web/README.md。
// 圖片不放這裡：圖走 site_images（Stage 2），此處只留 slot key 與佔位標籤。

// primary 的三項在平板（640–1024）就直接顯示，其餘收進漢堡；桌機五項全開。
export const NAV = [
  { href: "/#service", label: "服務項目", primary: true },
  { href: "/#works", label: "作品集", primary: true },
  { href: "/about", label: "公司簡介", primary: false },
  { href: "/downloads", label: "版型下載", primary: false },
  { href: "/#contact", label: "聯絡我們", primary: true },
] as const;

export const HERO_STATS = [
  { v: "5", u: "米", k: "超大尺寸無接縫" },
  { v: "24", u: "hr", k: "FTP 收檔不打烊" },
  { v: "15", u: "+", k: "材質與製程分類" },
] as const;

// 服務三軸切換：依用途 / 依材質 / 依製程
export const AXES = [
  { key: "use", label: "依用途" },
  { key: "material", label: "依材質" },
  { key: "process", label: "依製程" },
] as const;

export type AxisKey = (typeof AXES)[number]["key"];

export type Service = {
  slug: string;
  name: string;
  note: string;
  slot: string; // 無圖時的佔位標籤
  use: string;
  material: string;
  process: string;
};

// 八張服務卡（文案照設計稿）
export const SERVICES: Service[] = [
  {
    slug: "canvas",
    name: "廣告帆布 / 無接縫",
    note: "3米、5米超大尺寸，網布、遮光布",
    slot: "［ 帆布 ］",
    use: "戶外廣告",
    material: "帆布",
    process: "油性噴印",
  },
  {
    slug: "inkjet",
    name: "大圖輸出 · 貼紙布類",
    note: "油性、水性、乳膠噴印",
    slot: "［ 大圖輸出 ］",
    use: "戶外廣告",
    material: "貼紙布類",
    process: "水性噴印",
  },
  {
    slug: "uv",
    name: "UV 直噴",
    note: "捲材、板材，自備材料代噴",
    slot: "［ UV 直噴 ］",
    use: "店面招牌",
    material: "板材",
    process: "UV 直噴",
  },
  {
    slug: "vehicle",
    name: "車體廣告",
    note: "車貼、車體包膜、窗貼",
    slot: "［ 車體 ］",
    use: "車輛",
    material: "貼紙布類",
    process: "電腦割字",
  },
  {
    slug: "lightbox",
    name: "招牌燈箱",
    note: "卡布燈箱、圓形燈箱、施工",
    slot: "［ 燈箱 ］",
    use: "店面招牌",
    material: "軟膜",
    process: "施工安裝",
  },
  {
    slug: "letter",
    name: "立體字 / 割字",
    note: "保麗龍、壓克力、電腦割字",
    slot: "［ 立體字 ］",
    use: "店面招牌",
    material: "壓克力·保麗龍",
    process: "電腦割字",
  },
  {
    slug: "apparel",
    name: "衣服 · 團體服",
    note: "熱轉印、數位印花、網版印刷",
    slot: "［ 團體服 ］",
    use: "團體服飾",
    material: "布料",
    process: "熱轉印",
  },
  {
    slug: "flag",
    name: "旗幟布條 / 選舉",
    note: "旗幟配件、選舉廣告專區",
    slot: "［ 旗幟 ］",
    use: "活動宣傳",
    material: "帆布",
    process: "水性噴印",
  },
];

export type Work = {
  id: string;
  title: string;
  cat: string;
  span: "2x2" | "1x1" | "2x1";
  slot: string;
};

// 作品牆四格（版面比照設計稿：大格 2×2、兩格 1×1、末格橫幅 2×1）
export const WORKS: Work[] = [
  { id: "work.1", title: "大樓帆布", cat: "帆布", span: "2x2", slot: "［ 大樓帆布 ］" },
  { id: "work.2", title: "車體廣告", cat: "車貼", span: "1x1", slot: "［ 車體 ］" },
  { id: "work.3", title: "立體字招牌", cat: "立體字", span: "1x1", slot: "［ 立體字 ］" },
  { id: "work.4", title: "卡布燈箱", cat: "燈箱", span: "2x1", slot: "［ 卡布燈箱 ］" },
];

export const WORK_CATS = ["全部", "帆布", "車貼", "燈箱", "立體字"] as const;

// 頁尾 / 聯絡資訊
export const CONTACT = {
  company: "美強光廣告科技有限公司",
  address: "新北市三重區光復路二段 88 巷 13 號",
  phone: "(02) 2995-6268",
  phoneHref: "tel:+886229956268",
  email: "m29095878@gmail.com",
  line: "https://line.me/R/ti/p/@qif5433b",
  facebook: "https://www.facebook.com/jfcflag",
  hours: "週一–五 09:00–22:00 ｜ 週六 09:00–18:00",
  hoursNote: "人工審稿 09:00–21:00 ｜ FTP 24 小時收檔",
  fileRule: "公司寶號 ｝材質 ｝尺寸 ｝數量 ｝後加工",
};

// 開啟 AI 詢價視窗用的全域事件（讓 server component 的按鈕也能觸發）
export const CHAT_OPEN_EVENT = "mei:chat-open";
