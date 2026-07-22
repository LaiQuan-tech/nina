/**
 * 後台登入的核心：HMAC 簽章 session token。
 * 只用 Web Crypto（crypto.subtle）+ TextEncoder + btoa/atob，不碰 Node-only API，
 * 這樣同一份程式碼可同時跑在 Edge middleware 與 Node route handler。
 *
 * cookie 值 = base64url(payload).base64url(HMAC-SHA256(payload, SECRET))
 * payload = { sub:<adminId>, email, iat, exp }；不含密碼、也不含 secret。
 */

export const ADMIN_COOKIE = "nina_admin";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 天

export type AdminSession = { sub: string; email: string; exp: number };

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
export function constantTimeEqual(a: string, b: string): boolean {
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

/** 簽發一個 7 天有效的 session token，帶入 admin id 與 email。 */
export async function createSessionToken(secret: string, admin: { id: string; email: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: admin.id, email: admin.email, iat: now, exp: now + TTL_SECONDS };
  const payloadB64 = strToBase64Url(JSON.stringify(payload));
  const sig = await hmacSign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/**
 * 驗證 token：重算 HMAC 常數時間比對 + 檢查 exp。
 * 通過回 payload（{sub,email,exp}），否則回 null（fail-closed）。
 */
export async function readSessionToken(token: string, secret: string): Promise<AdminSession | null> {
  try {
    if (!token || !secret) return null;
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const payloadB64 = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = await hmacSign(payloadB64, secret);
    if (!constantTimeEqual(sig, expected)) return null;
    const payload = JSON.parse(base64UrlToStr(payloadB64)) as Partial<AdminSession>;
    if (!payload.sub || !payload.email) return null;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: payload.sub, email: payload.email, exp: payload.exp };
  } catch {
    return null;
  }
}

/** middleware 用的布林版。 */
export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  return (await readSessionToken(token, secret)) !== null;
}
