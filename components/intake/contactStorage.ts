import type { Contact } from "@/components/intake/ContactGate";

// 客戶聯絡資訊記憶（localStorage，僅存在客戶自己的瀏覽器）。
const KEY = "nina_contact_v1";

export function loadContact(): Contact | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<Contact>;
    if (c && c.name && c.email && c.phone) {
      return { name: String(c.name), email: String(c.email), phone: String(c.phone) };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveContact(c: Contact): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export function clearContact(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
