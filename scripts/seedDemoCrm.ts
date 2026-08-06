import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildDemoSeed } from "../lib/admin/demoSeedManifest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadLocalEnv(): Record<string, string> {
  const envPath = path.join(projectRoot, ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

const localEnv = loadLocalEnv();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? localEnv.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? localEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("缺少 Supabase 環境變數");

const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

async function ensureOk(label: string, action: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await action;
  if (error) throw new Error(`${label}失敗：${error.message}`);
}

async function count(dbClient: SupabaseClient, table: string): Promise<number> {
  const { count: value, error } = await dbClient.from(table).select("*", { count: "exact", head: true }).eq("is_demo", true);
  if (error) throw new Error(`${table} 計數失敗：${error.message}`);
  return value ?? 0;
}

async function printCounts(): Promise<void> {
  for (const table of ["members", "customer_profiles", "intake_sessions", "quotes", "work_orders", "customer_followups"]) {
    console.log(`${table}: ${await count(db, table)}`);
  }
}

async function clean(): Promise<void> {
  for (const table of ["customer_followups", "quotes", "work_orders", "intake_sessions", "customer_profiles", "members"]) {
    await ensureOk(`${table} Demo 清除`, db.from(table).delete().eq("is_demo", true));
  }
  console.log("Demo CRM 資料已安全清除");
  await printCounts();
}

async function seed(): Promise<void> {
  const data = buildDemoSeed(new Date());
  await ensureOk("members upsert", db.from("members").upsert(data.members, { onConflict: "id" }));
  await ensureOk("customer_profiles upsert", db.from("customer_profiles").upsert(data.profiles, { onConflict: "member_id" }));
  await ensureOk("intake_sessions upsert", db.from("intake_sessions").upsert(data.sessions, { onConflict: "id" }));
  await ensureOk("quotes upsert", db.from("quotes").upsert(data.quotes, { onConflict: "id" }));
  await ensureOk("work_orders upsert", db.from("work_orders").upsert(data.orders, { onConflict: "id" }));
  await ensureOk("customer_followups upsert", db.from("customer_followups").upsert(data.followups, { onConflict: "id" }));
  console.log("Demo CRM 資料已建立／更新");
  await printCounts();
}

(process.argv.includes("--clean") ? clean() : seed()).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
