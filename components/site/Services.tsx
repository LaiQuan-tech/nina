import { SERVICES } from "@/lib/site/data";

export default function Services() {
  return (
    <section id="service" className="s-sec s-pad">
      <div className="s-sec-head">
        <div>
          <div className="s-kicker">02 — OUR SERVICE</div>
          <h2 className="s-h2">服務項目一覽</h2>
        </div>
        <p className="s-sec-note">
          價格為常見規格參考區間，實際以稿件、材質與後加工由 AI 報價精靈或業務確認。
        </p>
      </div>

      <div className="s-gridlines s-services">
        {SERVICES.map((s) => (
          <a key={s.en} className="s-card" href="#quote">
            <div className="s-slot">
              <span>{s.slot}</span>
            </div>
            <div className="body">
              <div className="en">
                <i style={{ background: s.c }} aria-hidden="true" />
                {s.en}
              </div>
              <div className="nm">{s.name}</div>
              <div className="note">{s.note}</div>
              <div className="price">{s.price}</div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
