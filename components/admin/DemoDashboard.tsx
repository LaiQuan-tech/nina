import type { DemoDashboard as DashboardData } from "@/lib/admin/customerKnowledge";

function StatCard({ label, value, note, tone }: { label: string; value: number; note: string; tone?: "warn" }) {
  return (
    <article className={`adm-kpi${tone ? ` ${tone}` : ""}`}>
      <p>{label}</p>
      <strong>{value.toLocaleString("zh-TW")}</strong>
      <span>{note}</span>
    </article>
  );
}

function BarList({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <section className="adm-panel">
      <div className="adm-panel-head"><h2>{title}</h2></div>
      <div className="adm-bars">
        {items.map((item) => (
          <div className="adm-bar-row" key={item.label}>
            <span>{item.label}</span>
            <i aria-hidden="true"><b style={{ width: `${Math.max(8, item.value / max * 100)}%` }} /></i>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" }).format(new Date(iso));
}

export default function DemoDashboard({ data }: { data: DashboardData }) {
  const chartMax = Math.max(...data.dailyActivity.map((item) => item.value), 1);
  return (
    <main className="adm-crm-page">
      <header className="adm-crm-title">
        <div>
          <div className="adm-demo-tag">DEMO DATA</div>
          <h1>營運總覽</h1>
          <p>把客戶、報價、稿件、工單與回訪整合成一張即時營運地圖。</p>
        </div>
        <a className="adm-primary-link" href="/admin/customers">開啟客戶知識庫</a>
      </header>

      <section className="adm-kpi-grid" aria-label="營運關鍵指標">
        <StatCard label="Demo 客戶" value={data.customerCount} note="完整樣貌與服務脈絡" />
        <StatCard label="本月新客戶" value={data.newThisMonth} note="自動整合會員身份" />
        <StatCard label="進行中報價" value={data.activeQuoteCount} note="草稿與已送出" />
        <StatCard label="本月收稿" value={data.monthOrderCount} note="每個成功稿件一張工單" />
        <StatCard label="待回訪" value={data.openFollowupCount} note="跨客戶追蹤清單" />
        <StatCard label="已逾期" value={data.overdueFollowupCount} note="需要優先處理" tone="warn" />
      </section>

      <div className="adm-dashboard-grid">
        <section className="adm-panel adm-activity-panel">
          <div className="adm-panel-head"><h2>最近 14 天互動量</h2><span>對話、報價與工單</span></div>
          <div className="adm-mini-chart" role="img" aria-label={`最近十四天共 ${data.dailyActivity.reduce((sum, item) => sum + item.value, 0)} 次互動`}>
            {data.dailyActivity.map((item) => <div key={item.label} title={`${item.label}：${item.value}`}><i style={{ height: `${Math.max(5, item.value / chartMax * 100)}%` }} /><span>{item.label}</span></div>)}
          </div>
        </section>
        <BarList title="客戶產業分布" items={data.industryCounts.slice(0, 6)} />
        <BarList title="熱門材質" items={data.materialCounts} />

        <section className="adm-panel adm-wide-panel">
          <div className="adm-panel-head"><h2>優先回訪</h2><a href="/admin/followups">查看全部</a></div>
          <div className="adm-compact-list">
            {data.upcomingFollowups.map((item) => (
              <a href={`/admin/customers/${item.memberId}`} key={item.id}>
                <span><b>{item.company || item.customerName}</b><small>{item.title}</small></span>
                <em data-priority={item.priority}>{dateLabel(item.dueAt)}</em>
              </a>
            ))}
          </div>
        </section>

        <section className="adm-panel adm-wide-panel">
          <div className="adm-panel-head"><h2>最近互動客戶</h2><a href="/admin/customers">客戶列表</a></div>
          <div className="adm-compact-list">
            {data.recentCustomers.map((customer) => (
              <a href={`/admin/customers/${customer.id}`} key={customer.id}>
                <span><b>{customer.company || customer.name}</b><small>{customer.profile.tags.slice(0, 2).join(" · ")}</small></span>
                <em>{customer.orderCount} 工單</em>
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
