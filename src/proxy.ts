import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // 정적 파일·이미지·favicon, 공개 로고 프록시(/api/logo, 사용자 데이터 없음), cron 라우트(/api/cron, Bearer CRON_SECRET 자체 인증) 제외한 모든 경로
    "/((?!api/logo|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
