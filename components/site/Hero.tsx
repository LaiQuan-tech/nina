import { CMYK } from "@/lib/site/data";

const STATS = [
  { v: "24H", k: "FTP 收檔" },
  { v: "5M", k: "最大幅寬" },
  { v: "27", k: "年產業經驗" },
  { v: "12", k: "服務類別" },
];

export default function Hero() {
  return (
    <section id="top" className="s-hero">
      <div className="s-hero-l">
        <div className="s-cmyk" style={{ marginBottom: 18 }} aria-hidden="true">
          {CMYK.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </div>

        <div className="s-kicker">01 — 出貨快 ／ 24 小時收檔</div>

        <h1 className="s-h1" style={{ marginTop: 14 }}>
          今天發稿
          <br />
          明天上架的
          <br />
          <span className="r">大圖輸出廠</span>
        </h1>

        <p className="s-lead">
          大圖輸出、廣告帆布、旗幟布條、UV 直噴、衣服印花、招牌燈箱、施工安裝。FTP 24
          小時接收檔案，人工審稿 09:00–21:00，同業代工歡迎詢問。
        </p>

        <div className="s-hero-btns">
          <a className="s-btn s-btn-primary a" href="#quote">
            開始 AI 報價精靈
          </a>
          <a className="s-btn b" href="#service">
            看服務項目
          </a>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div className="s-slot" style={{ flex: 1, minHeight: 240 }}>
          <span className="s-slot-label">［ 現場照：捲對捲輸出機 ］黑白</span>
        </div>
        <div className="s-stats">
          {STATS.map((s) => (
            <div key={s.k}>
              <div className="v">{s.v}</div>
              <div className="k">{s.k}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
