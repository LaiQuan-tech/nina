import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionMember } from "@/lib/memberSession";
import { getMemberUploads, progressLabel } from "@/lib/members";
import { LogoutButton, SetPasswordCard } from "@/components/member/MemberActions";

export const metadata: Metadata = {
  title: "我的發稿紀錄｜美強光廣告科技",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** 台北時間，手動格式化避免 Intl 在 server/client 產生不同結果造成 hydration 不一致。 */
function tpe(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export default async function MemberPage({
  searchParams,
}: {
  searchParams?: { submitted?: string };
}) {
  const showSubmitted = searchParams?.submitted === "1";
  const me = await getSessionMember();
  // middleware 已經擋過一層，這裡是第二道保險（也讓型別收斂）
  if (!me) redirect("/login?next=/member");

  const uploads = await getMemberUploads(me.id);

  return (
    <section className="mei-page mei-pad mei-doc">
      <p className="mei-kicker">MEMBER</p>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>我的發稿紀錄</h1>
          <p className="mei-note" style={{ margin: 0 }}>
            {me.name}
            {me.company ? `　·　${me.company}` : ""}　·　{me.phone_display || me.phone}
          </p>
        </div>
        <LogoutButton />
      </div>

      {showSubmitted && (
        <div className="mei-notice" role="status">
          <p className="t">送件完成，我們已收到您的檔案。</p>
          <p className="d">最新紀錄已列在下方，後續可回到這裡查看製作進度。</p>
        </div>
      )}

      {me.status === "guest" && <SetPasswordCard />}

      {uploads.length === 0 ? (
        <div className="mei-card-box" style={{ marginTop: 4 }}>
          <p style={{ margin: 0 }}>還沒有發稿紀錄。</p>
          <p className="mei-note" style={{ margin: "8px 0 14px" }}>
            上傳印刷檔之後，這裡就會列出每一筆的收件時間與製作進度。
          </p>
          <a className="mei-btn mei-btn-primary" role="button" href="/upload">
            上傳稿件
          </a>
        </div>
      ) : (
        <div className="mei-list">
          <div className="mei-list-head" aria-hidden="true">
            <span>檔案</span>
            <span>規格</span>
            <span>收件時間</span>
            <span>進度</span>
          </div>
          {uploads.map((u) => (
            <div className="mei-list-row" key={u.id}>
              <span data-label="檔案">
                <span className="fn">{u.fileName}</span>
                {u.designName && <span className="sub">{u.designName}</span>}
              </span>
              <span data-label="規格">
                {u.sizeW && u.sizeH ? `${u.sizeW}×${u.sizeH} cm` : "—"}
                {u.qty ? `　${u.qty} 件` : ""}
              </span>
              <span data-label="收件時間">{tpe(u.createdAt)}</span>
              <span data-label="進度">
                <span className="mei-pill">{progressLabel(u.status)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="mei-note" style={{ marginTop: 4 }}>
        報價與付款紀錄整備中。目前有任何問題，歡迎直接聯絡專員。
      </p>
    </section>
  );
}
