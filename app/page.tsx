import SiteHeader from "@/components/site/SiteHeader";
import Hero from "@/components/site/Hero";
import Services from "@/components/site/Services";
import QuoteWizard from "@/components/site/QuoteWizard";
import Works from "@/components/site/Works";
import Oem from "@/components/site/Oem";
import SiteFooter from "@/components/site/SiteFooter";

// 美強光廣告科技 官方網站（A 版）
// 單頁 + 錨點導覽：Hero → 服務項目 → AI 報價精靈（含收稿）→ 作品展示 → 同業代工 → 頁尾
export default function HomePage() {
  return (
    <div className="site">
      <SiteHeader />
      <main>
        <Hero />
        <Services />
        <QuoteWizard />
        <Works />
        <Oem />
      </main>
      <SiteFooter />
    </div>
  );
}
