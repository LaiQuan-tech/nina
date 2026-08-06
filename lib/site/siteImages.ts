import type { SlotImage } from "@/components/mei/Slot";
import { createAdminSupabase } from "@/lib/supabase";
import { IMAGE_SLOTS, type ImageSlot } from "./imageSlots";
import { buildStoragePath, findImageSlot, type SiteImageExtension } from "./imageUpload";

const SITE_MEDIA_BUCKET = "site-media";

export type SiteImageRow = {
  slot_key: string;
  public_url: string | null;
  alt: string;
  width: number | null;
  height: number | null;
  is_active: boolean;
  status: string;
};

export type SiteImageAdminRecord = ImageSlot & {
  storagePath: string | null;
  publicUrl: string | null;
  source: string | null;
  status: string;
  width: number | null;
  height: number | null;
  updatedAt: string | null;
};

type SiteImageDbRecord = SiteImageRow & {
  storage_path: string | null;
  source: string | null;
  updated_at: string | null;
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

function toAdminRecord(slot: ImageSlot, row?: SiteImageDbRecord): SiteImageAdminRecord {
  return {
    ...slot,
    storagePath: row?.storage_path ?? null,
    publicUrl: row?.public_url ?? null,
    source: row?.source ?? null,
    status: row?.status ?? "empty",
    width: row?.width ?? null,
    height: row?.height ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function listSiteImageRecords(): Promise<SiteImageAdminRecord[]> {
  const db = createAdminSupabase();
  if (!db) return IMAGE_SLOTS.map((slot) => toAdminRecord(slot));

  const { data, error } = await db
    .from("site_images")
    .select("slot_key, storage_path, public_url, alt, source, width, height, is_active, status, updated_at");
  if (error) throw new Error(`site_images_query_failed:${error.code}`);

  const bySlot = new Map(((data ?? []) as SiteImageDbRecord[]).map((row) => [row.slot_key, row]));
  return IMAGE_SLOTS.map((slot) => toAdminRecord(slot, bySlot.get(slot.slotKey)));
}

export async function uploadSiteImage(input: {
  slot: ImageSlot;
  bytes: Uint8Array;
  mimeType: string;
  extension: SiteImageExtension;
  adminId: string;
  width?: number;
  height?: number;
}): Promise<SiteImageAdminRecord> {
  const db = createAdminSupabase();
  if (!db) throw new Error("site_images_db_not_configured");

  const { data: previous } = await db
    .from("site_images")
    .select("storage_path")
    .eq("slot_key", input.slot.slotKey)
    .maybeSingle();

  const storagePath = buildStoragePath(input.slot.slotKey, input.extension);
  const { error: uploadError } = await db.storage.from(SITE_MEDIA_BUCKET).upload(storagePath, input.bytes, {
    contentType: input.mimeType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) throw new Error(`site_image_storage_failed:${uploadError.message}`);

  const { data: publicData } = db.storage.from(SITE_MEDIA_BUCKET).getPublicUrl(storagePath);
  const publicUrl = publicData.publicUrl;
  const row = {
    slot_key: input.slot.slotKey,
    group_key: input.slot.groupKey,
    label: input.slot.label,
    storage_path: storagePath,
    public_url: publicUrl,
    alt: input.slot.alt,
    prompt: input.slot.subject,
    aspect: input.slot.aspect,
    source: "upload",
    model: null,
    width: input.width ?? null,
    height: input.height ?? null,
    sort: input.slot.sort,
    is_active: true,
    status: "ready",
    error: null,
    updated_by: input.adminId,
  };

  const { error: dbError } = await db.from("site_images").upsert(row, { onConflict: "slot_key" });
  if (dbError) {
    await db.storage.from(SITE_MEDIA_BUCKET).remove([storagePath]);
    throw new Error(`site_image_db_failed:${dbError.code}`);
  }

  const oldPath = previous?.storage_path as string | null | undefined;
  if (oldPath && oldPath !== storagePath) {
    const { error: cleanupError } = await db.storage.from(SITE_MEDIA_BUCKET).remove([oldPath]);
    if (cleanupError) console.warn("[site-images] old image cleanup failed", { slotKey: input.slot.slotKey });
  }

  return {
    ...input.slot,
    storagePath,
    publicUrl,
    source: "upload",
    status: "ready",
    width: input.width ?? null,
    height: input.height ?? null,
    updatedAt: new Date().toISOString(),
  };
}
