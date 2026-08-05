const COLS = [
  { t: "FTP 24 小時收檔", d: "夜間發稿隔日排版，人工審稿 09:00–21:00，檔案異常主動回報。" },
  { t: "同業價・不搶客", d: "代工件不留品牌、不接觸您的客戶，出貨可代寄指定地址。" },
  { t: "材質齊・自備代噴", d: "捲材、板材、壓克力、立體字一站完成，也接受自備材料代噴。" },
];

// 同業代工整幅紅底；CMYK 色條第四段改為底色（在紅底上才看得見）
const BAR = ["#00a3e0", "#e6007e", "#f5c400", "#f3f2f2"];

export default function Oem() {
  return (
    <section id="oem" className="s-oem">
      <div className="s-sec s-pad">
        <div className="s-cmyk" style={{ marginBottom: 18 }} aria-hidden="true">
          {BAR.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </div>
        <div className="s-oem-kicker">05 — 同業代工</div>
        <h2 className="s-h2">
          檔案給我們，
          <br />
          剩下的交期我們負責。
        </h2>

        <div className="s-oem-cols">
          {COLS.map((c) => (
            <div key={c.t}>
              <div className="t">{c.t}</div>
              <div className="d">{c.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
