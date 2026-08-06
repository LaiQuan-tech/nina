import sharp from "sharp";
import type { SiteImageExtension } from "./imageUpload";

const MAX_IMAGE_PIXELS = 25_000_000;

export async function decodeImageMetadata(
  bytes: Uint8Array,
  expectedExtension: SiteImageExtension
): Promise<{ ok: true; width: number; height: number } | { ok: false; error: "invalid_image" }> {
  try {
    const input = Buffer.from(bytes);
    const metadata = await sharp(input, { failOn: "error", limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
    const expectedFormat = expectedExtension === "jpg" ? "jpeg" : expectedExtension;
    if (metadata.format !== expectedFormat) return { ok: false, error: "invalid_image" };

    const { info } = await sharp(input, { failOn: "error", limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height) return { ok: false, error: "invalid_image" };
    return { ok: true, width: info.width, height: info.height };
  } catch {
    return { ok: false, error: "invalid_image" };
  }
}
