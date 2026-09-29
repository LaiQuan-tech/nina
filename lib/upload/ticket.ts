// 直傳上傳的「票券」：/api/upload/ticket 簽給瀏覽器、/api/upload/complete 收回來驗。
// 票券證明「伺服器已驗過這個檔名與大小，並把它分配到這個 storage 路徑」，complete 只信票券裡的欄位，
// 不信瀏覽器另外傳來的任何檔名／路徑。Node runtime 專用（node:crypto）。
//
// 格式：<payload>.<sig>
//   payload = base64url(JSON {v:1, p:path, n:fileName, s:size, e:exp(ms epoch)})
//   sig     = base64url(HMAC-SHA256(ticketKey, "nina.upload-ticket.v1." + payload))
// ticketKey 不是新的環境變數：由既有的 SUPABASE_SERVICE_ROLE_KEY 以 HKDF-SHA256 加固定 context
// 字串推導（domain separation）——同一把根密鑰用在別處的簽章不可能被當成票券，反之亦然；
// 收檔流程本來就非有這把 key 不可（建單、簽上傳網址都要），所以不會多出一個新的失敗點。

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { isUploadSizeAllowed } from "./limits";
import { printFilePathMatchesName } from "./path";

/**
 * 票券效期 60 分鐘：要蓋過「10MB 在慢速網路上傳完」的時間，才打得了 complete。
 * （Supabase 簽出的上傳網址本身效期 2 小時；過期的票券只會讓那次上傳收不成件，不會有其他副作用。）
 */
export const UPLOAD_TICKET_TTL_MS = 60 * 60 * 1000;

const KDF_SALT = "nina.upload-ticket";
const KDF_INFO = "nina.upload-ticket.v1:hmac-sha256";
const MAC_PREFIX = "nina.upload-ticket.v1.";
const MAX_TOKEN_CHARS = 4096;
export const MAX_FILE_NAME_CHARS = 255;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

export type UploadTicket = { path: string; fileName: string; size: number; exp: number };

export type TicketCheck =
  | { ok: true; ticket: UploadTicket }
  | { ok: false; reason: "malformed" | "bad_signature" | "invalid_fields" | "expired" };

/** 由根密鑰推導票券專用的 HMAC 金鑰（HKDF-SHA256，固定 salt/info 做 domain separation）。 */
export function deriveUploadTicketKey(rootSecret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", rootSecret, KDF_SALT, KDF_INFO, 32));
}

/** 從環境取票券金鑰；沒設 SUPABASE_SERVICE_ROLE_KEY 回 null（呼叫端回 503，fail-closed）。 */
export function uploadTicketKeyFromEnv(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const root = env.SUPABASE_SERVICE_ROLE_KEY;
  return root ? deriveUploadTicketKey(root) : null;
}

function mac(payloadB64: string, key: Buffer): string {
  return createHmac("sha256", key).update(MAC_PREFIX + payloadB64).digest("base64url");
}

/** 定時比較兩個字串（長度不同直接 false；長度本身不是秘密）。 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function signUploadTicket(ticket: UploadTicket, key: Buffer): string {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, p: ticket.path, n: ticket.fileName, s: ticket.size, e: ticket.exp }),
    "utf8"
  ).toString("base64url");
  return `${payload}.${mac(payload, key)}`;
}

/**
 * 驗票：先驗簽章（定時比較）再解析內容；欄位型別／範圍不對、路徑與檔名不是同一組、過期，一律拒絕。
 * 過期判斷：now >= exp 即過期。
 */
export function verifyUploadTicket(token: unknown, key: Buffer, now: number = Date.now()): TicketCheck {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_CHARS) {
    return { ok: false, reason: "malformed" };
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !B64URL_RE.test(parts[0]) || !B64URL_RE.test(parts[1])) {
    return { ok: false, reason: "malformed" };
  }
  const [payloadB64, sig] = parts;
  if (!safeEqual(sig, mac(payloadB64, key))) return { ok: false, reason: "bad_signature" };

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid_fields" };
  }
  if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid_fields" };
  const { v, p, n, s, e } = raw as Record<string, unknown>;
  if (
    v !== 1 ||
    typeof p !== "string" ||
    typeof n !== "string" ||
    n.length === 0 ||
    n.length > MAX_FILE_NAME_CHARS ||
    !isUploadSizeAllowed(s) ||
    typeof e !== "number" ||
    !Number.isSafeInteger(e) ||
    !printFilePathMatchesName(p, n)
  ) {
    return { ok: false, reason: "invalid_fields" };
  }
  if (now >= e) return { ok: false, reason: "expired" };
  return { ok: true, ticket: { path: p, fileName: n, size: s, exp: e } };
}
