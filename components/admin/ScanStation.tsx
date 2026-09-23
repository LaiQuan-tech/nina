"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STATION_LABELS, type StationKey } from "@/lib/workOrder/barcode";
import type { RecentScanRow } from "@/lib/workOrders";

// STATION_LABELS 物件字面量的 key 順序固定是 output/process/accessory/packed/delivered
// （見 lib/workOrder/barcode.ts），字串 key 的 Object.keys() 保證照插入順序回傳。
const STATIONS = Object.keys(STATION_LABELS) as StationKey[];

const DEFAULT_STATION_STORAGE_KEY = "nina_admin_scan_default_station";
const DEDUPE_MS = 1500; // 同一 raw 在這段時間內重複送出 → 視為掃描槍 double-read，安靜忽略
const IDLE_SUBMIT_MS = 120; // 停止輸入這麼久後，buffer 夠長就自動送出（沒有 Enter/Tab 的掃描槍設定）
const MIN_IDLE_BUFFER_LEN = 8;

type ScanRowStatus = "pending" | "ok" | "duplicate" | "not_found" | "demo" | "bad_format" | "error";

type ScanRow = {
  id: string;
  raw: string;
  status: ScanRowStatus;
  at: string;
  orderNo?: string;
  customerName?: string | null;
  stationLabel?: string;
  message?: string;
  firstAt?: string;
  firstAdminName?: string | null;
};

function toInitialRow(r: RecentScanRow, index: number): ScanRow {
  return {
    id: `initial-${index}`,
    raw: r.order_no ?? "",
    status: "ok",
    at: r.scanned_at,
    orderNo: r.order_no ?? undefined,
    customerName: r.customer_name,
    stationLabel: STATION_LABELS[r.station],
  };
}

function formatClock(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

function errorMessage(error: unknown, status: number): string {
  if (error === "unauthorized") return "登入逾期，請重新整理頁面";
  if (error === "bad_origin") return "請求被拒絕";
  if (error === "rate_limited") return "掃描過快，請稍候再試";
  if (status >= 500) return "系統錯誤，請重試";
  return "發生錯誤，請重試";
}

function vibrate(pattern: number | number[]) {
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    nav.vibrate?.(pattern);
  } catch {
    /* iOS Safari 等瀏覽器完全沒有 Vibration API，安靜略過 */
  }
}

export default function ScanStation({
  adminLabel,
  initialRecent,
}: {
  adminLabel: string;
  initialRecent: RecentScanRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ScanRow[]>(() => initialRecent.map(toInitialRow));
  const [value, setValue] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [defaultStation, setDefaultStation] = useState<StationKey>("output");

  const inputRef = useRef<HTMLInputElement>(null);
  const manualModeRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmitRef = useRef<{ raw: string; at: number } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rowSeqRef = useRef(0);

  useEffect(() => {
    manualModeRef.current = manualMode;
  }, [manualMode]);

  // 讀 localStorage 記住的預設站別（畫面首載一律先顯示 output，讀到才覆蓋，避免 SSR/CSR 不一致的閃爍）。
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DEFAULT_STATION_STORAGE_KEY);
      if (saved && (STATIONS as string[]).includes(saved)) setDefaultStation(saved as StationKey);
    } catch {
      /* 私密瀏覽模式等情境 localStorage 可能丟例外，忽略即可，退回預設 output */
    }
  }, []);

  function chooseDefaultStation(s: StationKey) {
    setDefaultStation(s);
    try {
      window.localStorage.setItem(DEFAULT_STATION_STORAGE_KEY, s);
    } catch {
      /* 存不了就算了，這次 session 內的 state 仍然有效 */
    }
  }

  // focus 韌性：掃描槍就是鍵盤，輸入框隨時要在焦點上。manualMode 時完全不搶，
  // 讓操作人員可以自由點選站別 pill／用螢幕鍵盤手動輸入。
  const refocus = useCallback(() => {
    if (manualModeRef.current) return;
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    refocus();
    function onVisibility() {
      if (document.visibilityState === "visible") refocus();
    }
    window.addEventListener("focus", refocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(refocus, 1000);
    return () => {
      window.removeEventListener("focus", refocus);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(timer);
    };
  }, [refocus]);

  function toggleManualMode() {
    setManualMode((m) => {
      const next = !m;
      if (!next) {
        // 切回掃描槍模式：不等 1 秒的 interval tick，立刻搶回 focus
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      return next;
    });
  }

  function ensureAudio(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  }

  function beep(freq: number, when = 0) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    osc.start(t0);
    osc.stop(t0 + 0.14);
  }

  function feedbackSuccess() {
    beep(880);
    vibrate(30);
  }
  function feedbackFailure() {
    beep(220);
    beep(220, 0.16);
    vibrate([40, 60, 40]);
  }

  function clearAndRefocus() {
    setValue("");
    requestAnimationFrame(refocus);
  }

  const submitRaw = useCallback(
    (rawInput: string, fallbackStation: StationKey) => {
      const raw = rawInput.trim();
      if (!raw) return;

      const now = Date.now();
      const last = lastSubmitRef.current;
      if (last && last.raw === raw && now - last.at < DEDUPE_MS) {
        clearAndRefocus();
        return; // 掃描槍 double-read，安靜忽略：不記錄、不叫聲、不新增列
      }
      lastSubmitRef.current = { raw, at: now };
      clearAndRefocus();

      const id = `r${++rowSeqRef.current}`;
      setRows((rs) => [{ id, raw, status: "pending", at: new Date().toISOString() }, ...rs]);

      fetch("/api/admin/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw, fallbackStation }),
      })
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          if (res.ok && data.ok) {
            const isDup = Boolean(data.duplicate);
            if (isDup) feedbackFailure();
            else feedbackSuccess();
            const order = (data.order ?? {}) as { order_no?: string; customer_name?: string | null };
            setRows((rs) =>
              rs.map((r) =>
                r.id === id
                  ? {
                      ...r,
                      status: isDup ? "duplicate" : "ok",
                      orderNo: order.order_no,
                      customerName: order.customer_name ?? null,
                      stationLabel: typeof data.stationLabel === "string" ? data.stationLabel : undefined,
                      firstAt: typeof data.firstAt === "string" ? data.firstAt : undefined,
                      firstAdminName: (data.firstAdminName as string | null | undefined) ?? undefined,
                    }
                  : r
              )
            );
          } else {
            feedbackFailure();
            const err = typeof data.error === "string" ? data.error : undefined;
            const status: ScanRowStatus =
              err === "order_not_found" ? "not_found" : err === "demo_read_only" ? "demo" : err === "bad_payload" ? "bad_format" : "error";
            const message = errorMessage(err, res.status);
            setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status, message } : r)));
          }
        })
        .catch(() => {
          feedbackFailure();
          setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "error", message: "網路錯誤，請檢查連線後重試" } : r)));
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(v);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      if (v.trim().length >= MIN_IDLE_BUFFER_LEN) submitRaw(v, defaultStation);
    }, IDLE_SUBMIT_MS);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      submitRaw(value, defaultStation);
    }
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
    router.replace("/admin/login");
  }

  return (
    <div className="scan-page">
      <header className="scan-header">
        <a href="/admin" className="scan-back">
          ← 後台
        </a>
        <span className="scan-whoami">{adminLabel}</span>
        <button type="button" className="scan-logout-btn" onClick={logout}>
          登出
        </button>
      </header>

      <main className="scan-body">
        <div className="scan-station-picker" role="group" aria-label="裸編號預設站別">
          {STATIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`scan-station-pill${s === defaultStation ? " is-active" : ""}`}
              onClick={() => chooseDefaultStation(s)}
            >
              {STATION_LABELS[s]}
            </button>
          ))}
        </div>
        <p className="scan-current-station">
          掃到裸編號時記到：<strong>{STATION_LABELS[defaultStation]}</strong>（條碼本身有站別時以條碼為準）
        </p>

        <div className="scan-input-row">
          <input
            ref={inputRef}
            className="scan-input"
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onBlur={() => requestAnimationFrame(refocus)}
            autoFocus
            inputMode={manualMode ? "text" : "none"}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={manualMode ? "手動輸入工單編號" : "請對準條碼掃描…"}
            aria-label="掃描輸入"
          />
          <button type="button" className="scan-manual-toggle" onClick={toggleManualMode}>
            {manualMode ? "🔫 改用掃描槍" : "⌨ 手動"}
          </button>
        </div>

        <div className="scan-feed">
          {rows.length === 0 ? (
            <div className="scan-feed-empty">尚無掃描紀錄</div>
          ) : (
            rows.map((r) => <ScanFeedRow key={r.id} row={r} />)
          )}
        </div>
      </main>
    </div>
  );
}

function ScanFeedRow({ row }: { row: ScanRow }) {
  const time = formatClock(row.at);

  if (row.status === "pending") {
    return (
      <div className="scan-row scan-row--pending">
        <span className="scan-row-time">{time}</span>
        <span className="scan-row-main">{row.raw}</span>
        <span className="scan-row-note">處理中…</span>
      </div>
    );
  }

  if (row.status === "ok" || row.status === "duplicate") {
    const isDup = row.status === "duplicate";
    return (
      <div className={`scan-row ${isDup ? "scan-row--dup" : "scan-row--ok"}`}>
        <span className="scan-row-time">{time}</span>
        <span className="scan-row-main">
          <strong>{row.orderNo}</strong>
          {row.customerName ? ` · ${row.customerName}` : ""} · {row.stationLabel}
        </span>
        <span className="scan-row-note">
          {isDup ? `重複掃描（首次 ${formatClock(row.firstAt)}${row.firstAdminName ? ` · ${row.firstAdminName}` : ""}）` : "已記錄"}
        </span>
      </div>
    );
  }

  const note =
    row.status === "not_found"
      ? "查無工單"
      : row.status === "demo"
      ? "Demo 工單，僅供檢視"
      : row.status === "bad_format"
      ? "格式錯誤"
      : row.message ?? "發生錯誤，請重試";

  return (
    <div className="scan-row scan-row--err">
      <span className="scan-row-time">{time}</span>
      <span className="scan-row-main">{row.raw}</span>
      <span className="scan-row-note">{note}</span>
    </div>
  );
}
