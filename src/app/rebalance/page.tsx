import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta } from "@/lib/securities";
import { groupAllocationByType } from "@/lib/allocation";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { parsePlan, planProgress } from "@/lib/plan";
import { PlanCard } from "@/components/dashboard/PlanCard";
import {
  SleeveRebalanceEditor,
  type Sleeve,
} from "@/components/dashboard/SleeveRebalanceEditor";

export default async function RebalancePage() {
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
  const data = computeDashboard(portfolio, displayCcy);
  const meta = await loadSecurityMeta(
    supabase,
    data.allocation.map((a) => a.symbol),
  );

  // 1단계(유형) 목표 — category_targets["assetType:*"], 2단계(유형 내 종목) — target_weights
  const catTargets = (portfolio.holding.category_targets ?? {}) as Record<
    string,
    number
  >;
  const within = (portfolio.holding.target_weights ?? {}) as Record<
    string,
    number
  >;
  const typeTargetOf = (type: string) =>
    typeof catTargets[`assetType:${type}`] === "number"
      ? catTargets[`assetType:${type}`]
      : 0;

  // 유형 슬리브 구성(주식/ETF/원자재/코인) — 보유 유형만
  const sleeves: Sleeve[] = groupAllocationByType(data.allocation, meta).map(
    (g) => ({
      type: g.type,
      value: g.slices.reduce((s, a) => s + a.value, 0),
      typeTarget: typeTargetOf(g.type),
      items: g.slices.map((a) => ({
        symbol: a.symbol,
        name: a.name,
        value: a.value,
        price: a.price,
        withinTarget:
          typeof within[a.symbol] === "number" ? within[a.symbol] : 0,
      })),
    }),
  );

  // 저장된 자본배분 계획(있으면 진행률 카드)
  const plan = parsePlan(portfolio.holding.active_plan);
  const progress = plan ? planProgress(plan, portfolio.events) : null;

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">목표비중 · 리밸런싱</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          유형 목표를 정하고(주식·ETF·금·현금…), 유형 안에서 종목 목표를 정합니다.
        </p>
      </div>

      {/* 리밸런싱 기준 전환 — 중립 세그먼트(솔리드 파랑은 메인 액션에만) */}
      <SegmentedTabs
        tabs={[
          { label: "종목별", href: "/rebalance", active: true },
          { label: "국가별", href: "/rebalance/country", active: false },
          { label: "산업별", href: "/rebalance/sector", active: false },
        ]}
      />

      {progress && <PlanCard progress={progress} />}

      {data.priceAvailable ? (
        <SleeveRebalanceEditor
          sleeves={sleeves}
          cashValue={data.cash}
          cashTarget={typeTargetOf("현금")}
          currency={data.currency}
        />
      ) : (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">시세 갱신 필요 — 잠시 후 다시 시도하세요.</p>
        </div>
      )}
    </main>
  );
}
