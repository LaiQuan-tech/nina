import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, readSessionToken } from "@/lib/adminAuth";
import { getAdminById } from "@/lib/adminUsers";
import { listRecentScans } from "@/lib/workOrders";
import ScanStation from "@/components/admin/ScanStation";

// 現場掃描站：故意不包 <AdminShell>——AdminShell 有 fixed 定位的 AI 助理 FAB，
// 手機直向畫面會被擋住一角，這頁自己畫一條極簡頁首就好（見 ScanStation.tsx）。
export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  const session = token && secret ? await readSessionToken(token, secret) : null;
  if (!session) redirect("/admin/login");

  const admin = await getAdminById(session.sub);
  const adminLabel = admin?.name || admin?.email || session.email;

  const initialRecent = await listRecentScans(20);

  return <ScanStation adminLabel={adminLabel} initialRecent={initialRecent} />;
}
