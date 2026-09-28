import AdminShell from "@/components/admin/AdminShell";
import UsersManager from "@/components/admin/UsersManager";
import { listAdmins } from "@/lib/adminUsers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function UsersPage() {
  const users = await listAdmins();
  return (
    <AdminShell>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 60px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>管理員帳號</h1>
        <p style={{ fontSize: 13.5, color: "#6b7280", margin: "0 0 18px" }}>可新增其他管理員、停用不再使用的帳號。密碼以 pbkdf2 雜湊儲存。</p>
        <UsersManager initial={users} />
      </main>
    </AdminShell>
  );
}
