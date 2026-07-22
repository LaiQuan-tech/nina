import type { Segments, ParseResult, SegErr } from "./types";
import { TAIL_RULES, SERIAL_RE, CUSTOMER_RE, EXT_ALLOW } from "./segments";
import { productNameFor } from "./materialMap";

type PushFn = (key: string, label: string, expected: string, got: string) => void;

/**
 * 檔名驗證引擎 —— 全站唯一真相。
 * 回傳每段拆解結果 + 缺哪段 / 哪段錯（errors[]，供前端與 AI 產生引導）。
 * 純函式、零依賴，可離線單元測試，也在 upload route 伺服器端再跑一次。
 */
export function parseFilename(name: string): ParseResult {
  const errors: SegErr[] = [];
  const seg: Partial<Segments> = {};
  const push: PushFn = (key, label, expected, got) =>
    errors.push({
      key,
      label,
      expected,
      got,
      message: `「${label}」不正確：應為 ${expected}，目前是「${got || "缺少"}」`,
    });

  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    push("empty", "檔名", "完整檔名", "");
    return { ok: false, raw: trimmed, segments: seg, errors };
  }

  // 副檔名
  const dot = trimmed.lastIndexOf(".");
  const ext = dot > 0 ? trimmed.slice(dot + 1).toLowerCase() : "";
  const stem = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  if (EXT_ALLOW.includes(ext)) seg.ext = ext;
  else push("ext", "副檔名", EXT_ALLOW.join("/"), ext);

  // 三段（流水號_客戶_內容）
  const parts = stem.split("_");
  if (parts.length !== 3) {
    push("layout", "底線分段", "3 段（流水號_客戶_內容）", `${parts.length} 段`);
    return { ok: false, raw: trimmed, segments: seg, errors };
  }

  // 第 1 段：流水號
  if (SERIAL_RE.test(parts[0])) seg.serial = parts[0];
  else push("serial", "6碼流水號", "6 位數字（例 069871）", parts[0]);

  // 第 2 段：客戶區塊
  const cm = parts[1].match(CUSTOMER_RE);
  if (cm) {
    seg.payment = cm[1];
    seg.customer = cm[2];
  } else {
    push("customer", "客戶區塊", "{(付款別)客戶名稱}（例 {(月匯)百陽廣告}）", parts[1]);
  }

  // 第 3 段：內容尾段（游標消耗）
  parseTail(parts[2], seg, push);

  if (errors.length) return { ok: false, raw: trimmed, segments: seg, errors };

  seg.productName = productNameFor(seg.material as string);
  return { ok: true, raw: trimmed, segments: seg as Segments, errors: [] };
}

// 尾段依 TAIL_RULES 逐段消耗游標；第一個配不上的規則即回報並停止。
function parseTail(tail: string, seg: Partial<Segments>, push: PushFn): void {
  let cur = tail;
  for (const r of TAIL_RULES) {
    const m = cur.match(r.re);
    if (!m) {
      push(r.key, r.label, r.example, cur.slice(0, 14));
      return;
    }
    if (r.key === "size") {
      seg.sizeW = Number(m[1]);
      seg.sizeH = Number(m[2]);
      seg.sizeUnit = m[3].toLowerCase();
    } else if (r.key === "totalQty") {
      seg.totalQty = Number(m[1]);
    } else {
      (seg as Record<string, unknown>)[r.key] = m[1];
    }
    cur = cur.slice(m[0].length);
  }
  // TAIL_RULES 最後一條 spec 用 $ 錨定，若還有殘留字元代表尾段有多餘內容
  if (cur.length > 0) {
    push("tail", "尾段殘留", "案名/尺寸/材質/數量/規格 依序排列，無多餘字元", cur.slice(0, 14));
  }
}

/** 把 parser 的 errors[] 轉成分點中文引導（無 Gemini 時的內建 fallback）。 */
export function guidanceFromErrors(result: ParseResult): string {
  if (result.ok) return "檔名格式正確 ✅";
  const lines = result.errors.map((e, i) => `${i + 1}. ${e.message}`).join("\n");
  return (
    "檔名格式需要調整：\n" +
    lines +
    "\n\n正確範例：\n069871_{(月匯)百陽廣告}_(78)20260625WG星雲AI地板90x100cmpvc+霧-1CCPVC720N10M.ai\n\n請改好檔名後再拖進來一次 🙌"
  );
}
