// 「記住聯絡人」的真相在 server（會員 cookie），localStorage 只留最後用過的手機號碼
// 供表單預填，減少客戶裝置上殘留的個資。
const KEY = "mei_last_phone";
const LEGACY_KEY = "nina_contact_v1"; // 舊版存整組姓名/Email/手機，登入機制上線後不再使用

export function saveLastPhone(phone: string): void {
  try {
    globalThis.localStorage?.setItem(KEY, phone);
    globalThis.localStorage?.removeItem(LEGACY_KEY);
  } catch {
    /* 無痕模式或空間不足就算了，不影響流程 */
  }
}

export function loadLastPhone(): string {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearLastPhone(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
    globalThis.localStorage?.removeItem(LEGACY_KEY);
  } catch {
    /* noop */
  }
}
