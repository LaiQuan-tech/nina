import { cookies } from "next/headers";
import { ADMIN_COOKIE, readSessionToken } from "@/lib/adminAuth";

export type AdminAuthorization =
  | { ok: true; adminId: string }
  | { ok: false; status: 401 | 403; error: "unauthorized" | "bad_origin" };

export function hasSameAdminOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return origin !== null && origin === new URL(req.url).origin;
}

export async function authorizeAdminRequest(req: Request): Promise<AdminAuthorization> {
  if (!hasSameAdminOrigin(req)) return { ok: false, status: 403, error: "bad_origin" };
  const token = cookies().get(ADMIN_COOKIE)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  const session = token && secret ? await readSessionToken(token, secret) : null;
  if (!session?.sub) return { ok: false, status: 401, error: "unauthorized" };
  return { ok: true, adminId: session.sub };
}
