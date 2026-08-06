// 站圖版面契約：slot_key 是前台取圖的固定 key，換圖／換來源都不必改程式。
// 這個檔案刻意零相依（不 import supabase / next），這樣 scripts/ 的批次腳本也能直接用。

export type Aspect = "3:4" | "4:3" | "16:9" | "16:10";

export type ImageSlot = {
  slotKey: string;
  groupKey: "hero" | "service" | "work";
  label: string;
  alt: string;
  aspect: Aspect;
  sort: number;
  /** prompt 主體；共用的風格描述由 buildPrompt() 接在後面 */
  subject: string;
};

// 全部 prompt 共用的風格尾巴。
// ★ 明確禁止文字最關鍵 —— 中文字在影像模型上幾乎必然生成亂碼。
export const STYLE_SUFFIX = `台灣新北市三重區的廣告輸出工廠／施工現場實景，紀實攝影風格，自然光，
色調偏暖的米白灰與墨黑（#f7f5f2 / #181513 系），畫面乾淨、構圖留白。
畫面中不得出現任何文字、招牌字樣、商標、浮水印、可辨識人臉。
photorealistic, 35mm, shallow depth of field, no text, no watermark, no logo, no readable face.`;

export function buildPrompt(subject: string): string {
  return `${subject}\n\n${STYLE_SUFFIX}`;
}

export const IMAGE_SLOTS: ImageSlot[] = [
  {
    slotKey: "hero.main",
    groupKey: "hero",
    label: "主視覺（桌機・直式）",
    alt: "工人在大樓外牆高處拉起巨幅廣告帆布的施工現場",
    aspect: "3:4",
    sort: 0,
    subject: "大型戶外廣告帆布施工現場：工人在高處拉起一張巨幅廣告帆布，仰角構圖，天空為背景，直式構圖。",
  },
  {
    slotKey: "hero.mobile",
    groupKey: "hero",
    label: "主視覺（手機・橫式）",
    alt: "大樓外牆巨幅廣告帆布施工現場",
    aspect: "16:9",
    sort: 1,
    subject: "大型戶外廣告帆布施工現場：工人在高處拉起一張巨幅廣告帆布，橫式構圖，主體置中偏上，天空為背景。",
  },

  {
    slotKey: "service.canvas",
    groupKey: "service",
    label: "廣告帆布 / 無接縫",
    alt: "大型無接縫廣告帆布捲材特寫",
    aspect: "4:3",
    sort: 10,
    subject: "大型無接縫廣告帆布捲材特寫：捲軸與布面織紋，側光打亮布料質地，工廠內景。",
  },
  {
    slotKey: "service.inkjet",
    groupKey: "service",
    label: "大圖輸出 · 貼紙布類",
    alt: "大圖輸出機噴頭正在噴印的近拍",
    aspect: "4:3",
    sort: 11,
    subject: "大圖輸出機噴頭正在噴印彩色圖像的近拍：噴頭滑軌、墨滴與滾筒，淺景深。",
  },
  {
    slotKey: "service.uv",
    groupKey: "service",
    label: "UV 直噴",
    alt: "UV 平台印表機在板材上直噴",
    aspect: "4:3",
    sort: 12,
    subject: "UV 平台印表機正在板材上直噴：機頭下方的紫外線固化燈發出藍紫色光，板材平放於機台。",
  },
  {
    slotKey: "service.vehicle",
    groupKey: "service",
    label: "車體廣告",
    alt: "師傅用刮刀將車體貼紙壓平",
    aspect: "4:3",
    sort: 13,
    subject: "廂型車車身正在貼上大面積車體貼紙：師傅用刮刀由中央往外壓平，手部與刮刀特寫，車身反光。",
  },
  {
    slotKey: "service.lightbox",
    groupKey: "service",
    label: "招牌燈箱",
    alt: "夜間店面卡布燈箱發光的立面近拍",
    aspect: "4:3",
    sort: 14,
    subject: "夜間店面卡布燈箱發光的立面近拍：鋁製外框與柔光布面，燈光均勻透出，街道夜景為背景。",
  },
  {
    slotKey: "service.letter",
    groupKey: "service",
    label: "立體字 / 割字",
    alt: "牆面上的不鏽鋼立體字側光特寫",
    aspect: "4:3",
    sort: 15,
    subject: "牆面上的不鏽鋼與壓克力立體字側光特寫：強調字體厚度、邊緣切面與投射在牆上的陰影。",
  },
  {
    slotKey: "service.apparel",
    groupKey: "service",
    label: "衣服 · 團體服",
    alt: "熱轉印機正在壓製 T 恤",
    aspect: "4:3",
    sort: 16,
    subject: "熱轉印機正在壓製素色 T 恤：機台壓板落下，旁邊疊放整落素色團體服，工作台俯角。",
  },
  {
    slotKey: "service.flag",
    groupKey: "service",
    label: "旗幟布條 / 選舉",
    alt: "一排關東旗在戶外風中飄動",
    aspect: "4:3",
    sort: 17,
    subject: "一排關東旗在戶外風中飄動：旗面為純色無圖案，淺景深，背景是模糊的街道。",
  },

  {
    slotKey: "work.1",
    groupKey: "work",
    label: "大樓帆布",
    alt: "都市大樓外牆巨幅廣告帆布",
    aspect: "16:10",
    sort: 20,
    subject: "都市大樓外牆巨幅廣告帆布遠景：仰角拍攝整面外牆，帆布面為純色無圖案，藍天為背景。",
  },
  {
    slotKey: "work.2",
    groupKey: "work",
    label: "車體廣告",
    alt: "完成貼膜的廂型車側面",
    aspect: "16:10",
    sort: 21,
    subject: "完成車體貼膜的廂型車側面 45 度角：車身貼膜平整無氣泡，貼膜為純色無圖案，戶外停車場。",
  },
  {
    slotKey: "work.3",
    groupKey: "work",
    label: "立體字招牌",
    alt: "店面外牆的立體字招牌",
    aspect: "16:10",
    sort: 22,
    subject: "店面外牆的立體字招牌完成品：金屬立體字裝在木質或水泥牆面上，字體為無法辨識的抽象幾何形狀，日光下的斜側光。",
  },
  {
    slotKey: "work.4",
    groupKey: "work",
    label: "卡布燈箱",
    alt: "街邊店面的橫向卡布燈箱夜景",
    aspect: "16:10",
    sort: 23,
    subject: "街邊店面的橫向卡布燈箱夜景：長條形燈箱均勻發光，燈箱面為純色無圖案，街道夜色與行人剪影為背景。",
  },
];
