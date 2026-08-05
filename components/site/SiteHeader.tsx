const NAV = [
  { href: "#service", label: "服務項目", current: true },
  { href: "#works", label: "作品展示" },
  { href: "#quote", label: "AI 報價" },
  { href: "#oem", label: "同業代工" },
  { href: "#contact", label: "聯絡我們" },
];

export default function SiteHeader() {
  return (
    <header className="s-header">
      <a className="s-brand" href="#top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.png" alt="美強光廣告科技" width={42} height={42} />
        <span>
          <span className="n" style={{ display: "block" }}>
            美強光廣告科技
          </span>
          <span className="s">MEI CHIANG KUANG · SINCE 1998</span>
        </span>
      </a>

      <nav className="s-nav">
        {NAV.map((n) => (
          <a key={n.href} href={n.href} data-current={n.current ? "true" : "false"}>
            {n.label}
          </a>
        ))}
      </nav>

      <a className="s-btn s-btn-primary s-cta" href="#quote">
        AI 線上報價 →
      </a>
    </header>
  );
}
