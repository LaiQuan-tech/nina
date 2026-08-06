import AdminShell from "@/components/admin/AdminShell";
import SiteImagesManager from "@/components/admin/SiteImagesManager";
import { listSiteImageRecords } from "@/lib/site/siteImages";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SiteImagesPage() {
  const images = await listSiteImageRecords();
  return (
    <AdminShell>
      <main className="adm-site-page">
        <div className="adm-site-title">
          <div>
            <h1>網站圖片</h1>
            <p>管理首頁主視覺、服務項目與作品案例。支援 JPG、PNG、WebP，單檔上限 4 MB。</p>
          </div>
          <a href="/" target="_blank" rel="noopener noreferrer">
            開啟前台 ↗
          </a>
        </div>
        <SiteImagesManager initial={images} />
      </main>
    </AdminShell>
  );
}
