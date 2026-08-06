import type { Metadata } from "next";
import { CONTACT } from "@/lib/site/content";

export const metadata: Metadata = {
  title: "版型下載｜美強光廣告科技",
  description: "美強光廣告科技版型與公版檔案下載，以及發稿檔名規則說明。",
};

export default function DownloadsPage() {
  return (
    <section className="mei-page mei-pad mei-doc">
      <p className="mei-kicker">DOWNLOADS</p>
      <h1>版型下載</h1>
      <p>公版與版型檔整理中，需要特定尺寸的版型請來電或加 LINE，我們直接寄給您。</p>

      <div style={{ border: "1px solid var(--mei-line)", borderRadius: "var(--mei-r-card)", padding: 20 }}>
        <p className="mei-kicker" style={{ marginTop: 0 }}>
          發稿檔名規則
        </p>
        <p className="rule" style={{ fontFamily: "var(--mei-mono)", fontSize: 14, lineHeight: 1.9, margin: "10px 0 0" }}>
          {CONTACT.fileRule}
        </p>
        <p style={{ marginTop: 12 }}>
          檔名格式正確才收得進工單。可以直接到
          <a href="/upload" style={{ color: "var(--mei-m)" }}>
            上傳稿件
          </a>
          頁面，系統會自動檢查檔名並在格式不對時告訴您怎麼改。
        </p>
        <p className="rule" style={{ margin: "10px 0 0" }}>
          {CONTACT.hoursNote}
        </p>
      </div>

      <div className="mei-hero-btns" style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <a className="mei-btn mei-btn-primary" role="button" href="/upload">
          上傳稿件
        </a>
        <a className="mei-btn mei-btn-ghost" role="button" href={CONTACT.line} target="_blank" rel="noopener noreferrer">
          加 LINE 索取版型
        </a>
      </div>
    </section>
  );
}
