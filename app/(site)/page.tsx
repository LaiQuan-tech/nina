import Hero from "@/components/mei/Hero";
import ServiceRail from "@/components/mei/ServiceRail";
import ProjectWall from "@/components/mei/ProjectWall";

// 首頁（Direction B）：Hero → 服務項目橫向捲動列 → 深色作品牆
// 圖片來源在 Stage 2 接上 site_images；在那之前一律走條紋佔位 fallback。
export default function HomePage() {
  return (
    <>
      <Hero />
      <ServiceRail />
      <ProjectWall />
    </>
  );
}
