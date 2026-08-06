import SiteHeader from "@/components/mei/SiteHeader";
import SiteFooter from "@/components/mei/SiteFooter";
import ChatWidget from "@/components/mei/ChatWidget";
import ScrollFx from "@/components/mei/ScrollFx";

// 官網外殼：所有前台頁面共用 header / footer / AI 詢價視窗。
// `.mei` 是設計系統的作用域根，後台（.adm-*）與工單（.wo-*）完全不受影響。
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mei">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <ChatWidget />
      <ScrollFx />
    </div>
  );
}
