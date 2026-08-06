import { IMAGE_SLOTS, type ImageSlot } from "./imageSlots";

export const MAX_SITE_IMAGE_BYTES = 8 * 1024 * 1024;

export type SiteImageExtension = "jpg" | "png" | "webp";
export type SiteImageValidationError =
  | "empty_file"
  | "too_large"
  | "unsupported_type"
  | "invalid_signature";

export type SiteImageInputError = SiteImageValidationError | "unknown_slot";

type ValidationResult =
  | { ok: true; extension: SiteImageExtension }
  | { ok: false; error: SiteImageValidationError };

const SLOT_BY_KEY = new Map(IMAGE_SLOTS.map((slot) => [slot.slotKey, slot]));

const SIGNATURES: Record<
  string,
  { extension: SiteImageExtension; matches: (bytes: Uint8Array) => boolean }
> = {
  "image/jpeg": {
    extension: "jpg",
    matches: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  "image/png": {
    extension: "png",
    matches: (bytes) =>
      bytes.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte),
  },
  "image/webp": {
    extension: "webp",
    matches: (bytes) =>
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
  },
};

export function findImageSlot(slotKey: string): ImageSlot | null {
  return SLOT_BY_KEY.get(slotKey) ?? null;
}

export function validateImageBytes(bytes: Uint8Array, mimeType: string, declaredSize: number): ValidationResult {
  if (declaredSize <= 0 || bytes.length === 0) return { ok: false, error: "empty_file" };
  if (declaredSize > MAX_SITE_IMAGE_BYTES) return { ok: false, error: "too_large" };

  const format = SIGNATURES[mimeType.toLowerCase()];
  if (!format) return { ok: false, error: "unsupported_type" };
  if (!format.matches(bytes)) return { ok: false, error: "invalid_signature" };
  return { ok: true, extension: format.extension };
}

export function validateSiteImageInput(
  slotKey: string,
  bytes: Uint8Array,
  mimeType: string,
  declaredSize: number
):
  | { ok: true; slot: ImageSlot; extension: SiteImageExtension }
  | { ok: false; error: SiteImageInputError } {
  const slot = findImageSlot(slotKey);
  if (!slot) return { ok: false, error: "unknown_slot" };
  const image = validateImageBytes(bytes, mimeType, declaredSize);
  if (!image.ok) return image;
  return { ok: true, slot, extension: image.extension };
}

export function buildStoragePath(
  slotKey: string,
  extension: SiteImageExtension,
  now = Date.now(),
  randomToken = crypto.randomUUID()
): string {
  const safeSlot = slotKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const safeToken = randomToken.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
  return `slots/${safeSlot}/${now}-${safeToken}.${extension}`;
}
