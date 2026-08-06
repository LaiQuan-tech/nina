/**
 * 前台會員登入的 session token。作法完全比照 lib/adminAuth.ts
 * （只用 Web Crypto，Edge middleware 與 Node route handler 共用同一份程式碼）。
 *
 * 與後台的隔離有兩道：
 *   1. 不同 secret（MEMBER_SESSION_SECRET vs ADMIN_SESSION_SECRET）→ 簽章直接對不起來
 *   2. payload 帶 aud:"member" 且驗證時強制檢查 → 就算哪天 secret 被設成一樣也擋得住
 *
 * cookie 值 = base64url(payload).base64url(HMAC-SHA256(payload, SECRET))
 */

export const MEMBER_COOKIE = "mei_member";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 天：客戶不該每週被登出
const AUDIENCE = "member";

export type MemberSession = { sub: string; phone: string; status: string; exp: number };

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function strToBase64Url(s: string): string {
  return bytesToBase64Url(new TextEncoder().encode(s));
}
function base64UrlToStr(b64u: string): string {
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** 常數時間比對（長度相等時逐字元 XOR；不提早 return）。 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSign(payloadB64: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return bytesToBase64Url(new Uint8Array(sig));
}

export async function createMemberToken(
  secret: string,
  member: { id: string; phone: string; status: string }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: AUDIENCE,
    sub: member.id,
    phone: member.phone,
    status: member.status,
    iat: now,
    exp: now + TTL_SECONDS,
  };
  const payloadB64 = strToBase64Url(JSON.stringify(payload));
  const sig = await hmacSign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/** 驗證 token：重算 HMAC 常數時間比對 + 檢查 aud + exp。不過一律回 null（fail-closed）。 */
export async function readMemberToken(token: string, secret: string): Promise<MemberSession | null> {
  try {
    if (!token || !secret) return null;
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const payloadB64 = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = await hmacSign(payloadB64, secret);
    if (!constantTimeEqual(sig, expected)) return null;
    const payload = JSON.parse(base64UrlToStr(payloadB64)) as Record<string, unknown>;
    if (payload.aud !== AUDIENCE) return null; // ★ 不是會員 token 就拒絕
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.phone !== "string") return null;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      sub: payload.sub,
      phone: payload.phone,
      status: typeof payload.status === "string" ? payload.status : "guest",
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

/** middleware 用的布林版。 */
export async function verifyMemberToken(token: string, secret: string): Promise<boolean> {
  return (await readMemberToken(token, secret)) !== null;
}

export const MEMBER_COOKIE_MAX_AGE = TTL_SECONDS;
