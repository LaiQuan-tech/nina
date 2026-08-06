import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { GENERATED_SITE_IMAGES } from "../lib/site/generatedImageManifest";
import { IMAGE_SLOTS } from "../lib/site/imageSlots";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadLocalEnv(): Record<string, string> {
  const envPath = path.join(projectRoot, ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    values[line.slice(0, separator).trim()] = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return values;
}

const localEnv = loadLocalEnv();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? localEnv.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? localEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("缺少 Supabase 環境變數");

const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const slotByKey = new Map(IMAGE_SLOTS.map((slot) => [slot.slotKey, slot]));

async function main() {
  for (const image of GENERATED_SITE_IMAGES) {
    const slot = slotByKey.get(image.slotKey);
    if (!slot) throw new Error(`未知圖片位：${image.slotKey}`);

    const localPath = path.join(projectRoot, "public", "generated", "site", image.fileName);
    const bytes = fs.readFileSync(localPath);
    const contentHash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    const storagePath = `generated/${image.slotKey.replace(/\./g, "-")}/${contentHash}.webp`;
    const { error: uploadError } = await db.storage.from("site-media").upload(storagePath, bytes, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: true,
    });
    if (uploadError) throw new Error(`${image.slotKey} 上傳失敗：${uploadError.message}`);

    const { data: publicData } = db.storage.from("site-media").getPublicUrl(storagePath);
    const { error: dbError } = await db.from("site_images").upsert(
      {
        slot_key: slot.slotKey,
        group_key: slot.groupKey,
        label: slot.label,
        storage_path: storagePath,
        public_url: publicData.publicUrl,
        alt: slot.alt,
        prompt: slot.subject,
        aspect: slot.aspect,
        source: "ai",
        model: "OpenAI ImageGen built-in",
        width: image.width,
        height: image.height,
        sort: slot.sort,
        is_active: true,
        status: "ready",
        error: null,
        updated_by: null,
      },
      { onConflict: "slot_key" }
    );
    if (dbError) throw new Error(`${image.slotKey} 資料寫入失敗：${dbError.message}`);
    console.log(`✓ ${image.slotKey}`);
  }

  console.log(`完成：${GENERATED_SITE_IMAGES.length} 張站圖已上架`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
