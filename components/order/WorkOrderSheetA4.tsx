import type { CSSProperties, ReactNode } from "react";
import type { WorkOrder, WorkOrderItem } from "@/lib/workOrders";
import { getWorkOrderItems } from "@/lib/workOrders";
import { signedPrintUrl } from "@/lib/storage";
import { STATION_LABELS } from "@/lib/workOrder/barcode";
import { rocFromYmd, rocFromIso } from "./WorkOrderSheet";
import StationBarcode from "./StationBarcode";

// ── 儲存格語法：對照客戶實體 A4 工單（9 欄 A-I × 45 列），可逐格對 xlsx diff。──
// CSS 對應的具名 grid line 見 globals.css `.wo-a4 .wo-grid`：cA..cI + 結尾 cEnd。
const COL_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H", "I"] as const;
type ColLetter = (typeof COL_ORDER)[number];

function colLine(letter: ColLetter): string {
  return `c${letter}`;
}

/** "A3:C4" → 左上 A3、右下 C4 的矩形範圍；"G13" → 單一儲存格。 */
function range(at: string): CSSProperties {
  const m = /^([A-I])(\d{1,2})(?::([A-I])(\d{1,2}))?$/.exec(at.trim());
  if (!m) throw new Error(`WorkOrderSheetA4: range() 無法解析儲存格座標 "${at}"`);
  const [, c1, r1, c2, r2] = m;
  const startCol = c1 as ColLetter;
  const endCol = (c2 as ColLetter | undefined) ?? startCol;
  const rowStart = Number(r1);
  const rowEnd = r2 ? Number(r2) : rowStart;
  const endIdx = COL_ORDER.indexOf(endCol);
  const afterEndCol = endIdx === COL_ORDER.length - 1 ? "cEnd" : colLine(COL_ORDER[endIdx + 1]);
  return {
    gridColumn: `${colLine(startCol)} / ${afterEndCol}`,
    gridRow: `${rowStart} / ${rowEnd + 1}`,
  };
}

// r = 觸右邊界（結尾在 I 欄）要補 border-right；b = 觸下邊界（結尾在 45 列）要補 border-bottom。
// 其餘內部格線一律靠每格自己的 border-top/border-left 自然相接，不需要特別處理。
function Box({
  at,
  label,
  section,
  top,
  mono,
  r,
  b,
  className,
  children,
}: {
  at: string;
  label?: boolean;
  section?: boolean;
  top?: boolean;
  mono?: boolean;
  r?: boolean;
  b?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const cls = [
    "wo-box",
    label && "wo-box--label",
    section && "wo-box--section",
    top && "wo-box--top",
    mono && "wo-box--mono",
    r && "wo-box--r",
    b && "wo-box--b",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} style={range(at)}>
      {children}
    </div>
  );
}

// 過長硬規則：檔名/地址/備註這類自由文字超過門檻就降字級＋clamp 2 行，不撐爆格子
// （每格已有 overflow:hidden 兜底，這裡是讓「看得出被截」比「爆版」好看）。
function LongText({ text, threshold = 22 }: { text: string; threshold?: number }) {
  if (!text) return null;
  if (text.length <= threshold) return <>{text}</>;
  const style: CSSProperties = {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    fontSize: "7pt",
    lineHeight: 1.2,
    whiteSpace: "normal",
    wordBreak: "break-all",
  };
  return <span style={style}>{text}</span>;
}

function displaySingleQty(order: WorkOrder): string {
  if (order.single_qty != null) return String(order.single_qty);
  if (order.total_qty != null) {
    const draft = order.draft_count && order.draft_count > 0 ? order.draft_count : 1;
    return String(Math.round(order.total_qty / draft));
  }
  return "";
}

function thumbnailPlaceholderText(order: WorkOrder): string {
  if (order.thumbnail_status === "failed") return "縮圖產生失敗";
  if (order.thumbnail_status === "unsupported") return "此格式不支援自動縮圖";
  return "縮圖產生中";
}

/** 加工說明／配件明細：固定印 5 列，超過 5 筆時前 4 列 + 第 5 列「其他 N 項」。 */
function ItemRows({ items, startRow }: { items: WorkOrderItem[]; startRow: number }) {
  const ROWS = 5;
  const overflow = items.length > ROWS;
  const visible = overflow ? items.slice(0, ROWS - 1) : items.slice(0, ROWS);
  const nodes: ReactNode[] = [];
  for (let i = 0; i < ROWS; i++) {
    const row = startRow + i;
    if (overflow && i === ROWS - 1) {
      const rest = items.length - visible.length;
      nodes.push(
        <Box key={`item-${row}-name`} at={`A${row}:D${row}`}>{`其他 ${rest} 項`}</Box>,
        <Box key={`item-${row}-qty`} at={`E${row}:F${row}`} />
      );
      continue;
    }
    const item = visible[i];
    nodes.push(
      <Box key={`item-${row}-name`} at={`A${row}:D${row}`}>
        {item ? <LongText text={item.name} threshold={16} /> : null}
      </Box>,
      <Box key={`item-${row}-qty`} at={`E${row}:F${row}`}>
        {item ? `${item.qty ?? ""}${item.unit ?? ""}` : ""}
      </Box>
    );
  }
  return <>{nodes}</>;
}

export default async function WorkOrderSheetA4({ order }: { order: WorkOrder }) {
  const [processingItems, accessoryItems, thumbnailUrl, diagramUrl] = await Promise.all([
    getWorkOrderItems(order.id, "processing"),
    getWorkOrderItems(order.id, "accessory"),
    order.thumbnail_path ? signedPrintUrl(order.thumbnail_path, 600) : Promise.resolve(null),
    order.diagram_path ? signedPrintUrl(order.diagram_path, 600) : Promise.resolve(null),
  ]);

  const size = order.size_w && order.size_h ? `${order.size_w}*${order.size_h}${order.size_unit ?? "cm"}`.toUpperCase() : "";
  const customerFull = order.customer_name
    ? `${order.payment_type ? `(${order.payment_type})` : ""}${order.customer_name}`
    : "";
  const materialDisplay = order.material_raw || order.product_name || "";

  return (
    <div className="wo-a4-wrap">
      <div className="wo-a4">
        {/* 這張表自己吃零邊界 A4；globals.css 既有的 @page（12mm，給舊版 WorkOrderSheet 用）不動。 */}
        <style>{"@page { size: A4 portrait; margin: 0; }"}</style>
        <div className="wo-grid">
          {/* R1-2：抬頭 */}
          <Box at="A1:C1" label>
            工單編號
          </Box>
          <Box at="A2:C2">{order.order_no ?? ""}</Box>
          <Box at="D1:F1" label>
            接單人員
          </Box>
          <Box at="D2:F2">{order.receiver ?? ""}</Box>
          <Box at="G1:I1" label r>
            機台型號
          </Box>
          <Box at="G2:I2" r>
            {order.machine_model ?? ""}
          </Box>

          {/* R3-4：客戶／交貨資訊 */}
          <Box at="A3" label>
            客戶編號
          </Box>
          <Box at="A4">{order.customer_no ?? ""}</Box>
          <Box at="B3" label>
            客戶名字
          </Box>
          <Box at="B4">
            <LongText text={customerFull} threshold={10} />
          </Box>
          <Box at="C3:D3" label>
            交貨方式
          </Box>
          <Box at="C4:D4">{order.delivery_method ?? ""}</Box>
          <Box at="E3:F4" />
          <Box at="G3:G4" />
          <Box at="H3" label>
            接單日
          </Box>
          <Box at="H4">{rocFromIso(order.received_at)}</Box>
          <Box at="I3" label r>
            交貨日
          </Box>
          <Box at="I4" r>
            {order.delivery_date ? rocFromYmd(order.delivery_date.replace(/-/g, "")) : ""}
          </Box>

          {/* R6：貨物寄送 */}
          <Box at="A6:I6" section r>
            貨物寄送
          </Box>

          {/* R7-8 */}
          <Box at="A7" label>
            姓名
          </Box>
          <Box at="A8">
            <LongText text={order.ship_name ?? ""} threshold={8} />
          </Box>
          <Box at="B7:C7" label>
            電話
          </Box>
          <Box at="B8:C8">{order.ship_phone ?? ""}</Box>
          <Box at="D7:I7" label r>
            地址
          </Box>
          <Box at="D8:I8" r top>
            <LongText text={order.ship_address ?? ""} />
          </Box>

          {/* R10-11：原始檔名 */}
          <Box at="A10:A11" label top>
            原始檔名
          </Box>
          <Box at="B10:I11" r top mono>
            <LongText text={order.file_name} threshold={40} />
          </Box>

          {/* R12-13：材質／護貝膜／油墨類別／列印方式／版材 ＋ 輸出條碼 */}
          <Box at="A12" label>
            材質
          </Box>
          <Box at="A13">
            <LongText text={materialDisplay} threshold={10} />
          </Box>
          <Box at="B12" label>
            護貝膜
          </Box>
          <Box at="B13">{order.lamination ?? ""}</Box>
          <Box at="C12" label>
            油墨類別
          </Box>
          <Box at="C13">
            <LongText text={order.ink_type ?? ""} threshold={10} />
          </Box>
          <Box at="D12" label>
            列印方式
          </Box>
          <Box at="D13">{order.print_method ?? ""}</Box>
          <Box at="E12:F12" label>
            版材
          </Box>
          <Box at="E13:F13">
            <LongText text={order.plate_material ?? ""} threshold={10} />
          </Box>
          <Box at="G12:I12" label r>
            {STATION_LABELS.output}
          </Box>
          <Box at="G13:I15" r className="wo-bc wo-bc--sm">
            <StationBarcode orderNo={order.order_no ?? ""} station="output" />
          </Box>

          {/* R14-15：尺寸／數量／備註 */}
          <Box at="A14" label>
            尺寸
          </Box>
          <Box at="A15">{size}</Box>
          <Box at="B14" label>
            數量
          </Box>
          <Box at="B15">
            {displaySingleQty(order)} / {order.total_qty ?? ""}
          </Box>
          <Box at="C14:C15" label top>
            備註
          </Box>
          <Box at="D14:F15" top>
            <LongText text={order.remark ?? ""} />
          </Box>

          {/* R17-22：加工說明 ＋ 加工條碼 */}
          <Box at="A17:D17" section>
            加工說明
          </Box>
          <Box at="E17:F17" label>
            數量
          </Box>
          <Box at="G17:I17" label r>
            {STATION_LABELS.process}
          </Box>
          <ItemRows items={processingItems} startRow={18} />
          <Box at="G18:I22" r className="wo-bc">
            <StationBarcode orderNo={order.order_no ?? ""} station="process" />
          </Box>

          {/* R24-29：配件 ＋ 配件條碼 */}
          <Box at="A24:D24" section>
            配件
          </Box>
          <Box at="E24:F24" label>
            數量
          </Box>
          <Box at="G24:I24" label r>
            {STATION_LABELS.accessory}
          </Box>
          <ItemRows items={accessoryItems} startRow={25} />
          <Box at="G25:I29" r className="wo-bc">
            <StationBarcode orderNo={order.order_no ?? ""} station="accessory" />
          </Box>

          {/* R31-45：縮圖／加工示意小圖／包裝完成條碼／送貨簽收條碼 */}
          <Box at="A31:D31" section>
            縮圖
          </Box>
          <Box at="E31:F31" section>
            加工示意小圖
          </Box>
          <Box at="G31:I31" label r>
            {STATION_LABELS.packed}
          </Box>
          <Box at="A32:D45" b className="wo-img">
            {thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnailUrl} alt="印刷檔縮圖" />
            ) : (
              <span className="wo-img--empty">{thumbnailPlaceholderText(order)}</span>
            )}
          </Box>
          <Box at="E32:F45" b className="wo-img">
            {diagramUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={diagramUrl} alt="加工示意圖" />
            ) : (
              <span className="wo-img--empty">尚無示意圖</span>
            )}
          </Box>
          <Box at="G32:I36" r className="wo-bc">
            <StationBarcode orderNo={order.order_no ?? ""} station="packed" />
          </Box>
          <Box at="G37:I39" r />
          <Box at="G40:I40" label r>
            {STATION_LABELS.delivered}
          </Box>
          <Box at="G41:I45" r b className="wo-bc">
            <StationBarcode orderNo={order.order_no ?? ""} station="delivered" />
          </Box>
        </div>
      </div>
    </div>
  );
}
