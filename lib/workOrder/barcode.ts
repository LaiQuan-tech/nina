/**
 * 工單條碼 codec —— Code 128 Subset C。純函式、零依賴。
 *
 * 用途：條碼印在實體工單上，現場用掃描槍掃描回報生產進度
 * （掃描事件如何變成「製作中／已完成」見 ../workOrderStations.ts）。
 *
 * payload 固定 12 碼純數字：民國日期 7 碼(YYYMMDD) + 序號 4 碼 + 站別 1 碼，
 * 走 Code128-C（每兩碼編一個 symbol，比 Subset B 窄，框窄也掃得到）。
 *
 * Pattern 表來源：標準 Code128 symbol table —— 103 個資料值(0-102)
 * + 3 個 Start 值(103/104/105：Start A/B/C) + 1 個 Stop 值(106) = 107 筆。
 * 一般符號為 3 bar + 3 space 交替、6 段寬度、和固定為 11；
 * 唯獨 Stop 是 4 bar + 3 space、7 段寬度、和為 13（"2331112"）。
 * 下表逐筆換算自開源條碼庫 JsBarcode（MIT license）原始碼
 * src/barcodes/CODE128/constants.js 的 BARS[]
 *（該陣列以十進位數字字面量儲存 11/13 位元的 bar=1/space=0 點陣，
 * 例如 11011001100 → 展開成寬度序列 2,1,2,2,2,2 → "212222"），
 * 並在下方用程式跑過一次 run-length 轉換 + 總和檢查，非手抄。
 *
 * 這兩支模組（本檔 + workOrderStations.ts）錯了會印出「看起來正常但掃不到」
 * 的條碼，所以下面在模組載入時就對 pattern 表做自我檢查（自檢斷言），
 * 一旦有筆資料被打錯，import 階段就會直接拋錯，而不是等到現場掃不到才發現。
 */

export type StationKey = "output" | "process" | "accessory" | "packed" | "delivered";

// 站別對照表（順序固定）：output=1, process=2, accessory=3, packed=4, delivered=5。
export const STATION_LABELS: Record<StationKey, string> = {
  output: "輸出",
  process: "加工",
  accessory: "配件",
  packed: "包裝完成",
  delivered: "送貨簽收",
};

const STATION_ORDER: StationKey[] = ["output", "process", "accessory", "packed", "delivered"];

// station → 條碼裡的站別碼（1..5，字元），與 STATION_ORDER 的順序一一對應。
const STATION_DIGIT: Record<StationKey, string> = {
  output: "1",
  process: "2",
  accessory: "3",
  packed: "4",
  delivered: "5",
};

// order_no 形如 CK1150923-0001：CK + 民國YYYMMDD 7 碼 + "-" + 序號 4 碼。
// \d{4}$ 是固定寬度錨定在字串結尾，序號一旦破 9999（5 碼以上）就配不上，順帶擋掉。
const ORDER_NO_RE = /^CK(\d{7})-(\d{4})$/;

// --- Code128 標準 symbol pattern 表（索引 = symbol 值 0..106，見檔頭來源說明）---
const PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_C = 105; // symbol 值：Start Code C
const STOP = 106; // symbol 值：Stop

// --- 自檢斷言：跑一次就能抓到打錯的 pattern 表（見檔頭說明）---
//
// 註：任務規格原寫「PATTERNS.length === 108」，但查標準 Code128 symbol table
// （並以 JsBarcode 原始碼交叉驗證、其註解明寫 "CODE128 includes 107 symbols"）
// 正確筆數是 107（103 資料值 + 3 個 Start + 1 個 Stop），沒有第 108 筆。
// 108 會多一筆本表用不到、也查無標準定義的「幽靈 pattern」，等於自己編一筆
// 湊數字，牴觸「不要自己編」的要求；因此這裡改成對「107」做自我檢查 ——
// 這才是會被下面 encode/decode 實際用到、真正決定條碼掃不掃得到的數字。
if (PATTERNS.length !== 107) {
  throw new Error(`code128 PATTERNS 長度應為 107（標準 Code128 symbol 數），實際 ${PATTERNS.length}`);
}
for (let i = 0; i < 106; i++) {
  const p = PATTERNS[i];
  const digitSum = p.split("").reduce((a, c) => a + Number(c), 0);
  if (p.length !== 6 || digitSum !== 11) {
    throw new Error(`code128 PATTERNS[${i}] 格式錯誤：應為 6 碼、寬度和為 11，實際 "${p}"（和 ${digitSum}）`);
  }
}
if (PATTERNS[STOP] !== "2331112") {
  throw new Error(`code128 STOP pattern 應為 "2331112"，實際 "${PATTERNS[STOP]}"`);
}

/**
 * 將 order_no + 站別編成條碼 payload（12 碼數字）與人眼可讀的 caption。
 * order_no 格式不符 → null（呼叫端印「條碼不可用」）。
 */
export function encodeBarcode(
  orderNo: string,
  station: StationKey
): { payload: string; caption: string } | null {
  const m = ORDER_NO_RE.exec(orderNo);
  if (!m) return null;
  const date7 = m[1];
  const serial = m[2];
  const payload = `${date7}${serial}${STATION_DIGIT[station]}`;
  return { payload, caption: `${orderNo} · ${STATION_LABELS[station]}` };
}

/** 把掃描槍讀到的 12 碼 payload 還原成 order_no + 站別。格式不符或站別碼不在 1..5 → null。 */
export function decodeBarcode(payload: string): { orderNo: string; station: StationKey } | null {
  if (!/^\d{12}$/.test(payload)) return null;
  const date7 = payload.slice(0, 7);
  const serial = payload.slice(7, 11);
  const stationDigit = payload[11];
  const station = STATION_ORDER.find((key) => STATION_DIGIT[key] === stationDigit);
  if (!station) return null;
  return { orderNo: `CK${date7}-${serial}`, station };
}

/** Code128-C checksum：(105 + Σ v_i × i) mod 103，i 從 1 起算（Start 不乘權重）。 */
export function code128cChecksum(pairs: number[]): number {
  let sum = START_C;
  pairs.forEach((v, idx) => {
    sum += v * (idx + 1);
  });
  return sum % 103;
}

/**
 * 把 payload（偶數長度純數字）展開成完整 bar/space 交替寬度序列
 * （Start C + 每兩碼一組的 symbol + checksum + Stop），第一段必為 bar。
 * 回傳值只給 code128cSvg 畫圖用，不做量測；量測請用回傳陣列自行加總。
 */
export function code128cModules(payload: string): number[] {
  if (!/^\d+$/.test(payload) || payload.length % 2 !== 0) {
    throw new Error(`code128cModules: payload 必須是偶數長度純數字，收到 "${payload}"`);
  }
  const pairs: number[] = [];
  for (let i = 0; i < payload.length; i += 2) {
    pairs.push(Number(payload.slice(i, i + 2)));
  }
  const checksum = code128cChecksum(pairs);
  const symbolValues = [START_C, ...pairs, checksum, STOP];

  const modules: number[] = [];
  for (const value of symbolValues) {
    const pattern = PATTERNS[value];
    for (const ch of pattern) {
      modules.push(Number(ch));
    }
  }
  return modules;
}

/**
 * 產生條碼的 inline SVG 字串。quiet zone 用 SVG 內留白畫出來（不是靠 CSS padding，
 * 貼到任何版面都不會被外部樣式吃掉），viewBox 單位是 mm，方便直接印在工單上對版。
 */
export function code128cSvg(
  payload: string,
  opt?: { moduleMm?: number; heightMm?: number; quietModules?: number }
): string {
  const moduleMm = opt?.moduleMm ?? 0.33;
  const heightMm = opt?.heightMm ?? 12;
  const quietModules = opt?.quietModules ?? 10;

  const modules = code128cModules(payload);
  const barsWidthMm = modules.reduce((a, b) => a + b, 0) * moduleMm;
  const quietWidthMm = quietModules * moduleMm;
  const totalWidthMm = barsWidthMm + quietWidthMm * 2;

  const rects: string[] = [];
  let x = quietWidthMm;
  let isBar = true; // Code128 每個 symbol 一律以 bar 起頭，段落彼此銜接下第一段必為 bar
  for (const width of modules) {
    const wMm = width * moduleMm;
    if (isBar) {
      rects.push(`<rect x="${x.toFixed(3)}" y="0" width="${wMm.toFixed(3)}" height="${heightMm}" fill="#000"/>`);
    }
    x += wMm;
    isBar = !isBar;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidthMm.toFixed(3)} ${heightMm}" ` +
    `width="${totalWidthMm.toFixed(3)}mm" height="${heightMm}mm" shape-rendering="crispEdges">` +
    `<rect x="0" y="0" width="${totalWidthMm.toFixed(3)}" height="${heightMm}" fill="#fff"/>` +
    rects.join("") +
    `</svg>`
  );
}
