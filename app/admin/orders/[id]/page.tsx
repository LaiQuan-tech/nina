import { notFound } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";
import { getWorkOrder, getWorkOrderItems, getShippingDefaults, isWorkOrderReadOnly } from "@/lib/workOrders";
import { listProcessingItems } from "@/lib/erp";
import { signedPrintUrl } from "@/lib/storage";
import WorkOrderSheet from "@/components/order/WorkOrderSheet";
import WorkOrderSheetA4 from "@/components/order/WorkOrderSheetA4";
import OrderEditForm from "@/components/order/OrderEditForm";
import PrintButton from "@/components/order/PrintButton";
import { ensureThumbnail } from "@/lib/thumbnail/generate";

export const dynamic = "force-dynamic";
// 縮圖 lazy on-demand 產製（PDFium 渲染＋sharp 轉檔）可能要跑幾秒，給足時間。
export const maxDuration = 60;

export default async function AdminOrderPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { legacy?: string };
}) {
  let order = await getWorkOrder(params.id);
  if (!order) notFound();
  const readOnly = isWorkOrderReadOnly(order);
  const useLegacy = searchParams?.legacy === "1";

  // 新版 A4 才需要縮圖；demo 資料一律唯讀，不寫任何欄位（含縮圖狀態）。
  if (!useLegacy && !readOnly) {
    order = await ensureThumbnail(order);
  }

  const backHref = order.session_id ? `/admin/cases` : "/admin";

  // 編輯表單要用到的資料只在可編輯（非 demo）時才查，demo 唯讀頁不必多打這些查詢。
  const editData = readOnly
    ? null
    : await (async () => {
        const [processingItems, accessoryItems, erpOptions, shippingDefaults, thumbnailUrl, diagramUrl] = await Promise.all([
          getWorkOrderItems(order.id, "processing"),
          getWorkOrderItems(order.id, "accessory"),
          listProcessingItems(),
          getShippingDefaults(order.member_id),
          order.thumbnail_path ? signedPrintUrl(order.thumbnail_path, 600) : Promise.resolve(null),
          order.diagram_path ? signedPrintUrl(order.diagram_path, 600) : Promise.resolve(null),
        ]);
        return { processingItems, accessoryItems, erpOptions, shippingDefaults, thumbnailUrl, diagramUrl };
      })();

  return (
    <AdminShell>
      <main style={{ padding: "28px 16px 60px" }}>
        <div className="no-print" style={{ maxWidth: 820, margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <a href={backHref} style={{ fontSize: 14, fontWeight: 600 }}>
            ← 回後台
          </a>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {readOnly ? (
              <span style={{ border: "1px solid #f3df9b", borderRadius: 999, padding: "7px 12px", background: "#fff8dc", color: "#765b00", fontSize: 12, fontWeight: 700 }}>
                Demo 資料 · 僅供檢視
              </span>
            ) : (
              <a
                href={`/api/admin/order/${order.id}/download`}
                style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: "9px 16px", background: "#fff", color: "#1c1c1e", fontSize: 14, fontWeight: 600, textDecoration: "none" }}
              >
                ⬇️ 下載印刷檔
              </a>
            )}
            <PrintButton />
          </div>
        </div>

        {useLegacy ? <WorkOrderSheet order={order} /> : <WorkOrderSheetA4 order={order} />}
        {!readOnly && editData && (
          <OrderEditForm
            order={order}
            processingItems={editData.processingItems}
            accessoryItems={editData.accessoryItems}
            erpOptions={editData.erpOptions}
            shippingDefaults={editData.shippingDefaults}
            thumbnailUrl={editData.thumbnailUrl}
            diagramUrl={editData.diagramUrl}
            className="no-print"
          />
        )}
      </main>
    </AdminShell>
  );
}
