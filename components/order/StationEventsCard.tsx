import { STATION_LABELS, type StationKey } from "@/lib/workOrder/barcode";
import { progressLabel } from "@/lib/members";
import type { WorkOrderEvent } from "@/lib/workOrders";

// 跟 app/admin/orders/page.tsx 的 STATUS_STYLE 同一組配色，維持後台視覺一致。
const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  open: { bg: "#f1f5f9", fg: "#475569" },
  in_progress: { bg: "#fef3c7", fg: "#b45309" },
  done: { bg: "#dcfce7", fg: "#15803d" },
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function pill(label: string, bg: string, fg: string) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 12.5,
        fontWeight: 700,
        padding: "4px 11px",
        borderRadius: 999,
        background: bg,
        color: fg,
      }}
    >
      {label}
    </span>
  );
}

/**
 * 工單詳情頁的「目前站別＋最近掃描事件時間軸」（server component，唯讀）。
 * station/status 本身是 work_orders 的快取欄位，事件才是唯一真相來源
 * （見 lib/workOrderStations.ts、lib/workOrderScans.ts）——這裡兩者並陳，
 * 方便對照「快取欄位」跟「事件紀錄」是否一致。
 */
export default function StationEventsCard({
  station,
  status,
  events,
}: {
  station: string | null;
  status: string;
  events: WorkOrderEvent[];
}) {
  const stationLabel = station ? STATION_LABELS[station as StationKey] : null;
  const statusStyle = STATUS_STYLE[status] ?? STATUS_STYLE.open;

  return (
    <div className="adm-profile-editor">
      <div className="adm-panel-head">
        <h2>目前站別與掃描紀錄</h2>
        <span>最近 {events.length} 筆</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
        {stationLabel ? pill(stationLabel, "#e0f2fe", "#0369a1") : <span style={{ color: "#9aa3b0", fontSize: 12.5 }}>尚未進站</span>}
        {pill(progressLabel(status), statusStyle.bg, statusStyle.fg)}
      </div>
      {events.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: 12.5, margin: 0 }}>尚無掃描事件——條碼還沒被掃過，或站別是後台手動指定。</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {events.map((e) => (
            <li
              key={e.id}
              style={{
                display: "grid",
                gridTemplateColumns: "76px 1fr 128px",
                gap: 10,
                fontSize: 12.5,
                borderBottom: "1px solid #f1f5f9",
                paddingBottom: 7,
                alignItems: "baseline",
              }}
            >
              <span style={{ color: "#0369a1", fontWeight: 700 }}>{STATION_LABELS[e.station]}</span>
              <span style={{ color: "#475569" }}>
                {e.admin_name || "—"}
                {e.note ? (
                  <em style={{ marginLeft: 6, color: "#b45309", fontStyle: "normal" }}>· {e.note}</em>
                ) : null}
              </span>
              <span style={{ color: "#94a3b8", textAlign: "right" }}>{fmtDateTime(e.scanned_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
