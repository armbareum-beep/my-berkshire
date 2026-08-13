import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta } from "@/lib/securities";
import { flattenTargets } from "@/lib/allocate";
import {
  isComplete,
  loadExpectedReturnAssumptions,
} from "@/lib/expectedReturnAssumptions";
import {
  attractivenessFromCagr,
  computeExpectedReturn,
  DEFAULT_REQUIRED_RETURN,
} from "@/lib/finance/expectedReturn";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import {
  AllocatePanel,
  type AllocateRow,
} from "@/components/allocate/AllocatePanel";

/**
 * `/allocate` — 새 돈을 어디에 얼마나 넣을지 정하는 화면.
 *
 * 스펙 v1.1 §12~§16 과 Capital Allocator PRD v0.3 §6~§8 이 **합의하는 범위**만 구현했다
 * (대조표: `docs/spec-vs-prd-reconciliation.md`). 밸류에이션(Expected CAGR)은 아직 붙이지
 * 않았고, 엔진에 `attractiveness` 훅만 열어뒀다 — 채택이 결정되면 여기에 물린다.
 *
 * 목표비중은 기존 `/rebalance` 의 2층 저장 형식(유형 → 유형 내 종목)을 읽어 평면으로
 * 환산한다. 별도 테이블을 만들지 않는다(스펙 §13.2).
 */
export default async function AllocatePage() {
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
  const [meta, assumptions] = await Promise.all([
    loadSecurityMeta(
      supabase,
      data.allocation.map((a) => a.symbol),
    ),
    loadExpectedReturnAssumptions(supabase, portfolio.holding.id),
  ]);

  const categoryTargets = (portfolio.holding.category_targets ?? {}) as Record<
    string,
    number
  >;
  const withinTargets = (portfolio.holding.target_weights ?? {}) as Record<
    string,
    number
  >;

  const flat = flattenTargets(
    data.allocation.map((a) => ({
      symbol: a.symbol,
      assetType: meta[a.symbol]?.assetType ?? "주식",
    })),
    categoryTargets,
    withinTargets,
  );

  // 기대수익률은 **종목 통화** 기준으로 계산해야 한다. portfolio.prices 는 ₩ 이고
  // 가정의 이익력(EPS)은 종목 통화라, 외화 종목은 ₩ 가격을 되돌려야 1400배 어긋나지 않는다.
  // 환율을 모르면 계산하지 않는다 → attractiveness 는 중립 1.0 으로 남는다(가짜 정밀 금지).
  const usdKrw = portfolio.usdKrw;
  const nativePrice = (symbol: string): number | null => {
    const krw = portfolio.prices[symbol];
    if (!(krw > 0)) return null;
    if ((meta[symbol]?.currency ?? "KRW") === "KRW") return krw;
    return usdKrw && usdKrw > 0 ? krw / usdKrw : null;
  };

  const rows: AllocateRow[] = data.allocation.map((a) => {
    const assumption = assumptions[a.symbol];
    if (!isComplete(assumption)) {
      // 가정이 없으면 순수 비중 기반 배분(스펙 v1.1 §15.3).
      return {
        key: a.symbol,
        symbol: a.symbol,
        label: a.name,
        value: a.value,
        target: flat[a.symbol] ?? 0,
      };
    }
    const requiredReturn = assumption.requiredReturn ?? DEFAULT_REQUIRED_RETURN;
    const er = computeExpectedReturn(
      {
        currentMetric: assumption.currentMetric as number,
        expectedGrowth: assumption.expectedGrowth as number,
        terminalMultiple: assumption.terminalMultiple as number,
        holdingYears: assumption.holdingYears ?? undefined,
        requiredReturn: assumption.requiredReturn ?? undefined,
      },
      nativePrice(a.symbol),
    );
    return {
      key: a.symbol,
      symbol: a.symbol,
      label: a.name,
      value: a.value,
      target: flat[a.symbol] ?? 0,
      attractiveness: attractivenessFromCagr(er?.expectedCagr ?? null, requiredReturn),
      expectedCagr: er?.expectedCagr ?? null,
      requiredReturn,
    };
  });

  const hasTargets = rows.some((r) => r.target > 0);

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">자본배분</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          새로 생긴 돈을 목표비중과 집중도 한도에 맞춰 나눕니다.
        </p>
      </div>

      {data.priceAvailable ? (
        <AllocatePanel
          rows={rows}
          currency={data.currency}
          investableCash={data.cash}
          hasTargets={hasTargets}
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
