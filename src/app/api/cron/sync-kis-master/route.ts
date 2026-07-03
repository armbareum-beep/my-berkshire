import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { syncKisMaster } from "@/lib/finance/kis/masterSync";

/**
 * KIS 종목마스터 서버 cron — 사용자 PC schtasks(일 08:30) 의존 제거(C4).
 * 계약은 spec 018(sync-pipeline.md)의 검증된 사이클론 패턴 재사용:
 *  · Authorization: Bearer {CRON_SECRET} 불일치 시 403(vercel.json 이 자동 주입)
 *  · 그 외에는 성공/실패 모두 HTTP 200 — Vercel 이 실패로 오인해 재시도하지 않도록.
 * KIS 마스터 싱크는 fetch + 인메모리 zlib(파일시스템 불사용)이라 유일하게 서버 이관 가능.
 */
export const maxDuration = 300; // 플랜 제한에 걸리면 Vercel 이 알아서 낮춰 적용

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const start = Date.now();
  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { rows, kr } = await syncKisMaster(supabase);
    return Response.json({ ok: true, rows, kr, durationMs: Date.now() - start });
  } catch (error) {
    // Vercel 재시도 방지 — 실패도 200으로 응답하고 원인은 로그·바디에 남긴다.
    console.error("[cron/sync-kis-master] failed:", error);
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
