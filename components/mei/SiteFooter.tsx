import { CONTACT } from "@/lib/site/content";

export default function SiteFooter() {
  return (
    <footer id="contact" className="mei-footer">
      <div className="mei-page mei-pad mei-footer-in">
        <div data-reveal>
          <p className="line" style={{ margin: 0 }}>
            {CONTACT.address}　·
            <a href={CONTACT.phoneHref}>{CONTACT.phone}</a>　·
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
          </p>
          <p className="rule" style={{ margin: "6px 0 0" }}>
            發稿檔名請標示 —— {CONTACT.fileRule}
          </p>
          <div className="btns" style={{ marginTop: 12 }}>
            <a className="fbtn" href={CONTACT.line} target="_blank" rel="noopener noreferrer">
              LINE 專員
            </a>
            <a className="fbtn" href={CONTACT.facebook} target="_blank" rel="noopener noreferrer">
              Facebook
            </a>
            <a className="fbtn" href="/upload">
              上傳稿件
            </a>
            <a className="fbtn" href="/member">
              會員專區
            </a>
          </div>
        </div>

        <div data-reveal data-d="1">
          <p className="line" style={{ margin: 0 }}>
            {CONTACT.hours}
          </p>
          <p className="rule" style={{ margin: "6px 0 0" }}>
            {CONTACT.hoursNote}
          </p>
        </div>
      </div>
    </footer>
  );
}
