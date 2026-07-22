import { notFound } from "next/navigation";
import { getWorkOrder } from "@/lib/workOrders";
import WorkOrderSheet from "@/components/order/WorkOrderSheet";
import OrderEditForm from "@/components/order/OrderEditForm";
import PrintButton from "@/components/order/PrintButton";

export const dynamic = "force-dynamic";

export default async function AdminOrderPage({ params }: { params: { id: string } }) {
  const order = await getWorkOrder(params.id);
  if (!order) notFound();

  const backHref = order.session_id ? `/admin/cases` : "/admin";

  return (
    <main style={{ padding: "28px 16px 60px" }}>
      <div className="no-print" style={{ maxWidth: 820, margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <a href={backHref} style={{ fontSize: 14, fontWeight: 600 }}>
          ← 回後台
        </a>
        <PrintButton />
      </div>

      <WorkOrderSheet order={order} />
      <OrderEditForm order={order} className="no-print" />
    </main>
  );
}
