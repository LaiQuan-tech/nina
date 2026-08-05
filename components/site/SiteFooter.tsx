import { CONTACT } from "@/lib/site/data";

export default function SiteFooter() {
  return (
    <footer id="contact" className="s-footer">
      <div className="s-pad">
        <div className="s-footer-cols">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.png" alt="" width={34} height={34} style={{ width: 34, height: 34, objectFit: "cover", objectPosition: "50% 56%" }} />
              <span style={{ fontWeight: 800, fontSize: 16 }}>{CONTACT.company}</span>
            </div>
            <div className="line">{CONTACT.address}</div>
            <div className="line">
              {CONTACT.phone} ／ {CONTACT.email}
            </div>
            <div className="btns">
              <a className="fbtn" href={CONTACT.line} target="_blank" rel="noopener noreferrer">
                LINE 加好友
              </a>
              <a className="fbtn" href={CONTACT.facebook} target="_blank" rel="noopener noreferrer">
                Facebook
              </a>
            </div>
          </div>

          <div>
            <div className="ttl">營業時間</div>
            {CONTACT.hours.map((h) => (
              <div key={h} className="line">
                {h}
              </div>
            ))}
          </div>

          <div>
            <div className="ttl">發稿檔名規則</div>
            <div className="rule">{CONTACT.fileRule}</div>
            <div className="line" style={{ fontSize: 13, color: "var(--s-on-dark-2)", marginTop: 8 }}>
              上傳前 AI 會自動幫您組好檔名。
            </div>
          </div>
        </div>

        <div className="bottom">© {new Date().getFullYear()} {CONTACT.company}　·　美強光廣告科技 MEI CHIANG KUANG</div>
      </div>
    </footer>
  );
}
