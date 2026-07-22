// ── 命名規則設定（唯一「設定檔」）──
// 要調整檔名命名規則 = 改這張表；parser.ts 的引擎不動。
//
// 範例正確檔名：
//   069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M.ai
//
// 用底線 "_" 切成 3 段：
//   [1] 069871                     → serial（6 碼流水號）
//   [2] {(月匯)百陽廣告}            → 客戶區塊 {(付款別)客戶名稱}
//   [3] (78)20260625WG...N10M      → 內容尾段（無分隔，靠下方有序規則逐段消耗游標）

// 第 1 段：6 碼數字流水號
export const SERIAL_RE = /^\d{6}$/;

// 第 2 段：{(付款別)客戶名稱}，例 {(月匯)百陽廣告}
export const CUSTOMER_RE = /^\{\((.+?)\)(.+?)\}$/;

// 允許的副檔名（小寫）
export const EXT_ALLOW = ["ai", "pdf", "eps", "psd", "tif", "tiff", "jpg", "jpeg", "png"];

// 第 3 段：有序擷取器。每個 re 以 ^ 錨定「當前游標」，配到就切掉往前走；
// 哪個 re 在游標處配不上 → 就是那段錯，精準回報。
// design 用 lookahead 尋「尺寸」當右邊界、material 用 lookahead 尋「-數量」當右邊界，
// 這樣即使中間全部黏在一起也能精準切段。
export const TAIL_RULES = [
  { key: "category", label: "類別編號", re: /^\((\d+)\)/, example: "(78)" },
  { key: "date", label: "日期", re: /^(\d{8})/, example: "20260625（YYYYMMDD）" },
  { key: "owner", label: "案主代碼", re: /^([A-Za-z]+)/, example: "WG（英文字母）" },
  { key: "design", label: "案名", re: /^(.+?)(?=\d+x\d+cm)/i, example: "星雲AI地板" },
  { key: "size", label: "成品尺寸", re: /^(\d+)x(\d+)(cm)/i, example: "90x100cm" },
  { key: "material", label: "商品材質", re: /^(.+?)(?=-\d)/, example: "pvc+霧" },
  { key: "totalQty", label: "總數量", re: /^-(\d+)/, example: "-1" },
  { key: "spec", label: "材料規格", re: /^([A-Za-z0-9]+)$/, example: "CCPVC720N10M" },
] as const;
