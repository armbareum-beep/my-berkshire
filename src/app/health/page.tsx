import { createClient } from "@/lib/supabase/server";

/**
 * STEP 0 헬스체크 — Supabase 연결 확인용.
 * auth 세션을 읽고, 프로젝트 auth health 엔드포인트로 도달 가능 여부를 확인한다.
 * (테이블은 STEP 1에서 생성하므로 여기선 auth 레이어만 검증)
 */
export default async function HealthPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  let connected = false;
  let hasSession = false;
  let detail = "";

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    hasSession = !!data.session;

    // 실제 도달 가능 여부 확인(쿠키만 읽는 getSession 보완)
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      cache: "no-store",
    });
    connected = res.ok;
    if (!res.ok) detail = `auth health ${res.status}`;
  } catch (err) {
    detail = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full rounded-2xl bg-card p-7 shadow-card">
        <p className="text-sm text-muted-foreground">Supabase 연결 상태</p>
        <div className="mt-3 flex items-center gap-2.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: connected ? "var(--primary)" : "var(--muted-foreground)" }}
          />
          <span className="text-2xl font-bold tracking-tight">
            {connected ? "connected" : "not connected"}
          </span>
        </div>

        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">프로젝트</dt>
            <dd className="font-medium">{url?.replace("https://", "") ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">세션</dt>
            <dd className="font-medium">{hasSession ? "로그인됨" : "비로그인"}</dd>
          </div>
          {detail && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">메모</dt>
              <dd className="text-right font-medium text-rise">{detail}</dd>
            </div>
          )}
        </dl>
      </div>
    </main>
  );
}
