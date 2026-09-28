import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, readSessionToken } from "@/lib/adminAuth";
import { getAdminById } from "@/lib/adminUsers";
import { listRecentScans } from "@/lib/workOrders";
import ScanStation from "@/components/admin/ScanStation";

// 現場掃描站：故意放在 app/admin/(shell) 外、不套 AdminShell——AdminShell 有 fixed 定位的 AI 助理 FAB，
// 手機直向畫面會被擋住一角，這頁自己畫一條極簡頁首就好（見 ScanStation.tsx）。
export const dynamic = "force-dynamic";
// Next 14 的 force-dynamic 擋不住 supabase-js 的 fetch 被 Data Cache 快取（工單詳情頁已在正式站
// 實測到數小時前的舊資料），「最近掃描」必須即時，比照其他後台頁補 revalidate = 0。
export const revalidate = 0;

export default async function ScanPage() {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  const session = token && secret ? await readSessionToken(token, secret) : null;
  if (!session) redirect("/admin/login");

  // 兩個查詢互不依賴：並行（以前先等管理員姓名、再查最近掃描，多一趟往返）。
  const [admin, initialRecent] = await Promise.all([getAdminById(session.sub), listRecentScans(20)]);
  const adminLabel = admin?.name || admin?.email || session.email;

  return <ScanStation adminLabel={adminLabel} initialRecent={initialRecent} />;
}
