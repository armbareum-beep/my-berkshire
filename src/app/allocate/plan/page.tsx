import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAllocateData } from "@/lib/allocateData";
import { BackButton } from "@/components/BackButton";
import { PlanPanel } from "@/components/allocate/PlanPanel";

/**
 * `/allocate/plan` — 배분 여정. 금액 → 결과 → 매수 기록.
 *
 * **하단 탭바가 없다.** `docs/design-strategy-v1.md` §4 의 레일 원칙 — 온보딩·거래 입력처럼
 * "여정 중" 화면에는 탭바를 두지 않는다(이탈 방지).
 */
export default async function AllocatePlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const data = await loadAllocateData(supabase, displayCcy);
  if (!data) redirect("/onboarding");

  // 목표비중이 없으면 계산할 근거가 없다 — 설정으로 되돌린다.
  if (!data.hasTargets) redirect("/allocate/settings");

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-12">
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">자본 배분하기</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          목표비중과 집중도 한도에 맞춰 나눕니다.
        </p>
      </div>

      {data.priceAvailable ? (
        <PlanPanel
          rows={data.rows}
          currency={data.currency}
          investableCash={data.investableCash}
        />
      ) : (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">
            시세 갱신 필요 — 잠시 후 다시 시도하세요.
          </p>
        </div>
      )}
    </main>
  );
}
