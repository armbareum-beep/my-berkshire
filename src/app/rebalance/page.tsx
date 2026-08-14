import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { parsePlan, planProgress } from "@/lib/plan";
import { PlanCard } from "@/components/dashboard/PlanCard";

/**
 * `/rebalance` — 종목별 목표비중 편집은 `/allocate/settings` 로 이사했다
 * (`docs/allocate-redesign-v1.md` Phase 5).
 *
 * 2층 구조(유형 목표 × 유형 내 종목)가 "목표비중 설정이 어렵다"의 원인이었다. META 를
 * 24% 로 만들려면 두 숫자를 맞춰야 했다. 평면 전환(스펙 §13.2)으로 종목당 숫자 하나가 됐다.
 *
 * 화면을 지우지 않고 안내로 남기는 이유: 사용자가 저장해둔 링크와 홈 배너의 계획 진행률이
 * 여기에 걸려 있다. 2층 저장 액션(`setTargetWeights`·`setCategoryTargets`)과 편집기
 * 컴포넌트는 호출자가 사라져 함께 지웠다 — 남겨두면 은퇴한 모델을 다시 쓰게 된다.
 */
export default async function RebalancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");

  // 저장된 자본배분 계획(있으면 진행률 카드) — 홈 배너가 이 화면을 가리킨다.
  const plan = parsePlan(portfolio.holding.active_plan);
  const progress = plan ? planProgress(plan, portfolio.events) : null;

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">리밸런싱</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          목표비중은 배분 설정으로 옮겼어요.
        </p>
      </div>

      {progress && <PlanCard progress={progress} />}

      <section className="rounded-2xl bg-card p-6 text-center shadow-card">
        <p className="text-sm font-semibold">목표비중은 이제 한 곳에서 정해요</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          유형 목표와 종목 목표를 따로 맞출 필요 없이, 종목마다 숫자 하나만 정하면 됩니다.
        </p>
        <Link
          href="/allocate/settings"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98]"
        >
          배분 설정 열기
        </Link>
      </section>

      <Link
        href="/allocation/financial"
        className="px-2 text-center text-xs font-medium text-muted-foreground underline"
      >
        지금 자산배분 보기 (유형·국가·산업별)
      </Link>
    </main>
  );
}
