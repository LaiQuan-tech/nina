"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ftp_status: null(舊工單，上線前建的，不會自動推送)/pending/ok/failed/skipped
const STATUS_LABEL: Record<string, string> = {
  pending: "待推送",
  ok: "已推送 NAS",
  failed: "推送失敗",
  skipped: "已略過",
};

/**
 * 工單詳情頁的「推 NAS」小卡：顯示目前 ftp_status，失敗時附 last_error，
 * 一顆「重推 NAS」按鈕呼叫 app/api/admin/order/[id]/ftp-retry。
 */
export default function FtpStatusCard({
  orderId,
  status,
  lastError,
}: {
  orderId: string;
  status: string | null;
  lastError: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function retry() {
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch(`/api/admin/order/${orderId}/ftp-retry`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setNotice("已重新推送成功");
        router.refresh();
      } else {
        setNotice(data.error ? `重推失敗：${data.error}` : "重推失敗，請稍後再試");
      }
    } catch {
      setNotice("重推失敗，請檢查網路連線");
    } finally {
      setBusy(false);
    }
  }

  const label = status ? (STATUS_LABEL[status] ?? status) : "未推送（舊工單）";

  return (
    <div className="adm-profile-editor">
      <div className="adm-panel-head">
        <h2>NAS 推送狀態</h2>
        <span>{label}</span>
      </div>
      {status === "failed" && lastError && (
        <p style={{ margin: "0 0 12px", color: "#b91c1c", fontSize: 12.5 }}>失敗原因：{lastError}</p>
      )}
      <button type="button" className="adm-action-button secondary" onClick={retry} disabled={busy}>
        {busy ? "推送中…" : "重推 NAS"}
      </button>
      {notice && <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12.5, color: "#0369a1" }}>{notice}</p>}
    </div>
  );
}
