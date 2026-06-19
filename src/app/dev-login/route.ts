import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * 개발 전용 즉시 로그인 — 이메일/카카오 설정 없이 테스트하기 위한 우회.
 * 운영(production) 빌드에서는 404. 절대 배포 환경에서 동작하지 않는다.
 *
 * 사용: http://localhost:3000/dev-login            → 기본 계정으로 로그인
 *       http://localhost:3000/dev-login?email=x@y  → 특정 이메일로 로그인
 *
 * 동작: service_role 로 해당 이메일 사용자를 보장(없으면 생성)하고 임시 비밀번호를
 *       설정한 뒤, 쿠키 기반 서버 클라이언트로 로그인해 세션 쿠키를 심는다.
 */
const DEFAULT_EMAIL = "armbareum@gmail.com";
const DEV_PASSWORD = "dev-login-please-change-1234";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const { searchParams, origin } = new URL(request.url);
  const email = searchParams.get("email") ?? DEFAULT_EMAIL;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return new NextResponse(".env.local 에 SUPABASE_SERVICE_ROLE_KEY 가 없습니다.", {
      status: 500,
    });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 사용자 보장: 있으면 비밀번호 갱신, 없으면 생성(이메일 확인 처리).
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email === email);

  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password: DEV_PASSWORD });
  } else {
    const { error } = await admin.auth.admin.createUser({
      email,
      password: DEV_PASSWORD,
      email_confirm: true,
    });
    if (error) {
      return new NextResponse("dev-login 사용자 생성 실패: " + error.message, {
        status: 500,
      });
    }
  }

  // 쿠키 기반 서버 클라이언트로 로그인 → 세션 쿠키 심김.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: DEV_PASSWORD,
  });
  if (error) {
    return new NextResponse("dev-login 로그인 실패: " + error.message, {
      status: 500,
    });
  }

  return NextResponse.redirect(`${origin}/`);
}
