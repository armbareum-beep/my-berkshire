import { cookies } from "next/headers";
import { createSession, rateKey, SESSION_COOKIE, SESSION_SECONDS, verifyPassword } from "@/lib/family/auth";
import { database, json, sameOrigin, serverConfig } from "@/lib/family/server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "요청 출처를 확인해 주세요." }, 403);
  try {
    const { secret, password } = serverConfig();
    const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: allowed, error } = await database().rpc("family_allow_login", { client_key: rateKey(ip, secret) });
    if (error) return json({ error: "로그인 서비스를 잠시 사용할 수 없습니다." }, 503);
    if (!allowed) return json({ error: "시도 횟수를 초과했어요. 15분 후 다시 입력해 주세요." }, 429);
    const text = await request.text();
    if (text.length > 1024) return json({ error: "입력값을 확인해 주세요." }, 400);
    const body = JSON.parse(text);
    if (!verifyPassword(body.password, password)) return json({ error: "비밀번호가 맞지 않아요." }, 401);
    (await cookies()).set(SESSION_COOKIE, createSession(secret), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: SESSION_SECONDS });
    return json({ ok: true });
  } catch { return json({ error: "로그인 설정 또는 연결을 확인해 주세요." }, 503); }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "요청 출처를 확인해 주세요." }, 403);
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
}
