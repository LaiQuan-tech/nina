import AdminShell from "@/components/admin/AdminShell";
import DemoDashboard from "@/components/admin/DemoDashboard";
import { getDemoDashboard } from "@/lib/admin/customerKnowledge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOverview() {
  return (
    <AdminShell>
      <DemoDashboard data={await getDemoDashboard()} />
    </AdminShell>
  );
}
