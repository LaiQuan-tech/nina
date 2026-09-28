import DemoDashboard from "@/components/admin/DemoDashboard";
import { getDemoDashboard } from "@/lib/admin/customerKnowledge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOverview() {
  return <DemoDashboard data={await getDemoDashboard()} />;
}
