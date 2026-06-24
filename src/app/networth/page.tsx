import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import {
  companyCashPools,
  totalDeposits,
  totalWithdrawals,
} from "@/lib/finance/valuation";
import { loadPortfolioValueSeries } from "@/lib/portfolioValueSeries";
import { loadAccountGroups } from "@/lib/accounts";
import { loadLiabilities } from "@/lib/liabilities";
import { totalLiabilities, annualInterest } from "@/lib/finance/liabilities";
import { loadManualAssets } from "@/lib/realAssets";
import { totalManualAssets, manualAssetsCostBasis } from "@/lib/finance/realAssets";
import { computeBusinessReturns } from "@/lib/finance/businessReturns";
import { BusinessReturnsCard } from "@/components/networth/BusinessReturnsCard";
import { todayKST } from "@/lib/date";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { AccountGroups } from "@/components/dashboard/AccountGroups";
import { CashCard } from "@/components/dashboard/cards";
import { ValueTrendChart } from "@/components/trend/ValueTrendChart";
import { NetWorthSummary } from "@/components/networth/NetWorthSummary";
import { LiabilitiesSection } from "@/components/networth/LiabilitiesSection";
import { ManualAssetsSection } from "@/components/networth/ManualAssetsSection";

/**
 * 순자산 상세 — 홈 "현재 자산" › 에서 진입.
 *  · 맨 위: 자산추이(평가액·투입원금 꺾은선) 히어로.
 *  · 그 아래: 계좌별 보유자산 리스팅.
 * (벤치마크 라인·기간선택 토글은 이 화면 차트에 이어서 얹음.)
 */
export default async function NetWorthPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { add } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <NetWorthContent
        autoOpenDebt={add === "debt"}
        autoOpenAsset={add === "asset"}
      />
    </main>
  );
}

/**
 * 순자산 본문 — 페이지 크롬 없이 내용만.
 * 전체 페이지(`/networth`)와 바텀시트(`@sheet/(.)networth`)가 공유.
 * autoOpen* 은 + 허브 진입(?add=debt|asset)에서만 폼을 자동으로 연다(시트에서는 기본 false).
 */
export async function NetWorthContent({
  autoOpenDebt = false,
  autoOpenAsset = false,
}: {
  autoOpenDebt?: boolean;
  autoOpenAsset?: boolean;
}) {
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
  const useUsd = displayCcy === "USD" && !!portfolio.usdKrw;
  const factor = useUsd ? 1 / (portfolio.usdKrw as number) : 1;

  // 주식 사업부 누적(₩, 표시 환산은 컴포넌트 factor). 부동산 합산은 NetWorthSummaryStreamed에서.
  const initialValuationKrw = Number(portfolio.holding.initial_valuation);
  const depositsKrw = totalDeposits(portfolio.events);
  const stockInvestedKrw = initialValuationKrw + depositsKrw;
  const stockGainKrw =
    portfolio.result.currentValuation !== null
      ? portfolio.result.currentValuation +
        totalWithdrawals(portfolio.events) -
        depositsKrw -
        initialValuationKrw
      : null;

  const today = todayKST();
  const symbols = [
    ...new Set(
      portfolio.events
        .filter((e) => e.type === "BUY" && e.symbol)
        .map((e) => e.symbol as string),
    ),
  ];

  const valueSeriesPromise = loadPortfolioValueSeries({
    supabase,
    holdingId: portfolio.holding.id,
    portfolioRevision: portfolio.holding.portfolio_revision,
    foundedAt: portfolio.holding.founded_at,
    initialValuation: Number(portfolio.holding.initial_valuation),
    events: portfolio.events,
    today,
  });
  const accountGroupsPromise = loadAccountGroups(supabase, {
    holdingId: portfolio.holding.id,
    prices: portfolio.prices,
    names: portfolio.names,
    factor,
  });
  const liabilitiesPromise = loadLiabilities(supabase, portfolio.holding.id);
  const manualAssetsPromise = loadManualAssets(supabase, portfolio.holding.id);

  // 통화별 현금 풀(외화 분해 표시용)
  const pools = companyCashPools(
    portfolio.events,
    Number(portfolio.holding.initial_valuation),
  );

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">순자산</h1>

      {/* 순자산 요약 — 자산 − 부채 + 레버리지 리스크(재무상태표 바닥줄) */}
      <Suspense fallback={<SummarySkeleton />}>
        <NetWorthSummaryStreamed
          investmentKrw={portfolio.result.currentValuation}
          stockInvestedKrw={stockInvestedKrw}
          stockGainKrw={stockGainKrw}
          manualAssetsPromise={manualAssetsPromise}
          liabilitiesPromise={liabilitiesPromise}
          factor={factor}
          currency={data.currency}
          priceAvailable={data.priceAvailable}
        />
      </Suspense>

      {/* 자산추이 히어로 */}
      <Suspense fallback={<ChartSkeleton />}>
        <ValueTrendStreamed
          valueSeriesPromise={valueSeriesPromise}
          hasSymbols={symbols.length > 0}
          factor={factor}
          currency={data.currency}
        />
      </Suspense>

      {/* 보유자산 리스팅(계좌별 종목) */}
      {data.allocation.length > 0 && (
        <Suspense fallback={<CardSkeleton />}>
          <AccountGroupsStreamed
            accountGroupsPromise={accountGroupsPromise}
            currency={data.currency}
          />
        </Suspense>
      )}

      {/* 현금 — 순자산의 일부. 모든 자산을 한 화면에. */}
      <CashCard
        cash={data.cash}
        cashWeight={data.cashWeight}
        currency={data.currency}
        pools={pools}
      />

      {/* 실물·대체 자산(부동산 등 수기 평가) — 자산 쪽. */}
      <Suspense fallback={<CardSkeleton />}>
        <ManualAssetsStreamed
          manualAssetsPromise={manualAssetsPromise}
          factor={factor}
          currency={data.currency}
          today={today}
          autoOpen={autoOpenAsset}
        />
      </Suspense>

      {/* 부채 — 재무상태표의 반대편. 추가/수정/삭제. */}
      <Suspense fallback={<CardSkeleton />}>
        <LiabilitiesStreamed
          liabilitiesPromise={liabilitiesPromise}
          factor={factor}
          currency={data.currency}
          today={today}
          autoOpen={autoOpenDebt}
        />
      </Suspense>

      <p className="px-1 text-xs text-muted-foreground">
        순자산 = 투자자산 + 현금 + 실물·대체 자산 − 부채. 부동산 등 실물 자산은 직접
        입력한 평가액 기준이며, 투자 수익률(XIRR)에는 포함되지 않아요(종목 실력과 분리).
        외화는 현재 환율 기준. 벤치마크·기간 선택은 곧 추가됩니다.
      </p>
    </>
  );
}

type AccountGroupsResult = Awaited<ReturnType<typeof loadAccountGroups>>;
type LiabilitiesResult = Awaited<ReturnType<typeof loadLiabilities>>;
type ManualAssetsResult = Awaited<ReturnType<typeof loadManualAssets>>;
type ValueSeriesResult = Awaited<ReturnType<typeof loadPortfolioValueSeries>>;

async function NetWorthSummaryStreamed({
  investmentKrw,
  stockInvestedKrw,
  stockGainKrw,
  manualAssetsPromise,
  liabilitiesPromise,
  factor,
  currency,
  priceAvailable,
}: {
  investmentKrw: number | null;
  stockInvestedKrw: number;
  stockGainKrw: number | null;
  manualAssetsPromise: Promise<ManualAssetsResult>;
  liabilitiesPromise: Promise<LiabilitiesResult>;
  factor: number;
  currency: ReturnType<typeof computeDashboard>["currency"];
  priceAvailable: boolean;
}) {
  const [manualAssets, liabilities] = await Promise.all([
    manualAssetsPromise,
    liabilitiesPromise,
  ]);
  const manualTotalKrw = totalManualAssets(manualAssets);
  const assetsKrw = investmentKrw !== null ? investmentKrw + manualTotalKrw : null;

  // 사업부별 누적수익률(주식 + 부동산) — 히어로 총 누적수익률의 분해.
  const reBasis = manualAssetsCostBasis(manualAssets);
  const businessReturns = computeBusinessReturns({
    stockInvested: stockInvestedKrw,
    stockGain: stockGainKrw,
    manualCost: reBasis.cost,
    manualGain: reBasis.gain,
  });

  return (
    <>
      <NetWorthSummary
        assetsKrw={assetsKrw}
        debtKrw={totalLiabilities(liabilities)}
        annualInterestKrw={annualInterest(liabilities)}
        factor={factor}
        currency={currency}
        priceAvailable={priceAvailable}
      />
      <BusinessReturnsCard
        result={businessReturns}
        factor={factor}
        currency={currency}
      />
    </>
  );
}

async function ValueTrendStreamed({
  valueSeriesPromise,
  hasSymbols,
  factor,
  currency,
}: {
  valueSeriesPromise: Promise<ValueSeriesResult>;
  hasSymbols: boolean;
  factor: number;
  currency: ReturnType<typeof computeDashboard>["currency"];
}) {
  const { data: valueSeries } = await valueSeriesPromise;
  const { available, points } = valueSeries;
  if (!available && hasSymbols) {
    return (
      <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
        과거 시세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
    );
  }
  return <ValueTrendChart points={points} factor={factor} currency={currency} />;
}

async function AccountGroupsStreamed({
  accountGroupsPromise,
  currency,
}: {
  accountGroupsPromise: Promise<AccountGroupsResult>;
  currency: ReturnType<typeof computeDashboard>["currency"];
}) {
  const accountGroups = await accountGroupsPromise;
  return <AccountGroups groups={accountGroups} currency={currency} />;
}

async function ManualAssetsStreamed({
  manualAssetsPromise,
  factor,
  currency,
  today,
  autoOpen,
}: {
  manualAssetsPromise: Promise<ManualAssetsResult>;
  factor: number;
  currency: ReturnType<typeof computeDashboard>["currency"];
  today: string;
  autoOpen: boolean;
}) {
  const manualAssets = await manualAssetsPromise;
  return (
    <ManualAssetsSection
      items={manualAssets}
      factor={factor}
      currency={currency}
      today={today}
      autoOpen={autoOpen}
    />
  );
}

async function LiabilitiesStreamed({
  liabilitiesPromise,
  factor,
  currency,
  today,
  autoOpen,
}: {
  liabilitiesPromise: Promise<LiabilitiesResult>;
  factor: number;
  currency: ReturnType<typeof computeDashboard>["currency"];
  today: string;
  autoOpen: boolean;
}) {
  const liabilities = await liabilitiesPromise;
  return (
    <LiabilitiesSection
      items={liabilities}
      factor={factor}
      currency={currency}
      today={today}
      autoOpen={autoOpen}
    />
  );
}

function SummarySkeleton() {
  return (
    <div className="rounded-2xl bg-card p-6 shadow-card" aria-busy="true">
      <div className="h-4 w-20 animate-pulse rounded bg-secondary" />
      <div className="mt-3 h-9 w-44 animate-pulse rounded bg-secondary" />
      <div className="mt-4 h-3 w-32 animate-pulse rounded bg-secondary" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card" aria-busy="true">
      <div className="h-4 w-24 animate-pulse rounded bg-secondary" />
      <div className="mt-4 h-48 w-full animate-pulse rounded bg-secondary" />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card" aria-busy="true">
      <div className="h-4 w-28 animate-pulse rounded bg-secondary" />
      <div className="mt-3 h-7 w-36 animate-pulse rounded bg-secondary" />
      <div className="mt-3 h-3 w-24 animate-pulse rounded bg-secondary" />
    </div>
  );
}
