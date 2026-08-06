import Link from "next/link";
import type { UploadBatchSummary } from "@/lib/upload/completion";

export default function UploadCompletionCard({
  summary,
  onContinue,
}: {
  summary: UploadBatchSummary;
  onContinue: () => void;
}) {
  const detail = summary.failureCount
    ? `已成功收到 ${summary.successCount} 個檔案，另有 ${summary.failureCount} 個未成功。您可以先查看已收到的紀錄，或繼續重新上傳。`
    : `已成功收到 ${summary.successCount} 個檔案。若檔案都上傳完成，請前往發稿紀錄確認。`;

  return (
    <section className="mei-upload-complete" role="status" aria-labelledby="upload-complete-title">
      <p className="mei-kicker">UPLOAD COMPLETE</p>
      <h2 id="upload-complete-title" tabIndex={-1}>
        本次檔案已送出
      </h2>
      <p>{detail}</p>
      <div className="actions">
        <Link className="mei-btn mei-btn-primary" href="/member?submitted=1">
          完成送件，查看紀錄
        </Link>
        <button type="button" className="mei-btn mei-btn-ghost" onClick={onContinue}>
          繼續上傳檔案
        </button>
      </div>
    </section>
  );
}
