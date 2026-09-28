// 後台換頁骨架：側欄（layout）留著，右側先顯示這個骨架，資料到了再換成真頁面。
// 不查 DB、不用 client JS；Link 預取時會一併帶回，點下去當下就能顯示。
const ROWS = [0, 1, 2, 3, 4, 5];

export default function AdminLoading() {
  return (
    <main className="adm-crm-page adm-skeleton" aria-busy="true">
      <p className="adm-skeleton-sr" role="status">
        頁面載入中…
      </p>
      <div className="adm-skeleton-head" aria-hidden="true">
        <span className="adm-skel adm-skel-tag" />
        <span className="adm-skel adm-skel-title" />
        <span className="adm-skel adm-skel-line" />
      </div>
      <div className="adm-skeleton-bar" aria-hidden="true">
        <span className="adm-skel" />
        <span className="adm-skel" />
        <span className="adm-skel" />
        <span className="adm-skel" />
      </div>
      <div className="adm-skeleton-list" aria-hidden="true">
        {ROWS.map((row) => (
          <div className="adm-skeleton-row" key={row}>
            <span className="adm-skel" />
            <span className="adm-skel" />
            <span className="adm-skel" />
          </div>
        ))}
      </div>
    </main>
  );
}
