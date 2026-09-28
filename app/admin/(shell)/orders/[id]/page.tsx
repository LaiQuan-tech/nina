import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getWorkOrder,
  getWorkOrderItems,
  getShippingDefaults,
  isWorkOrderReadOnly,
  getWorkOrderEvents,
  splitWorkOrderItems,
} from "@/lib/workOrders";
import { listProcessingItems } from "@/lib/erp";
import { signedPrintUrls } from "@/lib/storage";
import { canAutoGenerateThumbnail } from "@/lib/thumbnail/policy";
import WorkOrderSheet from "@/components/order/WorkOrderSheet";
import WorkOrderSheetA4 from "@/components/order/WorkOrderSheetA4";
import A4FontLoader from "@/components/order/A4FontLoader";
import OrderEditForm from "@/components/order/OrderEditForm";
import PrintButton from "@/components/order/PrintButton";
import FtpStatusCard from "@/components/order/FtpStatusCard";
import StationEventsCard from "@/components/order/StationEventsCard";

export const dynamic = "force-dynamic";
// ⚠️ 一定要有：Next 14 的 force-dynamic 只管「每次請求重新渲染」，不會關掉 fetch 的 Data Cache。
// 這頁以前沒設 revalidate，supabase-js 的查詢（連簽縮圖 URL 的 POST）都被存進 Data Cache 一年：
// 工單改完重整看到的是舊資料、縮圖 URL 10 分鐘後就過期變破圖（正式站實測簽名 URL 是 2 小時前簽的）。
export const revalidate = 0;

export default async function AdminOrderPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { legacy?: string };
}) {
  const order = await getWorkOrder(params.id);
  if (!order) notFound();
  const readOnly = isWorkOrderReadOnly(order);
  const useLegacy = searchParams?.legacy === "1";

  // 縮圖不再在渲染路徑上同步產（以前首開要等 PDFium＋sharp 好幾秒）：還沒產、規則也允許時，
  // A4 縮圖格掛 client 元件，頁面先回、掛載後再打產圖端點。demo 一律唯讀，不觸發任何寫入；舊版表單不需要縮圖。
  const autoGenerateThumbnail = !useLegacy && !readOnly && canAutoGenerateThumbnail(order);

  const backHref = order.session_id ? `/admin/cases` : "/admin";

  // A4（新版）或編輯表單（非 demo）才需要明細與圖：明細兩種 kind 一次查、縮圖＋示意圖一次簽，
  // 同一組資料同時給 A4 與編輯表單（以前 A4 自己又查一次明細、又簽一次 URL）。
  // 編輯表單專用的資料只在可編輯（非 demo）時才查；全部互不依賴，一次並行。
  const needSheetData = !useLegacy || !readOnly;
  const [items, [thumbnailUrl, diagramUrl], editData] = await Promise.all([
    needSheetData ? getWorkOrderItems(order.id) : Promise.resolve([]),
    needSheetData ? signedPrintUrls([order.thumbnail_path, order.diagram_path], 600) : Promise.resolve([null, null]),
    readOnly
      ? Promise.resolve(null)
      : Promise.all([listProcessingItems(), getShippingDefaults(order.member_id), getWorkOrderEvents(order.id, 20)]).then(
          ([erpOptions, shippingDefaults, events]) => ({ erpOptions, shippingDefaults, events })
        ),
  ]);
  const { processing: processingItems, accessory: accessoryItems } = splitWorkOrderItems(items);

  return (
    <main style={{ padding: "28px 16px 60px" }}>
      <div className="no-print" style={{ maxWidth: 820, margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Link href={backHref} style={{ fontSize: 14, fontWeight: 600 }}>
          ← 回後台
        </Link>
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

      {useLegacy ? (
        <WorkOrderSheet order={order} />
      ) : (
        <>
          {/* A4 版面以 Noto Sans TC 字寬校準：只在這頁、掛載後才載字型（不擋渲染），列印前 PrintButton 會等它到位 */}
          <A4FontLoader />
          <WorkOrderSheetA4
            order={order}
            processingItems={processingItems}
            accessoryItems={accessoryItems}
            thumbnailUrl={thumbnailUrl}
            diagramUrl={diagramUrl}
            autoGenerateThumbnail={autoGenerateThumbnail}
          />
        </>
      )}
      {!readOnly && (
        <div className="no-print" style={{ maxWidth: 820, margin: "0 auto 18px" }}>
          <FtpStatusCard
            orderId={order.id}
            status={order.ftp_status}
            lastError={typeof order.ftp_meta?.last_error === "string" ? (order.ftp_meta.last_error as string) : null}
          />
        </div>
      )}
      {!readOnly && editData && (
        <div className="no-print" style={{ maxWidth: 820, margin: "0 auto 18px" }}>
          <StationEventsCard station={order.station} status={order.status} events={editData.events} />
        </div>
      )}
      {!readOnly && editData && (
        <OrderEditForm
          order={order}
          processingItems={processingItems}
          accessoryItems={accessoryItems}
          erpOptions={editData.erpOptions}
          shippingDefaults={editData.shippingDefaults}
          thumbnailUrl={thumbnailUrl}
          diagramUrl={diagramUrl}
          className="no-print"
        />
      )}
    </main>
  );
}
