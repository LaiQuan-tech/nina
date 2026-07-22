// 建立管理員帳號。用法：
//   node scripts/createAdmin.mjs <email> <password> [name]
// 需 .env.local 的 NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const [, , email, password, name] = process.argv;
if (!email || !password) {
  console.error("用法: node scripts/createAdmin.mjs <email> <password> [name]");
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("hex");

const { error } = await db.from("admin_users").upsert(
  { email: email.toLowerCase().trim(), name: name ?? null, password_hash: hash, password_salt: salt, active: true },
  { onConflict: "email" }
);
if (error) {
  console.error("建立失敗:", error.message);
  process.exit(1);
}
console.log(`✓ 管理員帳號已建立/更新: ${email}`);
