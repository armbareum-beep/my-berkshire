import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta } from "@/lib/securities";
import { flattenTargets } from "@/lib/allocate";
import {
  approvedSymbols,
  loadUniverseStatuses,
  resolveUniverse,
} from "@/lib/universe";
import { loadExpectedReturnAssumptions } from "@/lib/expectedReturnAssumptions";
import {
  attractivenessFromCagr,
  computeExpectedReturn,
} from "@/lib/finance/expectedReturn";
import { effectiveHurdle, houseHurdle } from "@/lib/hurdle";
import { HurdleCard } from "@/components/allocate/HurdleCard";
import {
  loadCachedEps,
  nativeCurrencyOf,
  toNativeEps,
} from "@/lib/finance/cachedEps";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import {
  AllocatePanel,
  type AllocateRow,
} from "@/components/allocate/AllocatePanel";

/**
 * `/allocate` — 새 돈을 어디에 얼마나 넣을지 정하는 화면.
 *
 * 스펙 v1.1 §12~§16 과 Capital Allocator PRD v0.3 §6~§8 을 구현한다
 * (대조표: `docs/spec-vs-prd-reconciliation.md`).
 *
 * 밸류에이션(Expected CAGR)은 두 방향으로 배분에 들어간다.
 *   · `attractiveness` — 후보 사이의 **순서**를 바꾼다 (PRD §6.1)
 *   · `expectedCagr`   — 목표 초과 허들을 넘기면 **매수 상한**을 Soft Cap 까지 연다 (PRD §6.2)
 * 가정을 넣지 않은 종목은 둘 다 중립이라 순수 비중 기반으로 동작한다(스펙 v1.1 §15.3).
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

  // 후보 = 보유 ∪ APPROVED 관심종목(PRD §3.1). 미보유 후보는 평가액 0 으로 참여한다 —
  // 목표비중만 정해두면 첫 매수부터 배분안에 나온다.
  const heldSymbols = data.allocation.map((a) => a.symbol);
  const statuses = await loadUniverseStatuses(supabase, portfolio.holding.id);
  const candidates = approvedSymbols(resolveUniverse(heldSymbols, statuses));

  const [meta, assumptions, cachedEps] = await Promise.all([
    loadSecurityMeta(supabase, candidates),
    loadExpectedReturnAssumptions(supabase, portfolio.holding.id),
    // 공시 EPS — 캐시만 읽는다(API 호출 없음). 캐시에 없는 종목은 자동값 없이 넘어간다.
    loadCachedEps(supabase, candidates),
  ]);

  const heldValue: Record<string, number> = {};
  const heldName: Record<string, string> = {};
  for (const a of data.allocation) {
    heldValue[a.symbol] = a.value;
    heldName[a.symbol] = a.name;
  }

  const categoryTargets = (portfolio.holding.category_targets ?? {}) as Record<
    string,
    number
  >;
  const withinTargets = (portfolio.holding.target_weights ?? {}) as Record<
    string,
    number
  >;

  // 전사 기본 요구수익률("난이도"). 종목별 값이 없는 종목에만 적용된다.
  const house = houseHurdle(portfolio.holding.required_return);

  const flat = flattenTargets(
    candidates.map((symbol) => ({
      symbol,
      assetType: meta[symbol]?.assetType ?? "주식",
    })),
    categoryTargets,
    withinTargets,
  );

  // 기대 CAGR = (EPS × (1+g)^Y × 배수 ÷ 가격)^(1/Y) − 1 은 **통화 무관**이다.
  // EPS/가격이 비율이라 둘을 같은 통화로만 맞추면 환산해도 답이 같다(환율이 상쇄).
  // 그래서 환산하지 않고 **짝만 맞춘다**:
  //
  //   수기 이익력 있음 → 사용자가 종목 통화로 넣었으므로 가격도 종목 통화로 (환율 필요)
  //   수기 없음(공시)  → 공시 EPS 도 가격도 이미 ₩ 이므로 **환율 없이** 그대로 (해외 포함)
  //
  // 후자가 기본 경로다. 환율을 못 가져와도 해외 종목 밸류에이션이 살아 있다.
  const usdKrw = portfolio.usdKrw;
  //
  // `ccy` 는 그 짝이 어느 통화로 맞춰졌는지다 — 매수가·현재가를 화면에 찍을 때 필요하다.
  // 공시 경로는 해외 종목이어도 ₩ 라는 점이 함정이라 통화를 따로 들고 다닌다.
  const metricAndPrice = (
    symbol: string,
    manual: number | null,
    autoKrw: number | undefined,
  ): { metric: number; price: number | null; ccy: "KRW" | "USD" } | null => {
    const priceKrw = portfolio.prices[symbol];
    if (manual != null && manual > 0) {
      // 수기값은 종목 통화 → 가격을 되돌려 짝을 맞춘다.
      const native = toNativeEps(priceKrw, symbol, usdKrw);
      return { metric: manual, price: native, ccy: nativeCurrencyOf(symbol) };
    }
    if (autoKrw != null && autoKrw > 0)
      return { metric: autoKrw, price: priceKrw > 0 ? priceKrw : null, ccy: "KRW" };
    return null;
  };

  const rows: AllocateRow[] = candidates.map((symbol) => {
    // 미보유 후보는 평가액 0 — 비중 0 이라 자연히 BUY 후보가 된다.
    const value = heldValue[symbol] ?? 0;
    const label = heldName[symbol] ?? meta[symbol]?.name ?? symbol;
    const assumption = assumptions[symbol];
    const pair = metricAndPrice(
      symbol,
      assumption?.currentMetric ?? null,
      cachedEps[symbol],
    );
    // 성장률·종료배수는 판단이라 자동값이 없다 — 둘 중 하나라도 없으면 비중 기반 배분.
    const usable =
      pair != null &&
      assumption?.expectedGrowth != null &&
      assumption?.terminalMultiple != null &&
      assumption.terminalMultiple > 0;
    if (!usable) {
      // 가정이 없으면 순수 비중 기반 배분(스펙 v1.1 §15.3).
      return {
        key: symbol,
        symbol,
        label,
        value,
        target: flat[symbol] ?? 0,
      };
    }
    // 종목별 값 > 전사 기본값("난이도") > 코드 기본값 12%.
    const requiredReturn = effectiveHurdle(assumption.requiredReturn, house);
    const er = computeExpectedReturn(
      {
        currentMetric: pair.metric,
        expectedGrowth: assumption.expectedGrowth as number,
        terminalMultiple: assumption.terminalMultiple as number,
        holdingYears: assumption.holdingYears ?? undefined,
        requiredReturn,
      },
      pair.price,
    );
    return {
      key: symbol,
      symbol,
      label,
      value,
      target: flat[symbol] ?? 0,
      attractiveness: attractivenessFromCagr(er?.expectedCagr ?? null, requiredReturn),
      // 엔진이 매수 상한을 정할 때 쓰는 값(PRD §6.2). 표시에도 같은 값을 쓴다.
      expectedCagr: er?.expectedCagr ?? null,
      requiredReturn,
      // 아래 셋은 표시 전용 — "매수가 $149 / 현재 $158" 문장을 만들기 위한 것(PRD §19).
      buyPrice: er?.buyPrice ?? null,
      nativePrice: pair.price,
      nativeCcy: pair.ccy,
    };
  });

  const hasTargets = rows.some((r) => r.target > 0);

  // 허들 통과 현황 — 가정이 있는 종목만 분모에 넣는다(모르는 것을 실패로 세지 않는다).
  const judged = rows.filter((r) => r.expectedCagr != null);
  const passing = judged.filter(
    (r) => (r.expectedCagr as number) >= (r.requiredReturn ?? house),
  ).length;

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">자본배분</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            새로 생긴 돈을 목표비중과 집중도 한도에 맞춰 나눕니다.
          </p>
        </div>
        <Link
          href="/allocate/universe"
          className="mt-1 shrink-0 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97]"
        >
          후보 {candidates.length}
        </Link>
      </div>

      <HurdleCard rate={house} passing={passing} total={judged.length} />

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
