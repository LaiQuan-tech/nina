import AdminShell from "@/components/admin/AdminShell";
import { listWorkOrders, type WorkOrderListRow } from "@/lib/workOrders";
import { STATION_LABELS, type StationKey } from "@/lib/workOrder/barcode";
import { progressLabel } from "@/lib/members";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLS = "1.25fr 1.35fr 1.6fr 1.05fr 0.8fr 0.8fr 0.7fr";

const STATION_ENTRIES = Object.entries(STATION_LABELS) as [StationKey, string][];

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  open: { bg: "#f1f5f9", fg: "#475569" },
  in_progress: { bg: "#fef3c7", fg: "#b45309" },
  done: { bg: "#dcfce7", fg: "#15803d" },
};

type SearchParams = {
  q?: string;
  status?: string;
  station?: string;
  from?: string;
  to?: string;
  unmatched?: string;
  sort?: string;
  page?: string;
};

function pill(label: string, bg: string, fg: string, key?: string) {
  return (
    <span
      key={key}
      style={{
        display: "inline-block",
        fontSize: 11.5,
        fontWeight: 600,
        padding: "2.5px 8px",
        borderRadius: 980,
        background: bg,
        color: fg,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function StationStatusPills({ station, status }: { station: string | null; status: string }) {
  const statusStyle = STATUS_STYLE[status] ?? STATUS_STYLE.open;
  const stationLabel = station ? STATION_LABELS[station as StationKey] : null;
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {stationLabel ? pill(stationLabel, "#e0f2fe", "#0369a1") : <span className="adm-pill-muted">—</span>}
      {pill(progressLabel(status), statusStyle.bg, statusStyle.fg)}
    </div>
  );
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function fmtDateOnly(s: string | null): string {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[1]}/${m[2]}/${m[3]}`;
}

function todayInTaipei(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

/** 分頁連結：複製目前全部 searchParams，只換掉 page，翻頁才不會把篩選條件弄丟。 */
function pageHref(sp: Record<string, string | string[] | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, value);
    }
  }
  params.set("page", String(page));
  return `/admin/orders?${params.toString()}`;
}

function OrderRow({ order, today }: { order: WorkOrderListRow; today: string }) {
  const customerFull = order.customer_name
    ? `${order.payment_type ? `(${order.payment_type})` : ""}${order.customer_name}`
    : "—";
  const subLine = [order.customer_no, order.customer_phone].filter(Boolean).join(" · ") || "—";
  const productLine = order.product_name || order.material_raw || "—";
  const size = order.size_w && order.size_h ? `${order.size_w}×${order.size_h}${order.size_unit ?? "cm"}` : "";
  const productSub = [order.design_name, size].filter(Boolean).join(" · ") || "—";
  const overdue = order.status !== "done" && !!order.delivery_date && order.delivery_date < today;

  return (
    <a href={`/admin/orders/${order.id}`} className="adm-row" style={{ gridTemplateColumns: COLS }}>
      <div>
        <span className="adm-cell-label">工單編號</span>
        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700 }}>
          {order.order_no ?? "—"}
        </div>
        {order.serial ? <div style={{ color: "#9aa3b0", fontSize: 11 }}>{order.serial}</div> : null}
      </div>
      <div>
        <span className="adm-cell-label">客戶</span>
        <div style={{ fontWeight: 600 }}>{customerFull}</div>
        <div style={{ color: "#6b7280", fontSize: 11.5 }}>{subLine}</div>
      </div>
      <div>
        <span className="adm-cell-label">商品</span>
        <div>{productLine}</div>
        <div style={{ color: "#6b7280", fontSize: 11.5 }}>{productSub}</div>
      </div>
      <div>
        <span className="adm-cell-label">站別・狀態</span>
        <StationStatusPills station={order.station} status={order.status} />
      </div>
      <div style={{ color: "#4b5563", fontSize: 12.5 }}>
        <span className="adm-cell-label">接單日</span>
        {fmtDateTime(order.received_at)}
      </div>
      <div style={{ fontSize: 12.5, ...(overdue ? { color: "#dc2626", fontWeight: 700 } : { color: "#4b5563" }) }}>
        <span className="adm-cell-label">交貨日</span>
        {fmtDateOnly(order.delivery_date)}
      </div>
      <div>
        <span className="adm-cell-label">接單人員</span>
        {order.receiver || "—"}
      </div>
    </a>
  );
}

export default async function OrdersPage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = searchParams ?? {};
  const status = sp.status && sp.status !== "all" ? sp.status : undefined;
  const station = sp.station && sp.station !== "all" ? sp.station : undefined;

  const result = await listWorkOrders({
    q: sp.q,
    status,
    station,
    from: sp.from,
    to: sp.to,
    unmatched: sp.unmatched,
    sort: sp.sort,
    page: sp.page,
  });

  const today = todayInTaipei();

  return (
    <AdminShell>
      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 20px 60px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>所有工單</h1>
        <p style={{ fontSize: 13.5, color: "#6b7280", margin: "0 0 18px" }}>
          共 {result.total} 筆，依接單日新到舊排序。
        </p>

        <form className="adm-filter-bar adm-filter-wide" action="/admin/orders">
          <label>
            <span>搜尋</span>
            <input name="q" defaultValue={sp.q} placeholder="工單編號、客戶、聯絡人、設計檔名、商品" />
          </label>
          <label>
            <span>狀態</span>
            <select name="status" defaultValue={sp.status || "all"}>
              <option value="all">全部</option>
              <option value="open">已收件</option>
              <option value="in_progress">製作中</option>
              <option value="done">已完成</option>
            </select>
          </label>
          <label>
            <span>站別</span>
            <select name="station" defaultValue={sp.station || "all"}>
              <option value="all">全部</option>
              {STATION_ENTRIES.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>接單日（起）</span>
            <input type="date" name="from" defaultValue={sp.from} />
          </label>
          <label>
            <span>接單日（迄）</span>
            <input type="date" name="to" defaultValue={sp.to} />
          </label>
          <label className="adm-filter-check">
            <input type="checkbox" name="unmatched" value="1" defaultChecked={sp.unmatched === "1"} />
            <span>未比對商品</span>
          </label>
          <button type="submit">套用篩選</button>
          <a href="/admin/orders">清除</a>
        </form>

        {result.rows.length === 0 ? (
          <div className="adm-empty">找不到符合條件的工單。</div>
        ) : (
          <>
            <div className="adm-table">
              <div className="adm-thead" style={{ gridTemplateColumns: COLS }}>
                <div>工單編號</div>
                <div>客戶</div>
                <div>商品</div>
                <div>站別・狀態</div>
                <div>接單日</div>
                <div>交貨日</div>
                <div>接單人員</div>
              </div>
              {result.rows.map((order) => (
                <OrderRow key={order.id} order={order} today={today} />
              ))}
            </div>

            {result.pageCount > 1 && (
              <div className="adm-pager">
                {result.page > 1 ? (
                  <a href={pageHref(sp, result.page - 1)}>← 上一頁</a>
                ) : (
                  <span className="adm-pager-disabled">← 上一頁</span>
                )}
                <em>
                  第 {result.page} / {result.pageCount} 頁，共 {result.total} 筆
                </em>
                {result.page < result.pageCount ? (
                  <a href={pageHref(sp, result.page + 1)}>下一頁 →</a>
                ) : (
                  <span className="adm-pager-disabled">下一頁 →</span>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </AdminShell>
  );
}
