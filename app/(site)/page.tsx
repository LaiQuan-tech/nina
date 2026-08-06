import Hero from "@/components/mei/Hero";
import ServiceRail from "@/components/mei/ServiceRail";
import ProjectWall from "@/components/mei/ProjectWall";
import { getReadySiteImageMap } from "@/lib/site/siteImages";

// 首頁（Direction B）：Hero → 服務項目橫向捲動列 → 深色作品牆
export const revalidate = 300;

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
