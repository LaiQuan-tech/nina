import Hero from "@/components/mei/Hero";
import ServiceRail from "@/components/mei/ServiceRail";
import ProjectWall from "@/components/mei/ProjectWall";
import { getReadySiteImageMap } from "@/lib/site/siteImages";

// 首頁（Direction B）：Hero → 服務項目橫向捲動列 → 深色作品牆
// 站圖可由後台隨時替換，不使用建置時的靜態快照，避免新圖要等下一次部署才出現。
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const images = await getReadySiteImageMap();
  return (
    <>
      <Hero image={images["hero.main"]} mobileImage={images["hero.mobile"]} />
      <ServiceRail images={images} />
      <ProjectWall images={images} />
    </>
  );
}
