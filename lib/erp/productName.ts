// ERP 建單自動補值 —— 從 ERP 主檔的商品名稱（name）與商品碼（code）推斷
// 護貝膜／油墨類別／列印方式／版材。純函式、零外部依賴（不碰 DB、不呼叫任何 API）。
//
// 每欄回 { value, source, confidence }；規則掃不到 → 回 null，交給人工選、絕不用猜的塞值
// （尤其 ink_type：sub_name 沒中白名單就絕對不能寫，否則會印出「馬克杯」這種非油墨類別字樣）。

export type Confidence = "high" | "medium";
export type FieldSource = "erp_name" | "erp_code_suffix" | "erp_sub_name";

export type FieldGuess = {
  value: string;
  source: FieldSource;
  confidence: Confidence;
};

// 不含／無／自備 → 該段落是「排除」語意，掃描時要跳過（例「不含冷裱」不能被當成護貝膜命中）。
const NEG_RE = /不含|無|自備/;

// 護貝膜對照：長詞先比對，避免「霧」把「細霧」誤判成「霧」。
const LAM_TOKENS: Array<[string, string[]]> = [
  ["細霧", ["細霧膜", "細霧"]],
  ["亮", ["亮膜", "亮"]],
  ["霧", ["霧膜", "霧"]],
];

// 版材關鍵字（沿用任務規格逐字列出）。
const PLATE_KEYS = [
  "合成板",
  "合成版",
  "豪卡板",
  "中空板",
  "發泡板",
  "強光板",
  "PP板",
  "壓克力板",
  "珍珠板",
];

// 列印方式對照。
const METHOD_TOKENS: Array<[string, string[]]> = [
  ["熱昇華", ["熱昇華"]],
  ["網版印刷", ["網印", "網版"]],
  ["UV直噴", ["UV直噴", "直噴"]],
  ["疊印", ["疊噴", "疊印"]],
  ["雙噴", ["雙噴"]],
  ["單噴", ["單噴"]],
  ["轉印", ["轉印"]],
];

const DPI_RE = /(\d{3,4})dpi/i;

// 油墨類別白名單——erp_sub_products.name 共 159 種相異值，僅這 5 種是真的油墨類別，
// 其餘（帆布／旗幟／T恤…）是子分類名稱，絕不可寫進 ink_type。
export const INK_WHITELIST = [
  "室內水性輸出",
  "戶外油性輸出",
  "EPSON環保墨輸出",
  "乳膠環保墨輸出",
  "油性布類輸出",
] as const;

function splitPlusSegments(name: string): string[] {
  return String(name ?? "").split("+");
}

function hasParen(seg: string): boolean {
  return /[()（）]/.test(seg);
}

/** 版材段落正規化：統一大小寫與常見錯別字，不改變語意。 */
function normalizePlateSegment(seg: string): string {
  return seg.replace(/(\d+)\s*CM\b/gi, "$1cm").replace(/合成版/g, "合成板");
}

/**
 * 護貝膜（亮／霧／細霧）。
 * 1) 先掃 name 的 "+" 分段，跳過含「不含/無/自備」的段，段等於或以 token 結尾 → 命中(high)。
 * 2) name 掃不到才看 code 尾碼 /(NN|N|L)$/ → 細霧/霧/亮(medium)。
 * 兩者衝突時 name 勝（因為找到 name 命中就直接回傳，不會再看 code）。
 */
export function deriveLamination(name: string, code: string): FieldGuess | null {
  const segments = splitPlusSegments(name);
  for (const raw of segments) {
    const seg = raw.trim();
    if (!seg || NEG_RE.test(seg)) continue;
    for (const [canonical, variants] of LAM_TOKENS) {
      for (const variant of variants) {
        if (seg === variant || seg.endsWith(variant)) {
          return { value: canonical, source: "erp_name", confidence: "high" };
        }
      }
    }
  }

  const m = /(NN|N|L)$/.exec(String(code ?? "").trim());
  if (m) {
    const suffix = m[1];
    const canonical = suffix === "NN" ? "細霧" : suffix === "N" ? "霧" : "亮";
    return { value: canonical, source: "erp_code_suffix", confidence: "medium" };
  }
  return null;
}

/**
 * 油墨類別：sub_name（match_product_v2 join 出的 erp_sub_products.name）落在白名單才寫入(high)。
 * 不在白名單 → 回 null（呼叫端把 sub_name 放進 erp_enrich.family 當 Phase 2 下拉建議，
 * 絕不寫進 ink_type，否則會印出「馬克杯」這類非油墨類別字樣）。
 */
export function deriveInkType(subName: string | null | undefined): FieldGuess | null {
  const s = (subName ?? "").trim();
  if (!s) return null;
  if ((INK_WHITELIST as readonly string[]).includes(s)) {
    return { value: s, source: "erp_sub_name", confidence: "high" };
  }
  return null;
}

/**
 * 列印方式：掃全 name 的 METHOD token，命中恰好 1 種才採用(medium)；
 * 有 dpi（例 720dpi）就附加成「雙噴 720dpi」。零命中或 ≥2 種 → 留空（避免瞎猜）。
 */
export function derivePrintMethod(name: string): FieldGuess | null {
  const n = String(name ?? "");
  const hits: string[] = [];
  for (const [canonical, variants] of METHOD_TOKENS) {
    if (variants.some((v) => n.includes(v))) hits.push(canonical);
  }
  if (hits.length !== 1) return null;
  let value = hits[0];
  const dpi = DPI_RE.exec(n);
  if (dpi) value = `${value} ${dpi[1]}dpi`;
  return { value, source: "erp_name", confidence: "medium" };
}

/**
 * 版材：掃 "+" 分段，只接受 index>0 的段、不含括號、長度 ≤12（否則會抓到
 * 「UV直噴5MM透明壓克力板(彩色」這類過長雜訊段）。命中回整段（含厚度，例「5mm豪卡板」），
 * 並正規化 1CM→1cm、合成版→合成板。
 */
export function derivePlateMaterial(name: string): FieldGuess | null {
  const segments = splitPlusSegments(name);
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i].trim();
    if (!seg || hasParen(seg) || seg.length > 12) continue;
    const hit = PLATE_KEYS.find((k) => seg.includes(k));
    if (hit) {
      return { value: normalizePlateSegment(seg), source: "erp_name", confidence: "medium" };
    }
  }
  return null;
}

// 註：material（材質）刻意不在這裡做——工單一律直接用檔名解析出的 material_raw
// （檔名真相，例 "pvc+霧"），查無 fallback product_name，不從 ERP 猜。
// machine_model（機台型號）四表皆無資料，一律留空手填，同樣不在這裡處理。
