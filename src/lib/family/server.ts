import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { SESSION_COOKIE, verifySession } from "./auth";

export function serverConfig() {
  const password = process.env.FAMILY_PASSWORD_HASH || "";
  const secret = process.env.FAMILY_SESSION_SECRET || "";
  if (!password || secret.length < 32) throw Error("가족 로그인 설정을 확인해 주세요.");
  return { password, secret: secret + password };
}
export function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Error("온라인 저장소 설정을 확인해 주세요.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function authorized() {
  try { return verifySession((await cookies()).get(SESSION_COOKIE)?.value, serverConfig().secret); }
  catch { return false; }
}
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store, private", "Vary": "Cookie" } });
}
