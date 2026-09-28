import AdminShell from "@/components/admin/AdminShell";

// 已登入後台頁共用外殼（側欄＋AI 小幫手）放在 layout：換頁時外殼不重新掛載、不重新 hydrate，
// 只換右側內容。login（未登入）與 scan（刻意不要 fixed 的 AI FAB 擋掃描畫面）不在這個 route group 裡。
export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
