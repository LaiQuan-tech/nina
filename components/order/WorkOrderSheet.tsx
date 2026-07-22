import type { WorkOrder } from "@/lib/workOrders";

// YYYYMMDD 字串 → 民國 YYY/MM/DD
function rocFromYmd(ymd: string | null): string {
  if (!ymd || !/^\d{8}$/.test(ymd)) return "";
  const y = Number(ymd.slice(0, 4)) - 1911;
  return `${y}/${ymd.slice(4, 6)}/${ymd.slice(6, 8)}`;
}

// ISO timestamp → 民國 YYY/MM/DD HH:MM（Asia/Taipei）
function rocFromIso(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = Number(g("year")) - 1911;
  return `${y}/${g("month")}/${g("day")} ${g("hour")}:${g("minute")}`;
}

function Cell({ children, span, label }: { children?: React.ReactNode; span?: 2 | 3 | 4; label?: boolean }) {
  const cls = ["wo-cell", label ? "wo-label" : "", span ? `wo-span-${span}` : ""].filter(Boolean).join(" ");
  return <div className={cls}>{children}</div>;
}

export default function WorkOrderSheet({ order }: { order: WorkOrder }) {
  const size = order.size_w && order.size_h ? `${order.size_w}*${order.size_h}${order.size_unit ?? "cm"}`.toUpperCase() : "";
  const customerFull = order.customer_name
    ? `${order.payment_type ? `(${order.payment_type})` : ""}${order.customer_name}`
    : "";
  const project = [order.owner_code, order.design_name].filter(Boolean).join(" ");

  return (
    <div className="wo-sheet">
      <div className="wo-title">工　單</div>
      <div className="wo-grid">
        <Cell label>工單編號</Cell>
        <Cell span={3}>{order.order_no ?? ""}</Cell>

        <Cell label>客戶編號</Cell>
        <Cell>{order.customer_no ?? ""}</Cell>
        <Cell label>客戶名稱</Cell>
        <Cell>{customerFull}</Cell>

        <Cell label>客戶電話</Cell>
        <Cell>{order.customer_phone ?? ""}</Cell>
        <Cell label>聯絡人</Cell>
        <Cell>{order.contact_person ?? ""}</Cell>

        <Cell label>接單日</Cell>
        <Cell>{rocFromIso(order.received_at)}</Cell>
        <Cell label>交貨日</Cell>
        <Cell>{order.delivery_date ? rocFromYmd(order.delivery_date.replace(/-/g, "")) : ""}</Cell>

        <Cell label>交貨方式</Cell>
        <Cell>{order.delivery_method ?? ""}</Cell>
        <Cell label>類別編號</Cell>
        <Cell>{order.category_no ?? ""}</Cell>

        <Cell label>檔案名稱</Cell>
        <Cell span={3}>
          <span className="wo-filename">{order.file_name}</span>
        </Cell>

        <Cell label>商品名稱</Cell>
        <Cell span={3}>
          {order.product_name ?? order.material_raw ?? ""}
          {order.product_code ? `（${order.product_code}）` : ""}
          {!order.product_matched && (
            <span style={{ color: "#b45309", fontWeight: 600, marginLeft: 8 }}>⚠ 非標準商品，請人工確認</span>
          )}
        </Cell>

        <Cell label>成品尺寸</Cell>
        <Cell>{size}</Cell>
        <Cell label>案主/案名</Cell>
        <Cell>{project}</Cell>

        <Cell label>稿件數</Cell>
        <Cell>{order.draft_count ?? ""}</Cell>
        <Cell label>單一稿/總數量</Cell>
        <Cell>
          {order.single_qty ?? ""} / {order.total_qty ?? ""}
        </Cell>

        <Cell label>材料規格</Cell>
        <Cell>{order.material_spec ?? ""}</Cell>
        <Cell label>檔案日期</Cell>
        <Cell>{rocFromYmd(order.file_date)}</Cell>

        <Cell label>加工項目</Cell>
        <Cell span={3}>{order.processing_items ?? ""}</Cell>

        <Cell label>接稿人</Cell>
        <Cell>{order.receiver ?? ""}</Cell>
        <Cell label>狀態</Cell>
        <Cell>{order.status}</Cell>
      </div>
    </div>
  );
}
