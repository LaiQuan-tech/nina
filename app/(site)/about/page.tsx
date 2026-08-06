import type { Metadata } from "next";
import { CONTACT } from "@/lib/site/content";

export const metadata: Metadata = {
  title: "公司簡介｜美強光廣告科技",
  description: "美強光廣告科技有限公司，二十餘年大圖輸出經驗，機台自有、材質齊全，報價、審稿、施工一次到位。",
};

export default function AboutPage() {
  return (
    <section className="mei-page mei-pad mei-doc">
      <p className="mei-kicker">ABOUT</p>
      <h1>二十餘年，把招牌做穩。</h1>
      <p>
        {CONTACT.company}位於{CONTACT.address}
        ，專營大圖輸出、廣告帆布、UV 直噴、招牌燈箱、立體字與團體服。機台自有、材質齊全，從報價、審稿到現場施工一次到位。
      </p>
      <p>
        公司沿革、設備與機台清單整理中。需要詳細規格或現場評估，歡迎來電
        <a href={CONTACT.phoneHref} style={{ color: "var(--mei-accent)" }}>
          {CONTACT.phone}
        </a>
        ，或加 LINE 由專員為您說明。
      </p>
      <div className="mei-hero-btns" style={{ flexDirection: "row", flexWrap: "wrap" }}>
        <a className="mei-btn mei-btn-primary" role="button" href={CONTACT.line} target="_blank" rel="noopener noreferrer">
          加 LINE 專員
        </a>
        <a className="mei-btn mei-btn-ghost" role="button" href="/#service">
          看服務項目
        </a>
      </div>
    </section>
  );
}
