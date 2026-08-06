import type { Metadata } from "next";
import IntakeFlow from "@/components/intake/IntakeFlow";
import { CONTACT } from "@/lib/site/content";

export const metadata: Metadata = {
  title: "上傳稿件｜美強光廣告科技",
  description: "線上上傳印刷檔，系統自動檢查檔名格式，格式正確才收件並建立工單。FTP 24 小時收檔。",
};

// 熟客直達的收稿頁：沿用既有的收稿流程（聯絡資訊 → 檔名檢查 → 上傳 → 自動建工單）。
// AI 詢價視窗接上完整流程後（Stage 4b/6），這頁仍保留給習慣直接發稿的老客戶。
export default function UploadPage() {
  return (
    <section className="mei-page mei-pad mei-doc">
      <p className="mei-kicker">UPLOAD</p>
      <h1>上傳稿件</h1>
      <p>
        系統會先檢查檔名格式，格式正確才收件並自動建立工單；格式不對會直接告訴您哪一段要改。
        一次可以上傳多個檔案。
      </p>
      <p className="rule" style={{ fontFamily: "var(--mei-mono)", fontSize: 13, color: "var(--mei-text-4)", lineHeight: 1.9 }}>
        檔名規則：{CONTACT.fileRule}
        <br />
        {CONTACT.hoursNote}
      </p>

      <div
        style={{
          border: "1px solid var(--mei-line)",
          borderRadius: "var(--mei-r-card)",
          padding: 20,
          background: "#fff",
          maxWidth: 560,
        }}
      >
        <IntakeFlow />
      </div>
    </section>
  );
}
