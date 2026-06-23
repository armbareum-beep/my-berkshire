import Link from "next/link";
import { Suspense } from "react";
import { Search, ReceiptText, Upload } from "lucide-react";
import { after } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { syncDividends } from "@/lib/dividends/sync";
import { computeDashboard } from "@/lib/dashboard";
import { computeBenchmark } from "@/lib/finance/benchmark";
import { computeStyle } from "@/lib/style";
import { parsePlan, planProgress } from "@/lib/plan";
import { getNextAction } from "@/lib/nextAction";
import { loadLiabilities } from "@/lib/liabilities";
import { totalLiabilities, leverageLevel } from "@/lib/finance/liabilities";
import { loadManualAssets } from "@/lib/realAssets";
import { totalManualAssets } from "@/lib/finance/realAssets";
import { companyCashPools } from "@/lib/finance/valuation";
import { loadAccountGroups, type AccountGroup } from "@/lib/accounts";
import { loadWatchlist } from "@/lib/watchlist";
import { loadSecurityNames, loadSecurityMeta } from "@/lib/securities";
import { groupAllocationByType } from "@/lib/allocation";
import {
  quarterBounds,
  quartersBetween,
  reviewedQuarters,
  reportStreak,
} from "@/lib/finance/quarterClose";
import { resolveHomeSignals, loadDismissed, type HomeSignal } from "@/lib/finance/homeSignal";
import { computeCelebrations, mergeCelebrations } from "@/lib/celebration";
import { computeLookThrough } from "@/lib/finance/lookThrough";
import { getOrComputeSnapshot } from "@/lib/calculationSnapshots";
import type { AllocationSlice } from "@/lib/dashboard";
import { todayKST } from "@/lib/date";
import { annualReportEligibility } from "@/lib/finance/annualReport";
import { getPortfolioDisclosureFeed } from "@/lib/finance/disclosureFeed";
import { signOut } from "@/app/auth/actions";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { HomeSignalBanner } from "@/components/dashboard/HomeSignalBanner";
import { LookThroughCard } from "@/components/dashboard/LookThroughCard";
import { AccountGroups } from "@/components/dashboard/AccountGroups";
import { CurrencyProvider } from "@/components/dashboard/CurrencyProvider";
import { CurrencyView } from "@/components/dashboard/CurrencyView";
import {
  HeroValuationCard,
  PriceUnavailableCard,
  PerformanceCard,
  AllocationCard,
  CashCard,
  CardShell,
  CardAction,
  RecentActivityCard,
} from "@/components/dashboard/cards";
import { StyleCard } from "@/components/dashboard/StyleCard";

/**
 * CEO 대시보드 — 확장 가능한 카드 그리드.
 * 각 카드는 독립 컴포넌트(데이터=lib/dashboard, 뷰=components/dashboard).
 * 카드 순서는 설정 배열(CARD_ORDER)로 관리 — 추후 "대시보드 꾸미기"(켜고 끄기) 대비.
 */
// 홈은 "한눈에 보는 콘솔" — 핵심만. 자산 깊이(보유·구성·현금·마찰)는 자산 탭,
// 회사연혁은 연혁 탭으로 분배(대시보드 길이↓, 사이트맵 정합).
//
// 상단 3렌즈(버핏式) — 넓은→좁은 깔때기로 붙여서 "서로 다른 걸 잰다"를 인접성으로 가르침:
//   순자산(Hero, 위) = 규모(전 재산) → performance = 성과(가격) → lookthrough = 본질(이익).
// 그 아래는 자산 깊이(계좌·현금·구성) → 리포트 → 스타일 → 최근활동 순.
const CARD_ORDER = [
  "performance",
  "lookthrough",
  "holdings",
  "report",
  "style",
  "recent",
] as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 배당 자동 정산 — 응답을 막지 않고 백그라운드로. 멱등(중복 생성 안 함).
  // 새로 생성된 배당은 다음 방문/새로고침 때 반영(대시보드는 매 요청 재조회).
  after(() => syncDividends(supabase));

  return <DashboardContent supabase={supabase} isWelcome={welcome === "1"} />;
}

async function DashboardContent({
  supabase,
  isWelcome,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  isWelcome: boolean;
}) {
  const [portfolio, cookieStore] = await Promise.all([
    getPortfolio(supabase),
    cookies(),
  ]);
  if (!portfolio) redirect("/onboarding");

  const { holding, result, eventCount, daysSinceLastEvent } = portfolio;
  // 쿠키는 SSR 초깃값(어느 통화를 먼저 보일지)만 결정 — 전환 자체는 클라이언트에서.
  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
// ₩·$ 두 표시버전을 서버에서 미리 렌더 → 토글은 클라이언트에서 둘 중 하나만 보여 **즉시** 전환.
  // 계산은 항상 ₩ 기준. dataKRW 를 통화무관 필드(구성·비중·최근활동)의 캐논으로도 쓴다.
  const dataKRW = computeDashboard(portfolio, "KRW");
  const dataUSD = computeDashboard(portfolio, "USD");
  const data = dataKRW;
  const hasEvents = eventCount > 0;
  const today = todayKST();
  // ₩→$ 환산 계수($ 버전 숫자에 곱함). 환율 없으면 1(=₩과 동일).
  const factorUSD = portfolio.usdKrw ? 1 / portfolio.usdKrw : 1;

  // 투시(내 사업부 실적) 소스 — 펀더멘털이 ₩이므로 항상 ₩ allocation 으로 계산.
  const doLookThrough =
    dataKRW.priceAvailable && dataKRW.allocation.length > 0;

  // 벤치마크 스냅샷(₩·$ 두 지수 모두 동일 흐름).
  const benchSnapshot = {
    foundedAt: holding.founded_at,
    initialValuation: Number(holding.initial_valuation),
  };

  // 독립적인 서버 조회는 한 번에 병렬 실행 — 순차 await 의 지연 누적을 제거.
  // 환율 토글(router.refresh)·첫 로딩 모두 여기서 가장 큰 속도 이득.
  //  · secMeta=자산 구성 유형 메타  · benchmark=vs 시장 PME(원화 KOSPI/달러 S&P)
  //  · liabilities/manualAssets=부채·수기자산  · accountGroups=계좌별 보유
  //  · watch/dismissed=알림 큐 입력  · lookThrough=투시 펀더멘털(한국주식 있을 때만)
  // 토글이 즉시이려면 두 통화 버전이 렌더 시점에 모두 준비돼야 함 → 양쪽 지수(KOSPI·S&P)를
  // 항상 병렬로 받아 둔다(둘 다 캐시됨). 계좌 그룹은 ₩으로 한 번만 적재해 $ 는 메모리 환산.
  // 투시(lookThrough)는 DART N+1 으로 가장 느려 → Promise.all 에서 빼고 Suspense 로 스트리밍.
  // 나머지 카드는 이걸 안 기다리고 먼저 그려진다(홈 첫 페인트 가속).
  const secMetaPromise = loadSecurityMeta(
    supabase,
    dataKRW.allocation.map((a) => a.symbol),
  );
  const benchmarkKRWPromise = computeBenchmark(
    benchSnapshot,
    portfolio.events,
    today,
    "KRW",
  );
  const benchmarkUSDPromise = computeBenchmark(
    benchSnapshot,
    portfolio.events,
    today,
    "USD",
  );
  const liabilitiesPromise = loadLiabilities(supabase, holding.id);
  const manualAssetsPromise = loadManualAssets(supabase, holding.id);
  const accountGroupsKRWPromise = loadAccountGroups(supabase, {
    holdingId: holding.id,
    prices: portfolio.prices,
    names: portfolio.names,
    factor: 1, // ₩ 기준 적재 → $ 는 메모리에서 환산(추가 쿼리 없음)
  });
  const watchSymbolsPromise = loadWatchlist(supabase, holding.id);
  const dismissedPromise = loadDismissed(supabase, holding.id);

  const nextAction = getNextAction({
    hasHolding: true,
    eventCount,
    daysSinceLastEvent,
  });

  // 저장된 자본배분 계획이 미완료면 배너로 알림(까먹지 않게)
  const plan = parsePlan(holding.active_plan);
  const planProg = plan ? planProgress(plan, portfolio.events) : null;
  const showPlanBanner = planProg != null && !planProg.complete;

  // 자산 섹션(구 /holdings 흡수) — 계좌별 보유·구성·현금·마찰.
  const pools = companyCashPools(
    portfolio.events,
    Number(holding.initial_valuation),
  );
  // 재방문 후크(토스식 알림 큐) — 공시·배당·리포트·관심종목 변동을 우선순위 1개씩.
  const heldSymbols = Object.keys(portfolio.positions).filter(
    (s) => portfolio.positions[s] > 0,
  );
  const cardMap: Record<string, React.ReactNode> = {
    performance: (
      <Suspense key="performance" fallback={<DashboardCardSkeleton />}>
        <PerformanceStreamed
          result={result}
          benchmarkKRWPromise={benchmarkKRWPromise}
          benchmarkUSDPromise={benchmarkUSDPromise}
          profitKRW={dataKRW.profit}
          profitUSD={dataUSD.profit}
          investedKRW={dataKRW.invested}
          investedUSD={dataUSD.invested}
          welcome={isWelcome}
        />
      </Suspense>
    ),
    report: (
      <Suspense key="report" fallback={<DashboardCardSkeleton />}>
        <ReportLinkStreamed
          foundedAt={holding.founded_at}
          today={today}
          dismissedPromise={dismissedPromise}
        />
      </Suspense>
    ),
    style: (
      <Suspense key="style" fallback={<DashboardCardSkeleton />}>
        <StyleStreamed
          portfolio={portfolio}
          data={data}
          liabilitiesPromise={liabilitiesPromise}
          securityMetaPromise={secMetaPromise}
          planRatio={
            planProg && planProg.total > 0
              ? planProg.doneCount / planProg.total
              : null
          }
        />
      </Suspense>
    ),
    lookthrough: (
      <Suspense key="lookthrough" fallback={<LookThroughCardSkeleton />}>
        <LookThroughStreamed
          supabase={supabase}
          enabled={doLookThrough}
          allocation={dataKRW.allocation}
          invested={dataKRW.invested}
          holdingId={portfolio.holding.id}
          portfolioRevision={portfolio.holding.portfolio_revision}
          asOfDate={today}
          year={Number(today.slice(0, 4))}
          factorUSD={factorUSD}
        />
      </Suspense>
    ),
    holdings:
      data.allocation.length === 0 ? (
        <div
          key="holdings"
          className="rounded-2xl bg-card p-6 text-center shadow-card"
        >
          <p className="text-sm text-muted-foreground">
            포트폴리오가 비어 있습니다.
          </p>
          <Link
            href="/transactions"
            className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            첫 매수 기록하기
          </Link>
        </div>
      ) : (
        <Suspense key="holdings" fallback={<DashboardStackSkeleton />}>
          <HoldingsStreamed
            dataKRW={dataKRW}
            dataUSD={dataUSD}
            factorUSD={factorUSD}
            pools={pools}
            secMetaPromise={secMetaPromise}
            accountGroupsKRWPromise={accountGroupsKRWPromise}
          />
        </Suspense>
      ),
    recent: <RecentActivityCard key="recent" recent={data.recent} />,
  };

  return (
    <CurrencyProvider initial={displayCcy}>
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          {/* 브랜드 워드마크 — 잉크 타이포(색면 없음). 회사명은 그 아래 하위 정보. */}
          <span className="text-2xl font-extrabold tracking-tight text-foreground">
            ENUF
          </span>
          <Link
            href="/company"
            className="truncate text-sm font-medium text-muted-foreground"
          >
            {holding.name} ›
          </Link>
          <p className="text-xs text-muted-foreground">
            설립 {holding.founded_at} ·{" "}
            {holding.mode === "challenge" ? "챌린지" : "장부"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/search"
            aria-label="종목 검색"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-muted-foreground"
          >
            <Search size={16} />
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-muted-foreground"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      {/* 미완료 꼬리표(레일 4) */}
      {!hasEvents && (
        <Link
          href="/transactions"
          className="rounded-xl bg-accent px-4 py-3 text-sm font-medium text-accent-foreground"
        >
          회사를 세웠지만 아직 투자가 없습니다 →
        </Link>
      )}

      {/* Next Action — 할 일이 있을 때만(평시엔 하단 + 버튼이 거래 담당) */}
      {nextAction && (
        <Link
          href={nextAction.href}
          className="flex h-13 w-full items-center justify-center rounded-xl bg-primary py-4 text-base font-semibold text-primary-foreground"
        >
          {nextAction.label}
        </Link>
      )}

      {/* 자본배분 계획 진행 배너(미완료 시) — 까먹지 않게 */}
      {showPlanBanner && (
        <Link
          href="/rebalance"
          className="flex items-center justify-between rounded-xl bg-accent px-4 py-3 text-sm font-medium text-accent-foreground"
        >
          <span>
            리밸런싱 계획 {planProg!.doneCount}/{planProg!.total} 종목 체결
          </span>
          <span>→</span>
        </Link>
      )}

      {/* 재방문 후크 — 축하·소프트 뉴스(최신순). 확인하면 다음 알림. */}
      <Suspense fallback={null}>
        <HomeSignalsStreamed
          supabase={supabase}
          portfolio={portfolio}
          heldSymbols={heldSymbols}
          watchSymbolsPromise={watchSymbolsPromise}
          dismissedPromise={dismissedPromise}
          today={today}
          planProg={
            planProg
              ? { complete: planProg.complete, createdAt: planProg.createdAt }
              : null
          }
        />
      </Suspense>

      <Suspense fallback={null}>
        <DisclosureCountStreamed
          heldSymbols={heldSymbols}
          dismissedPromise={dismissedPromise}
          today={today}
        />
      </Suspense>

      {/* 레버리지 경고 — 큐 아래(상시 리스크). X 로 끌 수 있음(월·레벨별 재등장). */}
      <Suspense fallback={null}>
        <LeverageSignalsStreamed
          result={result}
          liabilitiesPromise={liabilitiesPromise}
          manualAssetsPromise={manualAssetsPromise}
          dismissedPromise={dismissedPromise}
          today={today}
        />
      </Suspense>

      {/* 시세 실패 분기(PRD 6) */}
      {dataKRW.priceAvailable ? (
        <>
          <Suspense fallback={<HeroCardSkeleton />}>
            <HeroValuationStreamed
              result={result}
              dataKRW={dataKRW}
              dataUSD={dataUSD}
              factorUSD={factorUSD}
              liabilitiesPromise={liabilitiesPromise}
              manualAssetsPromise={manualAssetsPromise}
            />
          </Suspense>
          {CARD_ORDER.map((key) => cardMap[key])}
        </>
      ) : (
        <>
          <PriceUnavailableCard missing={result.missingSymbols} />
          {cardMap.recent}
        </>
      )}

      {/* 거래내역 가져오기 — 장부 모드 전용 */}
      {holding.mode === "ledger" && (
        <Link
          href="/import"
          className="flex items-center gap-3 rounded-2xl bg-card p-5 shadow-card transition active:scale-[0.99]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Upload size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold">거래내역 가져오기</p>
            <p className="text-xs text-muted-foreground">키움·KB·미래에셋 등 파일 업로드</p>
          </div>
          <span className="ml-auto text-muted-foreground">›</span>
        </Link>
      )}

      <BottomTabBar />
    </main>
    </CurrencyProvider>
  );
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;
type PortfolioSnapshot = NonNullable<Awaited<ReturnType<typeof getPortfolio>>>;
type DashboardData = ReturnType<typeof computeDashboard>;
type BenchmarkSnapshot = Awaited<ReturnType<typeof computeBenchmark>>;
type DismissedSignals = Awaited<ReturnType<typeof loadDismissed>>;

async function PerformanceStreamed({
  result,
  benchmarkKRWPromise,
  benchmarkUSDPromise,
  profitKRW,
  profitUSD,
  investedKRW,
  investedUSD,
  welcome,
}: {
  result: PortfolioSnapshot["result"];
  benchmarkKRWPromise: Promise<BenchmarkSnapshot>;
  benchmarkUSDPromise: Promise<BenchmarkSnapshot>;
  profitKRW: number | null;
  profitUSD: number | null;
  investedKRW: number;
  investedUSD: number;
  welcome: boolean;
}) {
  const [benchmarkKRW, benchmarkUSD] = await Promise.all([
    benchmarkKRWPromise,
    benchmarkUSDPromise,
  ]);

  return (
    <CurrencyView
      krw={
        <PerformanceCard
          result={result}
          benchmark={benchmarkKRW}
          profit={profitKRW}
          invested={investedKRW}
          currency="KRW"
          welcome={welcome}
        />
      }
      usd={
        <PerformanceCard
          result={result}
          benchmark={benchmarkUSD}
          profit={profitUSD}
          invested={investedUSD}
          currency="USD"
          welcome={welcome}
        />
      }
    />
  );
}

async function HeroValuationStreamed({
  result,
  dataKRW,
  dataUSD,
  factorUSD,
  liabilitiesPromise,
  manualAssetsPromise,
}: {
  result: PortfolioSnapshot["result"];
  dataKRW: DashboardData;
  dataUSD: DashboardData;
  factorUSD: number;
  liabilitiesPromise: Promise<Awaited<ReturnType<typeof loadLiabilities>>>;
  manualAssetsPromise: Promise<Awaited<ReturnType<typeof loadManualAssets>>>;
}) {
  const [liabilities, manualAssets] = await Promise.all([
    liabilitiesPromise,
    manualAssetsPromise,
  ]);
  const debtKrw = totalLiabilities(liabilities);
  const totalAssetsKrw =
    result.currentValuation !== null
      ? result.currentValuation + totalManualAssets(manualAssets)
      : null;
  const netWorthKrw =
    totalAssetsKrw !== null ? totalAssetsKrw - debtKrw : null;
  const cashKrw = result.currentValuation !== null ? dataKRW.cash : 0;
  const stocksKrw =
    result.currentValuation !== null ? result.currentValuation - cashKrw : 0;
  const manualKrw = totalManualAssets(manualAssets);
  const netWorthPartsKrw: { label: string; value: number }[] =
    result.currentValuation !== null
      ? [
          { label: "주식 등", value: stocksKrw },
          { label: "현금", value: cashKrw },
          { label: "부동산 등", value: manualKrw },
          { label: "빚", value: -debtKrw },
        ]
      : [];
  const netWorthPartsUSD =
    factorUSD === 1
      ? netWorthPartsKrw
      : netWorthPartsKrw.map((p) => ({ ...p, value: p.value * factorUSD }));

  return (
    <CurrencyView
      krw={
        <HeroValuationCard
          netWorth={netWorthKrw ?? 0}
          dailyChange={dataKRW.dailyChange}
          currency="KRW"
          parts={netWorthPartsKrw}
        />
      }
      usd={
        <HeroValuationCard
          netWorth={(netWorthKrw ?? 0) * factorUSD}
          dailyChange={dataUSD.dailyChange}
          currency="USD"
          parts={netWorthPartsUSD}
        />
      }
    />
  );
}

async function HoldingsStreamed({
  dataKRW,
  dataUSD,
  factorUSD,
  pools,
  secMetaPromise,
  accountGroupsKRWPromise,
}: {
  dataKRW: DashboardData;
  dataUSD: DashboardData;
  factorUSD: number;
  pools: Record<string, number>;
  secMetaPromise: Promise<Awaited<ReturnType<typeof loadSecurityMeta>>>;
  accountGroupsKRWPromise: Promise<Awaited<ReturnType<typeof loadAccountGroups>>>;
}) {
  const [secMeta, accountGroupsKRW] = await Promise.all([
    secMetaPromise,
    accountGroupsKRWPromise,
  ]);
  const accountGroupsUSD: AccountGroup[] =
    factorUSD === 1
      ? accountGroupsKRW
      : accountGroupsKRW.map((g) => ({
          ...g,
          value: g.value * factorUSD,
          gain: g.gain === null ? null : g.gain * factorUSD,
          holdings: g.holdings.map((h) => ({
            ...h,
            value: h.value * factorUSD,
            gain: h.gain === null ? null : h.gain * factorUSD,
          })),
        }));
  const allocationGroups = groupAllocationByType(dataKRW.allocation, secMeta);

  return (
    <div className="flex flex-col gap-4">
      <CardShell
        title="보유 계좌"
        href="/holdings"
        scroll={false}
        footer={<CardAction href="/accounts">계좌 관리</CardAction>}
      >
        <CurrencyView
          krw={
            <AccountGroups
              groups={accountGroupsKRW}
              currency="KRW"
              bare
              singleOpen
            />
          }
          usd={
            <AccountGroups
              groups={accountGroupsUSD}
              currency="USD"
              bare
              singleOpen
            />
          }
        />
      </CardShell>

      {dataKRW.priceAvailable && (
        <>
          <CurrencyView
            krw={
              <CashCard
                cash={dataKRW.cash}
                cashWeight={dataKRW.cashWeight}
                currency="KRW"
                pools={pools}
                footer={<CardAction href="/dividends" scroll={false}>배당 — 언제 얼마 받나</CardAction>}
              />
            }
            usd={
              <CashCard
                cash={dataUSD.cash}
                cashWeight={dataKRW.cashWeight}
                currency="USD"
                pools={pools}
                footer={<CardAction href="/dividends" scroll={false}>배당 — 언제 얼마 받나</CardAction>}
              />
            }
          />
          <AllocationCard
            groups={allocationGroups}
            footer={<CardAction href="/rebalance">목표비중 · 리밸런싱</CardAction>}
          />
        </>
      )}
    </div>
  );
}

async function ReportLinkStreamed({
  foundedAt,
  today,
  dismissedPromise,
}: {
  foundedAt: string;
  today: string;
  dismissedPromise: Promise<DismissedSignals>;
}) {
  const dismissed = await dismissedPromise;
  const reportStreakN = reportStreak(
    quartersBetween(foundedAt, today).map((q) => q.label),
    reviewedQuarters(dismissed),
  );
  const annual = annualReportEligibility(foundedAt, today);

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <Link href="/report" scroll={false} className="block transition active:opacity-70">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <ReceiptText size={15} className="text-muted-foreground" /> 분기 경영 리포트
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            이번 분기 수익률·활동·배당 한눈에
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {reportStreakN > 0 && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
              🔥 {reportStreakN}
            </span>
          )}
          <span className="text-muted-foreground">›</span>
        </span>
      </div>
      </Link>
      <Link
        href="/annual-report"
        className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm font-semibold transition active:opacity-70"
      >
        <span>ENUF Annual Report</span>
        <span className="text-xs text-muted-foreground">
          {annual.eligible
            ? `${today.slice(0, 4)} 발행됨 ›`
            : `D-${annual.remainingDays} · 준비 중 ›`}
        </span>
      </Link>
    </section>
  );
}

async function StyleStreamed({
  portfolio,
  data,
  liabilitiesPromise,
  securityMetaPromise,
  planRatio,
}: {
  portfolio: PortfolioSnapshot;
  data: DashboardData;
  liabilitiesPromise: Promise<Awaited<ReturnType<typeof loadLiabilities>>>;
  securityMetaPromise: ReturnType<typeof loadSecurityMeta>;
  planRatio: number | null;
}) {
  const [liabilities, securityMeta] = await Promise.all([
    liabilitiesPromise,
    securityMetaPromise,
  ]);

  return (
    <StyleCard
      style={computeStyle(
        portfolio,
        data,
        totalLiabilities(liabilities),
        planRatio,
        securityMeta,
      )}
    />
  );
}

async function HomeSignalsStreamed({
  supabase,
  portfolio,
  heldSymbols,
  watchSymbolsPromise,
  dismissedPromise,
  today,
  planProg,
}: {
  supabase: SupabaseServer;
  portfolio: PortfolioSnapshot;
  heldSymbols: string[];
  watchSymbolsPromise: Promise<string[]>;
  dismissedPromise: Promise<DismissedSignals>;
  today: string;
  planProg: { complete: boolean; createdAt: string } | null;
}) {
  const [watchSymbols, dismissed] = await Promise.all([
    watchSymbolsPromise,
    dismissedPromise,
  ]);
  const watchNames = await loadSecurityNames(supabase, watchSymbols);
  const newsSignals = await resolveHomeSignals({
    events: portfolio.events,
    heldSymbols,
    watchSymbols,
    names: { ...watchNames, ...portfolio.names },
    today,
    quarterLabel: quarterBounds(today).label,
    dismissed,
  });
  const celebrations = computeCelebrations({
    holdingName: portfolio.holding.name,
    foundedAt: portfolio.holding.founded_at,
    today,
    plan: planProg,
    dismissed,
  });
  const signals = mergeCelebrations(newsSignals, celebrations);

  return signals.length > 0 ? <HomeSignalBanner signals={signals} /> : null;
}

async function DisclosureCountStreamed({
  heldSymbols,
  dismissedPromise,
  today,
}: {
  heldSymbols: string[];
  dismissedPromise: Promise<DismissedSignals>;
  today: string;
}) {
  if (heldSymbols.length === 0) return null;
  const fromDate = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  const [feed, dismissed] = await Promise.all([
    getPortfolioDisclosureFeed(heldSymbols, fromDate, today, 10, 100),
    dismissedPromise,
  ]);
  const unread = feed.filter(
    (item) =>
      item.priority !== "noise" &&
      !dismissed.has(item.readKey),
  ).length;
  if (unread === 0) return null;
  return (
    <Link
      href="/disclosures"
      scroll={false}
      className="flex items-center justify-between rounded-xl bg-card px-4 py-3 text-sm font-semibold shadow-card transition active:scale-[0.99]"
    >
      <span>내 사업부 소식</span>
      <span className="rounded-full bg-primary px-2.5 py-1 text-xs text-primary-foreground">
        {unread}
      </span>
    </Link>
  );
}

async function LeverageSignalsStreamed({
  result,
  liabilitiesPromise,
  manualAssetsPromise,
  dismissedPromise,
  today,
}: {
  result: PortfolioSnapshot["result"];
  liabilitiesPromise: Promise<Awaited<ReturnType<typeof loadLiabilities>>>;
  manualAssetsPromise: Promise<Awaited<ReturnType<typeof loadManualAssets>>>;
  dismissedPromise: Promise<DismissedSignals>;
  today: string;
}) {
  const [liabilities, manualAssets, dismissed] = await Promise.all([
    liabilitiesPromise,
    manualAssetsPromise,
    dismissedPromise,
  ]);
  const debtKrw = totalLiabilities(liabilities);
  const totalAssetsKrw =
    result.currentValuation !== null
      ? result.currentValuation + totalManualAssets(manualAssets)
      : null;
  const levLevel =
    totalAssetsKrw !== null ? leverageLevel(totalAssetsKrw, debtKrw) : "none";
  const showLeverageBanner = levLevel === "caution" || levLevel === "danger";
  const levKey = `lev:${levLevel}:${today.slice(0, 7)}`;
  const leverageSignals: HomeSignal[] =
    showLeverageBanner && !dismissed.has(levKey)
      ? [
          {
            key: levKey,
            icon: levLevel === "danger" ? "🔴" : "🟡",
            text: `레버리지 ${levLevel === "danger" ? "위험" : "주의"} — 부채 비중을 확인하세요`,
            href: "/networth",
            tone: levLevel === "danger" ? "warn" : "info",
          },
        ]
      : [];

  return leverageSignals.length > 0 ? (
    <HomeSignalBanner signals={leverageSignals} />
  ) : null;
}

function DashboardCardSkeleton() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card" aria-busy="true">
      <div className="h-4 w-28 animate-pulse rounded bg-secondary" />
      <div className="mt-3 h-7 w-36 animate-pulse rounded bg-secondary" />
      <div className="mt-3 h-3 w-24 animate-pulse rounded bg-secondary" />
    </div>
  );
}

function HeroCardSkeleton() {
  return (
    <div className="rounded-2xl bg-card p-6 shadow-card" aria-busy="true">
      <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
      <div className="mt-3 h-9 w-44 animate-pulse rounded bg-secondary" />
      <div className="mt-3 h-3 w-32 animate-pulse rounded bg-secondary" />
    </div>
  );
}

function DashboardStackSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <DashboardCardSkeleton />
      <DashboardCardSkeleton />
      <DashboardCardSkeleton />
    </div>
  );
}

/**
 * 투시 카드 — DART N+1 으로 가장 느려 Suspense 경계에서 별도 스트리밍.
 * 홈은 이 카드를 기다리지 않고 먼저 페인트되고, 데이터가 오면 스켈레톤이 카드로 교체된다.
 */
async function LookThroughStreamed({
  supabase,
  enabled,
  allocation,
  invested,
  holdingId,
  portfolioRevision,
  asOfDate,
  year,
  factorUSD,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  enabled: boolean;
  allocation: AllocationSlice[];
  invested: number;
  holdingId: string;
  portfolioRevision: number;
  asOfDate: string;
  year: number;
  factorUSD: number;
}) {
  const lt = enabled
    ? (
        await getOrComputeSnapshot({
          supabase,
          holdingId,
          kind: "lookthrough-current",
          portfolioRevision,
          asOfDate,
          ttlMs: 5 * 60 * 1000,
          compute: () =>
            computeLookThrough(supabase, { allocation, year, invested }),
        })
      ).data
    : null;

  if (lt && lt.coverage.includedCount > 0) {
    return (
      <CurrencyView
        krw={
          <LookThroughCard
            netIncome={lt.netIncome}
            per={lt.per}
            pbr={lt.pbr}
            roe={lt.roe}
            factor={1}
            currency="KRW"
          />
        }
        usd={
          <LookThroughCard
            netIncome={lt.netIncome}
            per={lt.per}
            pbr={lt.pbr}
            roe={lt.roe}
            factor={factorUSD}
            currency="USD"
          />
        }
      />
    );
  }
  return <LookThroughFallbackLink />;
}

/** 투시 카드 로딩 스켈레톤(스트리밍 대기 동안). */
function LookThroughCardSkeleton() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card" aria-busy="true">
      <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
      <div className="mt-3 h-7 w-40 animate-pulse rounded bg-secondary" />
      <div className="mt-3 h-3 w-28 animate-pulse rounded bg-secondary" />
    </div>
  );
}

/** 반영할 한국 주식 공시가 없을 때 — 정적 링크 카드. */
function LookThroughFallbackLink() {
  return (
    <Link
      href="/lookthrough"
      scroll={false}
      className="block rounded-2xl bg-card p-5 shadow-card transition active:scale-[0.99]"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">🏭 내 사업부 실적</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            보유 회사들의 투시 펀더멘털 — 지분만큼 내 몫
          </p>
        </div>
        <span className="text-muted-foreground">›</span>
      </div>
    </Link>
  );
}
