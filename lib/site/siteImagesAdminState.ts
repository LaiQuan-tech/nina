import type { SiteImageAdminRecord } from "./siteImages";

const GROUPS = [
  { key: "hero", label: "主視覺" },
  { key: "service", label: "服務項目" },
  { key: "work", label: "作品案例" },
] as const;

export function groupAdminImages(images: SiteImageAdminRecord[]) {
  return GROUPS.map((group) => ({
    ...group,
    images: images.filter((image) => image.groupKey === group.key).sort((a, b) => a.sort - b.sort),
  }));
}

export function replaceAdminImage(
  images: SiteImageAdminRecord[],
  replacement: SiteImageAdminRecord
): SiteImageAdminRecord[] {
  return images.map((image) => (image.slotKey === replacement.slotKey ? replacement : image));
}
