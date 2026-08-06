import type { SlotImage } from "@/components/mei/Slot";
import { createAdminSupabase } from "@/lib/supabase";
import { findImageSlot } from "./imageUpload";

export type SiteImageRow = {
  slot_key: string;
  public_url: string | null;
  alt: string;
  width: number | null;
  height: number | null;
  is_active: boolean;
  status: string;
};

export function mapReadyRows(rows: SiteImageRow[]): Record<string, SlotImage> {
  const images: Record<string, SlotImage> = {};
  for (const row of rows) {
    if (!findImageSlot(row.slot_key) || !row.is_active || row.status !== "ready" || !row.public_url) continue;
    images[row.slot_key] = {
      url: row.public_url,
      alt: row.alt,
      width: row.width ?? undefined,
      height: row.height ?? undefined,
    };
  }
  return images;
}

export async function getReadySiteImageMap(): Promise<Record<string, SlotImage>> {
  const db = createAdminSupabase();
  if (!db) return {};

  const { data, error } = await db
    .from("site_images")
    .select("slot_key, public_url, alt, width, height, is_active, status")
    .eq("is_active", true)
    .eq("status", "ready");

  if (error) {
    console.error("[site-images] front-end image query failed", { code: error.code });
    return {};
  }
  return mapReadyRows((data ?? []) as SiteImageRow[]);
}
