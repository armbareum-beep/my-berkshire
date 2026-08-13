import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { loadSecurityMeta } from "@/lib/securities";
import { readTargets } from "@/lib/targetWeights";
import { loadAllocateData } from "@/lib/allocateData";
import { planAllocation } from "@/lib/allocate";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { HurdleCard } from "@/components/allocate/HurdleCard";
import { InvestableCashCard } from "@/components/allocate/InvestableCashCard";
import {
  TargetWeightEditor,
  type TargetRow,
} from "@/components/allocate/TargetWeightEditor";

/**
 * `/allocate/settings` — 배분을 움직이는 **입력값을 한 곳에** 모은 화면.
 *
 * ## 후보 목록을 걷어낸 이유
 *
 * 한때 여기엔 "후보(Approved Universe)"를 산업별로 고르는 섹션이 따로 있었다. 그런데
 * 목표비중을 검색형으로 바꾸면서(#66) **비중을 정하면 자동으로 후보가 되도록** 했다.
 * 그 순간 후보 섹션은 같은 것을 두 번 묻는 자리가 됐다 — 같은 종목이 한 화면에 두 번
 * 나오고, 그중 하나는 산업별로 길게 늘어선 리스트였다.
 *
 * 그래서 규칙을 하나로 줄인다.
 *
 * > **목표비중을 정한 종목이 배분 대상이다. 안 정했으면 대상이 아니다.**
 *
 * "배분에서 빼기"도 따로 필요 없다 — 목표비중을 0으로 두면 배분되지 않는다.
 * 산업별 쏠림을 보는 일은 조회 화면(`/allocation/sector`)이 이미 한다.
 *
 * 순서는 영향이 큰 것부터 — 목표비중 > 허들 > 투자 가능 현금.
 */
export default async function AllocateSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [portfolio, cookieStore] = await Promise.all([
    getPortfolio(supabase),
    cookies(),
  ]);
  if (!portfolio) redirect("/onboarding");

  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const data = await loadAllocateData(supabase, displayCcy);
  if (!data) redirect("/onboarding");

  // 현재 비중은 엔진에서 그대로 받아 쓴다(화면이 따로 계산하면 두 숫자가 갈린다).
  const legs = planAllocation(data.rows, 0).legs;
  const weightOf = new Map(legs.map((l) => [l.key, l.currentWeight]));
  const targetRows: TargetRow[] = data.rows.map((r) => ({
    symbol: r.symbol,
    label: r.label,
    target: r.target,
    currentWeight: weightOf.get(r.key) ?? 0,
    held: r.held,
  }));

  // 후보가 아닌데 목표비중이 남아 있는 종목도 넣는다 — 빼면 저장된 값이 보이지도
  // 지워지지도 않는 유령이 된다.
  const candidateSet = new Set(data.rows.map((r) => r.symbol));
  const storedTargets = readTargets(
    portfolio.holding.target_weights,
    (portfolio.holding.category_targets ?? {}) as Record<string, number>,
    [],
  );
  const orphans = Object.entries(storedTargets).filter(
    ([symbol, rule]) => !candidateSet.has(symbol) && rule.target > 0,
  );
  if (orphans.length > 0) {
    const meta = await loadSecurityMeta(
      supabase,
      orphans.map(([symbol]) => symbol),
    );
    for (const [symbol, rule] of orphans) {
      targetRows.push({
        symbol,
        label: meta[symbol]?.name ?? symbol,
        target: rule.target,
        currentWeight: 0,
        held: false,
      });
    }
  }

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">배분 설정</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          배분 결과를 바꾸는 값들이 여기 다 있어요.
        </p>
      </div>

      <TargetWeightEditor rows={targetRows} />

      <HurdleCard rate={data.house} passing={data.passing} total={data.judged} />

      <InvestableCashCard
        value={data.investableCash}
        cash={data.cash}
        currency={data.currency}
        isSet={data.investableCashSet}
      />

      <Link
        href="/allocation/sector"
        className="px-2 text-center text-xs font-medium text-muted-foreground underline"
      >
        산업·국가별로 지금 어디에 쏠려 있는지 보기
      </Link>
    </main>
  );
}
