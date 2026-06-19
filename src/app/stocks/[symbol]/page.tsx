import Link from "next/link";
import { Suspense } from "react";
import { Building2, AlertTriangle } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { findCatalogItem } from "@/lib/finance/catalog";
import { loadSecurityMeta, qtyUnit } from "@/lib/securities";
import { getDividends, annualDpsNative } from "@/lib/finance/dividends";
import { getDisclosures, getLatestFundamentalSet, getFundamentalsSeries } from "@/lib/finance/dart";
import { getTenYearTreasury } from "@/lib/finance/rates";
import { getCompanyProfile } from "@/lib/finance/companyProfile";
import { getYearEndCloses, getKrwPrices, getDailyKrwCloses } from "@/lib/finance/prices";
import { loadWatchlist } from "@/lib/watchlist";
import { WatchToggle } from "@/components/stocks/WatchToggle";
import {
  loadValuationAssumptions,
  loadManualMagnitudes,
} from "@/lib/manualFundamentals";
import { todayKST } from "@/lib/date";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { DisclosureList } from "@/components/disclosures/DisclosureList";
import { DnaYearPanel } from "@/components/stocks/DnaYearPanel";
import { DiscountRateInput } from "@/components/stocks/DiscountRateInput";
import { GrowthRateInput } from "@/components/stocks/GrowthRateInput";
import { FundamentalsTrend } from "@/components/stocks/FundamentalsTrend";
import { FinancialHealth } from "@/components/stocks/FinancialHealth";
import { computeFundamentalFlags } from "@/lib/finance/fundamentalFlags";
import { CountUp } from "@/components/ui/CountUp";
import { PriceChart } from "@/components/stocks/PriceChart";
import { Metric } from "@/components/stocks/MetricCard";
import { PeriodSelector } from "@/components/stocks/PeriodSelector";
import { computeIntrinsic, discountRate } from "@/lib/finance/intrinsic";
import { parseSelection, computeBasis, basisFromFundamentals } from "@/lib/finance/normalize";
import { won, wonCompact, pct, signedPct, changeColor } from "@/lib/format";

const EVENT_LABEL: Record<string, string> = {
  BUY: "매수",
  SELL: "매도",
  DIVIDEND: "배당",
  DEPOSIT: "증자",
  WITHDRAWAL: "인출",
};

export default async function StockDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const { symbol } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");

  // searchParams 는 name 폴백·상세 탭·fy(기준 연도)에 쓴다.
  const sp = await searchParams;
  const nameParam = typeof sp.name === "string" ? sp.name : null;
  // 재무신호 카드에서 진입하면 재무제표 섹션을 펼친 채로(#financials 로 스크롤).
  const openFinancials = sp.view === "financials";
  const view =
    sp.view === "analysis" || sp.view === "financials"
      ? "analysis"
      : sp.view === "records"
        ? "records"
        : "overview";
  const needsFundamentals = view !== "records";
  const name =
    portfolio.names[symbol] ?? nameParam ?? findCatalogItem(symbol)?.name ?? symbol;
  const qty = portfolio.positions[symbol] ?? 0;
  const held = qty > 0;

  const today = todayKST();
  const fromDate = `${Number(today.slice(0, 4)) - 2}${today.slice(4)}`;
  const fromDisc = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  // 보유 종목은 포트폴리오 시세 사용, 미보유(연구·관심종목)는 직접 조회.
  const heldPrice = portfolio.prices[symbol] ?? null;

  // 종목 상세의 독립적인 외부 조회를 한 번에 병렬 — 시세(미보유 시)·관심종목·배당·공시·펀더멘털.
  const [priceFetch, watchSymbols, feed, disclosures, fundamentalSet] =
    await Promise.all([
      heldPrice == null
        ? getKrwPrices([symbol])
        : Promise.resolve(null),
      loadWatchlist(supabase, portfolio.holding.id),
      needsFundamentals
        ? getDividends([symbol], fromDate, today)
        : Promise.resolve(
            {} as Awaited<ReturnType<typeof getDividends>>,
          ),
      view === "overview"
        ? getDisclosures(symbol, fromDisc, today, 5)
        : Promise.resolve([]),
      needsFundamentals
        ? getLatestFundamentalSet(symbol, Number(today.slice(0, 4)), supabase)
        : Promise.resolve({
            ttm: null,
            latestAnnual: null,
            fallbackReason: "내 기록 탭에서는 재무 데이터를 불러오지 않습니다.",
          }),
    ]);
  const fundamentals = fundamentalSet.latestAnnual;
  const price =
    heldPrice ?? (priceFetch ? priceFetch.prices[symbol] ?? null : null);
  const watched = watchSymbols.includes(symbol); // 관심종목 여부(미보유여도 별표)

  // 평균단가 = Σ(매수 수량×단가)/Σ(매수 수량) (활성 이벤트)
  const buys = portfolio.events.filter(
    (e) => e.symbol === symbol && e.type === "BUY",
  );
  const buyQty = buys.reduce((s, e) => s + (e.quantity ?? 0), 0);
  const buyCost = buys.reduce((s, e) => s + (e.quantity ?? 0) * e.priceOrAmount, 0);
  const avgCost = buyQty > 0 ? buyCost / buyQty : 0;

  const value = price != null ? qty * price : null;
  const ret = price != null && avgCost > 0 ? (price - avgCost) / avgCost : null;

  // 배당수익률(현재가 기준) — 최근 12개월 배당(이력 부족 시 주기 추정) ÷ 현재가.
  const sd = feed[symbol];
  const divRate =
    sd?.currency === "KRW" ? 1 : sd?.currency === "USD" ? portfolio.usdKrw : null;
  const annualDps = sd ? annualDpsNative(sd.payments, today) : 0;
  // 1주당 연 배당(₩) — 네이티브 DPS × 환율
  const annualDpsKrw = divRate != null ? annualDps * divRate : null;
  const divYield =
    annualDpsKrw != null && price != null && price > 0
      ? annualDpsKrw / price
      : null;
  // 6개 연도 확보 → 5년 CAGR(2020→2025 식) 가능. 차트·셀렉터도 6년.
  const assumptionsPromise = fundamentals
    ? loadValuationAssumptions(supabase, portfolio.holding.id, symbol)
    : Promise.resolve(null);
  const magnitudesPromise = fundamentals
    ? loadManualMagnitudes(supabase, portfolio.holding.id, symbol)
    : Promise.resolve(new Map());
  const tenYearPromise = fundamentals
    ? getTenYearTreasury(Number(today.slice(0, 4)))
    : Promise.resolve(null);
  const rawSeries = fundamentals
    ? await getFundamentalsSeries(symbol, Number(today.slice(0, 4)), 6, supabase)
    : [];
  // 추이가 비면 최신 단년으로라도 동작.
  const series = rawSeries.length ? rawSeries : fundamentals ? [fundamentals] : [];
  // 펀더멘털 플래그(§11) — "이익이 진짜인가" 질문. 규칙 기반·토큰 0. 금융업은 엔진이 건너뜀.
  const fundamentalFlags = computeFundamentalFlags(series);

  // 과거 PER(당시 종가 기준) — 연말 종가 ÷ 그해 EPS. 현재가로 과거 PER 만들면 왜곡되므로.
  const yearEnd =
    series.length && fundamentals
      ? await getYearEndCloses(
          symbol,
          series[series.length - 1].year,
          series[0].year,
        )
      : new Map<number, number>();
  // 최신 사업연도는 **현재가**(연말 종가는 이미 지난값), 과거는 **그해 연말종가**.
  const latestFy = series[0]?.year ?? null;
  const perByYear = new Map<number, number>();
  const pbrByYear = new Map<number, number>();
  const psrByYear = new Map<number, number>();
  const mcapByYear = new Map<number, number>();
  for (const f of series) {
    const px = f.year === latestFy ? price : yearEnd.get(f.year) ?? null;
    if (px == null || !f.shares || f.shares <= 0) continue;
    const mcapY = px * f.shares;
    mcapByYear.set(f.year, mcapY);
    if (f.netIncome != null && f.netIncome > 0)
      perByYear.set(f.year, mcapY / f.netIncome); // = 종가 / EPS
    if (f.equity != null && f.equity > 0)
      pbrByYear.set(f.year, mcapY / f.equity); // = 종가 / BPS
    if (f.revenue != null && f.revenue > 0)
      psrByYear.set(f.year, mcapY / f.revenue); // = 시총 / 매출
  }

  // 성장률(CAGR) — 추이 시리즈의 가장 오래된 해→최신 해. 둘 다 양수일 때만(부호 바뀌면 N/A).
  const spanYears = series.length > 1 ? series[0].year - series[series.length - 1].year : 0;
  const cagrOf = (newest: number | null, oldest: number | null): number | null =>
    newest != null && oldest != null && oldest > 0 && newest > 0 && spanYears > 0
      ? Math.pow(newest / oldest, 1 / spanYears) - 1
      : null;
  const oldestF = series[series.length - 1];
  const revenueCagr = cagrOf(series[0]?.revenue ?? null, oldestF?.revenue ?? null);
  const netIncomeCagr = cagrOf(series[0]?.netIncome ?? null, oldestF?.netIncome ?? null);
  const operatingIncomeCagr = cagrOf(
    series[0]?.operatingIncome ?? null,
    oldestF?.operatingIncome ?? null,
  );

  // 가정(할인율·성장률, 연도 무관) + 연도별 금액(D&A·유지CapEx) 분리 로드 — 서로 독립이라 병렬.
  const [assumptions, magnitudes] = await Promise.all([
    assumptionsPromise,
    magnitudesPromise,
  ]);

  // 기준(basis) — 연도 선택(?fy=). 기본 = 최신 연도. 다년 평균·추세는 "최근 실적 추이"가 담당.
  const latestYear = series[0]?.year ?? Number(today.slice(0, 4)) - 1;
  const fyParam = typeof sp.fy === "string" ? sp.fy : undefined;
  const wantsTtm = fyParam == null || fyParam.toUpperCase() === "TTM";
  const selection = parseSelection(wantsTtm ? undefined : fyParam, latestYear);
  const selectionKey = wantsTtm ? "TTM" : selection.kind === "avg" ? `${selection.years}Y` : String(selection.year);
  const annualBasis = computeBasis(series, magnitudes, selection);
  const usingTtm = wantsTtm && fundamentalSet.ttm != null;
  const basis = usingTtm
    ? basisFromFundamentals(
        fundamentalSet.ttm!,
        `TTM · ${fundamentalSet.ttm!.periodEnd} 기준`,
      )
    : annualBasis;

  // 오너이익·D&A·CapEx 는 basis(정규화) 기준. 시총·안전마진은 항상 "오늘".
  const ownerEarnings = basis?.ownerEarnings ?? (usingTtm ? annualBasis?.ownerEarnings : null) ?? null;
  const ownerEarningsUsesFyFallback = usingTtm && basis?.ownerEarnings == null && ownerEarnings != null;
  const effectiveDna = basis?.oeDna ?? (ownerEarningsUsesFyFallback ? annualBasis?.oeDna : null) ?? null;
  const effectiveCapex = basis?.oeCapex ?? (ownerEarningsUsesFyFallback ? annualBasis?.oeCapex : null) ?? null;
  const usingMaintCapex = basis?.usingMaintCapex ?? false;

  // EPS(기준) = basis 순이익 / 현재 유통주식수. 시총용.
  const shares = usingTtm ? fundamentalSet.ttm!.shares : fundamentals?.shares ?? null;
  const basisEps =
    basis?.netIncome != null && shares && shares > 0 ? basis.netIncome / shares : null;
  // 최신 연도 선택 = 현재가 기준, 과거 연도 = 당시 연말종가 기준.
  const isLatestSel = selection.kind === "year" && selection.year === latestFy;
  const per = usingTtm
    ? basisEps != null && basisEps > 0 && price != null ? price / basisEps : null
    : selection.kind === "year"
      ? perByYear.get(selection.year) ?? null
      : basisEps != null && basisEps > 0 && price != null
        ? price / basisEps
        : null;
  const pbr = usingTtm
    ? price != null && shares != null && basis?.equity && basis.equity > 0
      ? (price * shares) / basis.equity : null
    : selection.kind === "year"
      ? pbrByYear.get(selection.year) ?? null
      : price != null && shares != null && basis?.equity && basis.equity > 0
        ? (price * shares) / basis.equity
        : null;
  const psr = usingTtm
    ? price != null && shares != null && basis?.revenue && basis.revenue > 0
      ? (price * shares) / basis.revenue : null
    : selection.kind === "year"
      ? psrByYear.get(selection.year) ?? null
      : price != null && shares != null && basis?.revenue && basis.revenue > 0
        ? (price * shares) / basis.revenue
        : null;
  // PEG = PER ÷ 이익성장률(%). 성장 양수일 때만(1 근처=적정, 1 미만=성장 대비 저평가).
  const peg =
    per != null && netIncomeCagr != null && netIncomeCagr > 0
      ? per / (netIncomeCagr * 100)
      : null;

  // §12 내재가치·안전마진 — 정규화 오너이익 / (할인율 − 성장률). 시총은 오늘 기준.
  const tenYear = ownerEarnings != null ? await tenYearPromise : null;
  const customRate = assumptions?.discountRate ?? null;
  const growth = assumptions?.growthRate ?? null; // 기본 0%(무성장, 보수적)
  const marketCap = price != null && shares != null ? price * shares : null;
  const intrinsic =
    ownerEarnings != null && marketCap != null && (tenYear != null || customRate != null)
      ? computeIntrinsic(ownerEarnings, marketCap, tenYear?.rate ?? 0, customRate, growth)
      : null;

  // §12 자본배분 효율 — 사용자 정의 지표. 오너이익이 나올 때 함께 노출.
  // RONTE = 오너이익 / 순유형자산(자본−무형). RNI·RMC = 유보 증가 1원당 (이익증가)/(시총증가), 다년.
  const tangibleEquity =
    basis?.equity != null ? basis.equity - (basis.intangibles ?? 0) : null;
  const ronte =
    ownerEarnings != null && tangibleEquity != null && tangibleEquity > 0
      ? ownerEarnings / tangibleEquity
      : null;
  const newestF = series[0] ?? null;
  const oldestSeriesF = series[series.length - 1] ?? null;
  const reDelta =
    newestF?.retainedEarnings != null && oldestSeriesF?.retainedEarnings != null
      ? newestF.retainedEarnings - oldestSeriesF.retainedEarnings
      : null;
  const niDelta =
    newestF?.netIncome != null && oldestSeriesF?.netIncome != null
      ? newestF.netIncome - oldestSeriesF.netIncome
      : null;
  const mcNewest = newestF ? mcapByYear.get(newestF.year) ?? null : null;
  const mcOldest = oldestSeriesF ? mcapByYear.get(oldestSeriesF.year) ?? null : null;
  // RNI(이익전환력) = Δ순이익 / Δ유보. RMC(1달러유보테스트) = Δ시총 / Δ유보(>100% 통과).
  // 최소 2년 델타(spanYears>=2) 필요 — 단년 델타는 노이즈가 너무 커서 생략.
  const reUsable = reDelta != null && reDelta > 0 && spanYears >= 2;
  const rni = reUsable && niDelta != null ? niDelta / reDelta! : null;
  const rmc =
    reUsable && mcNewest != null && mcOldest != null
      ? (mcNewest - mcOldest) / reDelta!
      : null;

  // 밸류에이션 배수 회사 맥락(모달용) — 자기 과거 평균 대비.
  const avgOf = (m: Map<number, number>): number | null => {
    const vals = [...m.values()];
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const multipleContext = (
    cur: number | null,
    avg: number | null,
    unit: string,
  ): string | undefined => {
    if (cur == null || avg == null) return undefined;
    const dir = cur > avg * 1.05 ? "높음 — 다소 비싼 구간" : cur < avg * 0.95 ? "낮음 — 다소 싼 구간" : "평균 수준";
    return `최근 ${spanYears + 1}년 평균 ${avg.toFixed(unit === "배" ? 1 : 2)}${unit} 대비 ${dir}`;
  };
  const perContext = multipleContext(per, avgOf(perByYear), "배");
  const pbrContext = multipleContext(pbr, avgOf(pbrByYear), "배");
  const psrContext = multipleContext(psr, avgOf(psrByYear), "배");

  // 재무 건강 체크(스타일 중립) — "살 종목이냐"가 아니라 "재무가 튼튼하냐". 보편 항목만.
  const interestCov =
    basis?.operatingIncome != null &&
    basis?.interestExpense != null &&
    basis.interestExpense > 0
      ? basis.operatingIncome / basis.interestExpense
      : null;
  const healthChecks: { label: string; pass: boolean | null; detail: string }[] = [
    {
      label: "흑자",
      pass: basis?.netIncome != null ? basis.netIncome > 0 : null,
      detail: "순이익 > 0",
    },
    {
      label: "이익의 질",
      pass:
        basis?.ocf != null && basis?.netIncome != null
          ? basis.ocf >= basis.netIncome
          : null,
      detail: "영업현금흐름 ≥ 순이익",
    },
    {
      label: "이자 체력",
      // 무차입(이자비용 없음)이면 영업흑자일 때 통과.
      pass:
        basis?.interestExpense == null || basis.interestExpense === 0
          ? basis?.operatingIncome != null
            ? basis.operatingIncome > 0
            : null
          : interestCov != null
            ? interestCov >= 5
            : null,
      detail: "이자보상배율 ≥ 5배",
    },
    {
      label: "성장",
      pass: revenueCagr != null ? revenueCagr > 0 : null,
      detail: "매출 성장률 > 0",
    },
    {
      label: "현금흐름",
      pass: basis?.ocf != null ? basis.ocf > 0 : null,
      detail: "영업현금흐름 > 0",
    },
  ];
  const healthPass = healthChecks.filter((h) => h.pass === true).length;
  const healthTotal = healthChecks.filter((h) => h.pass !== null).length;

  // 연도별 입력 패널 행 — 현재 기준 기간의 각 연도(미입력 표시).
  const seriesByYear = new Map(series.map((f) => [f.year, f]));
  const dnaRows = (basis?.years ?? []).map((y) => {
    const m = magnitudes.get(y);
    return {
      year: y,
      dna: m?.dna ?? null,
      maintCapex: m?.maintCapex ?? null,
      totalCapex: seriesByYear.get(y)?.capex ?? null,
      autoDna: seriesByYear.get(y)?.dna ?? null,
    };
  });
  // 출처가 D&A 를 제공(미국 EDGAR)하면 D&A 는 자동 → 패널은 '유지CapEx'만 받는다.
  // 한국(DART)은 D&A 가 주석에만 있어 수기 입력이 게이트.
  const autoDna = series.some((f) => f.dna != null);

  const history = portfolio.events
    .filter((e) => e.symbol === symbol)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  // 시세차트 — 짧은 구간은 1년 일봉, 긴 구간(5년·최대)은 상장 이후 월봉. 병렬 조회로 지연 최소화.
  // ₩ 환산(외화는 현재 환율). 미보유·해외도 가능. 실패 시 빈 배열 → 해당 칩 숨김.
  const oneYearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const dailyPromise =
    view === "overview"
      ? getDailyKrwCloses([symbol], oneYearAgo, today)
      : Promise.resolve({ series: {}, available: true });
  const monthlyPromise =
    view === "overview"
      ? getDailyKrwCloses([symbol], "1990-01-01", today, "1mo")
      : Promise.resolve({ series: {}, available: true });

  // 매수 딥링크 — 보유·미보유 공통. 체결 후 이 상세로 복귀.
  const buyHref = `/transactions?type=BUY&symbol=${symbol}&from=/stocks/${symbol}`;
  const tabHref = (tab: "overview" | "analysis" | "records") => {
    const query = new URLSearchParams();
    if (nameParam) query.set("name", nameParam);
    if (tab !== "overview") query.set("view", tab);
    if (tab === "analysis" && typeof sp.fy === "string") query.set("fy", sp.fy);
    const suffix = query.toString();
    return `/stocks/${encodeURIComponent(symbol)}${suffix ? `?${suffix}` : ""}`;
  };

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />

      <div className="flex items-center gap-3">
        <SymbolAvatar name={name} />
        <div className="min-w-0">
          <p className="truncate text-xl font-extrabold tracking-tight">{name}</p>
          <p className="text-sm text-muted-foreground">{symbol}</p>
        </div>
        <div className="ml-auto">
          <WatchToggle symbol={symbol} watched={watched} name={name} />
        </div>
      </div>

      <nav className="grid grid-cols-3 rounded-xl bg-secondary p-1">
        {(
          [
            ["overview", "개요"],
            ["analysis", "기업 분석"],
            ["records", "내 기록"],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={tabHref(key)}
            scroll={false}
            className={`rounded-lg px-2 py-2 text-center text-sm font-semibold transition ${
              view === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {view !== "analysis" && (
      <section className="rounded-2xl bg-card p-6 shadow-card">
        {held ? (
          <>
            <p className="text-sm text-muted-foreground">평가액</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight">
              {value != null ? (
                <CountUp value={value} format="money" currency="KRW" />
              ) : (
                "시세 갱신 필요"
              )}
            </p>
            {ret != null && (
              <p
                className="mt-1 text-base font-semibold tabular-nums"
                style={{ color: changeColor(ret) }}
              >
                {signedPct(ret)} (평단 대비)
              </p>
            )}
            <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
              <Row k="보유 수량" v={`${qty.toLocaleString()}${qtyUnit(symbol)}`} />
              <Row k="평균단가" v={won(avgCost)} />
              <Row k="현재가" v={price != null ? won(price) : "—"} />
              {findCatalogItem(symbol)?.ter != null && (
                <Row
                  k="총보수 (연, 참고)"
                  v={`${(findCatalogItem(symbol)!.ter! * 100).toFixed(2)}%`}
                />
              )}
            </dl>
            {/* 보유 종목도 상세에서 바로 추가 매수 */}
            <Link
              href={buyHref}
              className="mt-5 flex items-center justify-center rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition active:scale-[0.99]"
            >
              매수하기
            </Link>
          </>
        ) : (
          /* 미보유(연구·관심종목) — 현재가를 헤드라인으로, 매수 CTA. */
          <>
            <p className="text-sm text-muted-foreground">현재가 · 미보유</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight">
              {price != null ? (
                <CountUp value={price} format="money" currency="KRW" />
              ) : (
                "시세 없음"
              )}
            </p>
            <Link
              href={buyHref}
              className="mt-4 flex items-center justify-center rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition active:scale-[0.99]"
            >
              매수하기
            </Link>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              아래 지표·밸류에이션은 매수 전에도 볼 수 있어요.
            </p>
          </>
        )}
      </section>
      )}

      {view === "overview" && (
        <Suspense fallback={<BusinessSummarySkeleton />}>
          <BusinessSummary
            symbol={symbol}
            name={name}
            supabase={supabase}
          />
        </Suspense>
      )}

      {/* 시세차트 — 짧은 구간=일봉, 긴 구간(5년·최대)=월봉 자동. 데이터 없으면 숨김.
          보유 시 평단선 오버레이(₩). */}
      {view === "overview" && (
      <Suspense fallback={<PriceChartSkeleton />}>
        <PriceChartStreamed
          symbol={symbol}
          dailyPromise={dailyPromise}
          monthlyPromise={monthlyPromise}
          avgCost={held && avgCost > 0 ? avgCost : null}
        />
      </Suspense>
      )}

      {view === "overview" && fundamentals && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">핵심 기업 지표</p>
            <Link
              href={tabHref("analysis")}
              className="text-xs font-semibold text-muted-foreground"
            >
              기업 분석 ›
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-y-4">
            <Metric k="PER" v={per != null ? `${per.toFixed(1)}배` : "—"} hint="주가 ÷ 주당순이익" />
            <Metric k="PBR" v={pbr != null ? `${pbr.toFixed(2)}배` : "—"} hint="주가 ÷ 주당순자산" />
            <Metric k="ROE" v={basis?.roe != null ? pct(basis.roe) : "—"} hint="순이익 ÷ 자본" />
            <Metric
              k="이익성장률"
              v={netIncomeCagr != null ? pct(netIncomeCagr) : "—"}
              hint={`${spanYears || 0}년 연평균 순이익 성장률`}
            />
          </div>
        </section>
      )}

      {view === "analysis" && (fundamentals ? (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-sm font-semibold">기본지표 · 펀더멘털</p>
            <p className="text-xs text-muted-foreground">
              {basis?.label} ({fundamentals.fsDiv}) · {/^[0-9]{6}$/.test(symbol) ? "DART" : "SEC"}
            </p>
          </div>
          {/* TTM/FY 셀렉터 — 카드 전체가 이 기준으로 계산됨 */}
          <PeriodSelector
            availableYears={series.map((f) => f.year)}
            current={selectionKey}
          />
          {wantsTtm && !usingTtm && (
            <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              <b className="text-foreground">직전 FY로 대체</b> · {fundamentalSet.fallbackReason}
            </p>
          )}
          {usingTtm && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              손익·현금흐름은 최근 12개월, 자산·부채·자본은 {fundamentalSet.ttm!.periodEnd} 분기말 기준입니다.
            </p>
          )}

          {basis && (
            <div className="mt-4 rounded-xl bg-secondary p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold">재무제표 간략히</p>
                <p className="text-[11px] text-muted-foreground">{basis.label}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
                <SnapshotMetric label="매출" value={basis.revenue} />
                <SnapshotMetric label="영업이익" value={basis.operatingIncome} />
                <SnapshotMetric label="순이익" value={basis.netIncome} />
                <SnapshotMetric label="자산" value={basis.assets} />
                <SnapshotMetric label="부채" value={basis.liabilities} />
                <SnapshotMetric label="잉여현금흐름" value={basis.fcf} />
              </div>
            </div>
          )}

          {/* 핵심 비율(기준 반영) — 분석 카테고리로 묶음. 성장률(CAGR)은 다년이라 '최근 실적 추이'에. */}
          <div className="mt-3 space-y-4">
            <div>
              <Group label="밸류에이션" />
              <div className="mt-1.5 grid grid-cols-2 gap-y-3">
                <Metric
                  k="PER"
                  v={per != null ? `${per.toFixed(1)}배` : "—"}
                  context={perContext}
                  hint={
                    isLatestSel || selection.kind === "avg"
                      ? "현재가 ÷ 주당순이익"
                      : "당시 연말종가 ÷ 그해 주당순이익"
                  }
                />
                <Metric
                  k="PBR"
                  v={pbr != null ? `${pbr.toFixed(2)}배` : "—"}
                  context={pbrContext}
                  hint={
                    isLatestSel || selection.kind === "avg"
                      ? "현재가 ÷ 주당순자산"
                      : "당시 연말종가 ÷ 그해 주당순자산"
                  }
                />
                <Metric
                  k="PSR"
                  v={psr != null ? `${psr.toFixed(2)}배` : "—"}
                  context={psrContext}
                  hint="시총 ÷ 매출 (이익 얇은 성장주용)"
                />
                <Metric
                  k="PEG"
                  v={peg != null ? peg.toFixed(2) : "—"}
                  hint={
                    peg == null && netIncomeCagr != null && netIncomeCagr <= 0
                      ? "이익 역성장 — 해당없음"
                      : "PER ÷ 이익성장률 (1↓ 성장대비 저평가)"
                  }
                />
                <Metric
                  k="배당수익률"
                  v={divYield != null ? pct(divYield, 2) : "—"}
                  hint={
                    annualDpsKrw != null
                      ? `1주당 연 ${won(annualDpsKrw)} (현재가 기준)`
                      : "현재가 기준"
                  }
                />
              </div>
            </div>
            <div>
              <Group label="수익성" />
              <div className="mt-1.5 grid grid-cols-2 gap-y-3">
                <Metric
                  k="ROE"
                  v={basis?.roe != null ? pct(basis.roe) : "—"}
                  hint="순이익 ÷ 자본 (= 순이익률×회전율×레버리지)"
                />
                <Metric
                  k="순이익률"
                  v={
                    basis?.netIncome != null && basis?.revenue
                      ? pct(basis.netIncome / basis.revenue)
                      : "—"
                  }
                  hint="순이익 ÷ 매출"
                />
                <Metric
                  k="영업이익률"
                  v={basis?.operatingMargin != null ? pct(basis.operatingMargin) : "—"}
                  hint="영업이익 ÷ 매출"
                />
              </div>
            </div>
            <div>
              <Group label="효율 · 안정성" />
              <div className="mt-1.5 grid grid-cols-2 gap-y-3">
                <Metric
                  k="총자산회전율"
                  v={
                    basis?.revenue != null && basis?.assets
                      ? `${(basis.revenue / basis.assets).toFixed(2)}회`
                      : "—"
                  }
                  hint="매출 ÷ 자산 (듀폰)"
                />
                <Metric
                  k="재무레버리지"
                  v={
                    basis?.assets != null && basis?.equity
                      ? `${(basis.assets / basis.equity).toFixed(2)}배`
                      : "—"
                  }
                  hint="자산 ÷ 자본 (듀폰)"
                />
                <Metric
                  k="이자보상배율"
                  v={
                    basis?.operatingIncome != null &&
                    basis?.interestExpense != null &&
                    basis.interestExpense > 0
                      ? `${(basis.operatingIncome / basis.interestExpense).toFixed(1)}배`
                      : "—"
                  }
                  hint="영업이익 ÷ 이자비용 (빚 갚을 체력)"
                />
              </div>
            </div>
          </div>
          {/* 오너이익(§12-1) — 정규화(다년 평균) 또는 단년. 가정·반영연도 투명 표기. */}
          {ownerEarnings != null ? (
            <div className="mt-4 rounded-xl bg-secondary p-3">
              <p className="text-xs text-muted-foreground">
                오너이익 {basis?.isAverage ? `· ${basis.label} 정규화` : ""}
              </p>
              <p className="text-xl font-extrabold tabular-nums">
                {wonCompact(ownerEarnings)}
              </p>
              {/* 어떤 가정으로 계산됐는지 정직하게 — 숨기지 않음 */}
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                순이익 {wonCompact(basis!.netIncome!)} + 감가상각{" "}
                {wonCompact(effectiveDna!)} − {usingMaintCapex ? "유지" : "총"}CapEx{" "}
                {wonCompact(effectiveCapex!)}
                {basis?.isAverage && ` · ${basis.oeYearsUsed}/${basis.oeYearsTotal}년 D&A 반영`}
                {!usingMaintCapex && (
                  <>
                    {" "}
                    · 총CapEx(보수적) 차감 — 실제 오너이익은 이보다 클 수 있어요(유지CapEx 입력 시 보정).
                  </>
                )}
              </p>
              {basis?.isAverage && basis.oeYearsUsed < basis.oeYearsTotal && (
                <p className="mt-1 flex items-start gap-1 text-[11px] text-warn">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  <span>{basis.oeYearsTotal - basis.oeYearsUsed}개 연도는 {autoDna ? "유지CapEx" : "D&A"} 미입력 → 평균에서 빠졌어요. 아래에서 채우면 정확해져요.</span>
                </p>
              )}
              <DnaYearPanel symbol={symbol} rows={dnaRows} autoDna={autoDna} />
            </div>
          ) : (
            basis?.fcf != null && (
              <div className="mt-4 rounded-xl bg-secondary p-3">
                <p className="text-xs text-muted-foreground">
                  잉여현금흐름 FCF (영업현금 − 총CapEx) · {basis.label}
                </p>
                <p className="text-xl font-extrabold tabular-nums">
                  {wonCompact(basis.fcf)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {autoDna
                    ? "감가상각은 자동이지만, 유지CapEx 는 회사마다 달라 자동으로 못 정해요. 아래에 연도별 유지CapEx 를 넣으면 오너이익(순이익+감가상각−유지CapEx)이 나와요."
                    : "한국 공시는 감가상각을 주석에만 둬 자동 계산이 안 돼요. 연도별 D&A 를 넣으면 오너이익(순이익+감가상각−CapEx)이 나와요."}
                </p>
                <DnaYearPanel symbol={symbol} rows={dnaRows} autoDna={autoDna} />
              </div>
            )
          )}

          {/* §12 내재가치·안전마진 — 사실 아니라 "규칙 렌즈". 가정을 전부 노출. */}
          {intrinsic && (
            <div className="mt-4 rounded-xl bg-secondary p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-semibold text-primary">
                  내 규칙 기준 내재가치 · 안전마진
                </p>
                <p className="text-[11px] text-muted-foreground">렌즈 · 사실 아님</p>
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">내재가치</p>
                  <p className="text-2xl font-extrabold tabular-nums">
                    {wonCompact(intrinsic.intrinsicValue)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">시가총액</p>
                  <p className="text-base font-semibold tabular-nums text-muted-foreground">
                    {wonCompact(intrinsic.marketCap)}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-card p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">
                    안전마진 (내재가치 − 시총)
                  </span>
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: changeColor(intrinsic.marginOfSafety) }}
                  >
                    {intrinsic.marginOfSafety >= 0 ? "+" : ""}
                    {wonCompact(intrinsic.marginOfSafety)} ({signedPct(intrinsic.marginPct)})
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {intrinsic.marginOfSafety >= 0
                    ? "규칙상 할인 영역 — 가정이 맞다면 내재가치보다 싸게 거래 중."
                    : "규칙상 프리미엄 영역 — 이 규칙으론 비싸 보임. 성장이 가정보다 빨라야 정당화돼요."}
                </p>
              </div>

              {/* 가정 노출 — 무엇을 전제로 한 숫자인지 숨기지 않음 */}
              <dl className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                <div className="flex justify-between gap-2">
                  <dt>할인율</dt>
                  <dd className="tabular-nums">
                    {pct(intrinsic.discountRate)}{" "}
                    {intrinsic.customRate
                      ? "(직접 설정)"
                      : `(미국채10년물 ${tenYear ? pct(tenYear.rate, 2) : "?"}×2${
                          intrinsic.rateFloored ? ", 바닥 8% 적용" : ""
                        })`}
                  </dd>
                </div>
                <div className="flex justify-end">
                  <DiscountRateInput
                    symbol={symbol}
                    currentRate={customRate}
                    autoRate={
                      tenYear ? discountRate(tenYear.rate).rate : intrinsic.discountRate
                    }
                  />
                </div>
                <div className="flex justify-between gap-2">
                  <dt>성장률 (내 가정)</dt>
                  <dd className="tabular-nums">
                    {pct(intrinsic.growth)}
                    {intrinsic.growth === 0 ? " · 무성장" : ""}
                  </dd>
                </div>
                <div className="flex justify-end">
                  <GrowthRateInput
                    symbol={symbol}
                    currentGrowth={growth}
                    discountRate={intrinsic.discountRate}
                  />
                </div>
                <div className="flex justify-between gap-2">
                  <dt>오너이익 (기준)</dt>
                  <dd className="tabular-nums">
                    {wonCompact(ownerEarnings!)} · {ownerEarningsUsesFyFallback ? `${annualBasis?.label} 대체` : basis?.label}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>시장이 가정한 성장률</dt>
                  <dd className="tabular-nums">{signedPct(intrinsic.impliedGrowth)}/년</dd>
                </div>
                {!intrinsic.customRate && tenYear && (
                  <div className="flex justify-between gap-2">
                    <dt>금리 기준일</dt>
                    <dd>{tenYear.asOf} · 미 재무부</dd>
                  </div>
                )}
              </dl>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {intrinsic.growth === 0
                  ? "성장 0%(무성장) 가정의 보수적 추정이에요. "
                  : `성장 ${pct(intrinsic.growth)} 가정(고든 모형)이에요. `}
                &quot;시장이 가정한 성장률&quot;이 본인 전망보다 낮으면 매력적, 높으면 시장이 더
                낙관적이란 뜻 — <b>판결이 아니라 참고 렌즈</b>예요.
              </p>
            </div>
          )}

          {/* §12 자본배분 효율 — 오너이익이 나올 때 함께(사용자 정의 지표). RNI·RMC는 다년. */}
          {ownerEarnings != null && (
            <div className="mt-4 rounded-xl border border-border p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-sm font-semibold">자본배분 효율 · §12</p>
                <p className="text-[11px] text-muted-foreground">내 지표 · 참고</p>
              </div>
              <div className="grid grid-cols-3 gap-x-2 gap-y-3">
                <Metric
                  k="RONTE"
                  v={ronte != null ? pct(ronte) : "—"}
                  hint="오너이익 ÷ 순유형자산"
                />
                <Metric
                  k="RNI"
                  v={rni != null ? pct(rni) : "—"}
                  hint={spanYears > 0 ? `Δ순이익÷Δ유보 (${spanYears}년)` : "Δ순이익÷Δ유보"}
                />
                <Metric
                  k="RMC"
                  v={rmc != null ? pct(rmc) : "—"}
                  hint={spanYears > 0 ? `Δ시총÷Δ유보 (${spanYears}년)` : "Δ시총÷Δ유보"}
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                RONTE=유형자본이 오너이익을 얼마나 내나. RNI=유보 1원당 이익 증가(내부 재투자력).
                RMC=유보 1원당 시장가치 증가 — <b>100%↑면 1달러 유보 테스트 통과</b>(버핏). 단년 노이즈 커서 다년 기준.
              </p>
            </div>
          )}

          {/* 재무제표 3종(기준 반영) — 접기. 정직한 재료 그대로(§4·§8).
              최상단=재무 건강 체크+플래그, 이어 재무상태 → 손익 → 현금흐름 */}
          {basis && (
            <details
              id="financials"
              open={openFinancials}
              className="mt-4 scroll-mt-4 border-t border-border pt-3"
            >
              <summary className="cursor-pointer text-sm font-semibold">
                재무제표 자세히 · {basis.label}
              </summary>
              {healthTotal > 0 && (
                <div className="mt-3">
                  <FinancialHealth
                    checks={healthChecks}
                    pass={healthPass}
                    total={healthTotal}
                    flags={fundamentals?.isFinancial ? [] : fundamentalFlags}
                  />
                </div>
              )}
              <dl className="mt-3 space-y-2 border-t border-border pt-4 text-sm">
                <Group label="재무상태표" />
                {basis.assets != null && (
                  <Row k="자산총계" v={wonCompact(basis.assets)} />
                )}
                {basis.liabilities != null && (
                  <Row k="부채총계" v={wonCompact(basis.liabilities)} />
                )}
                {basis.equity != null && (
                  <Row k="자본총계" v={wonCompact(basis.equity)} />
                )}
              </dl>
              <dl className="mt-3 space-y-2 border-t border-border pt-4 text-sm">
                <Group label="손익계산서" />
                {basis.revenue != null && (
                  <Row k="매출액" v={wonCompact(basis.revenue)} />
                )}
                {basis.operatingIncome != null && (
                  <Row k="영업이익" v={wonCompact(basis.operatingIncome)} />
                )}
                {basis.netIncome != null && (
                  <Row k="당기순이익" v={wonCompact(basis.netIncome)} />
                )}
                {basisEps != null && (
                  <Row k="EPS(주당순이익)" v={won(basisEps)} />
                )}
              </dl>
              <dl className="mt-3 space-y-2 border-t border-border pt-4 text-sm">
                <Group label="현금흐름표" />
                {basis.ocf != null && (
                  <Row k="영업활동현금흐름" v={wonCompact(basis.ocf)} />
                )}
                {basis.icf != null && (
                  <Row k="투자활동현금흐름" v={wonCompact(basis.icf)} />
                )}
                {basis.ffcf != null && (
                  <Row k="재무활동현금흐름" v={wonCompact(basis.ffcf)} />
                )}
                {basis.capex != null && (
                  <Row k="총CapEx(유형+무형 취득)" v={wonCompact(basis.capex)} />
                )}
                <Row
                  k="감가상각비(D&A)"
                  v={effectiveDna != null ? wonCompact(effectiveDna) : "공시 미제공·수기"}
                />
              </dl>
            </details>
          )}
          {series.length > 1 && (
            <FundamentalsTrend
              growth={{
                revenue: revenueCagr,
                netIncome: netIncomeCagr,
                operatingIncome: operatingIncomeCagr,
                years: spanYears,
              }}
              series={series.map((f) => ({
                year: f.year,
                revenue: f.revenue,
                operatingIncome: f.operatingIncome,
                netIncome: f.netIncome,
                assets: f.assets,
                liabilities: f.liabilities,
                equity: f.equity,
                ocf: f.ocf,
                icf: f.icf,
                ffcf: f.ffcf,
                capex: f.capex,
                interestExpense: f.interestExpense,
                per: perByYear.get(f.year) ?? null,
                pbr: pbrByYear.get(f.year) ?? null,
                psr: psrByYear.get(f.year) ?? null,
              }))}
            />
          )}
          {fundamentals.isFinancial && (
            <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs text-accent-foreground">
              <Building2 size={14} className="mt-0.5 shrink-0" />
              <span>금융업 — 매출·부채비율 등은 일반 기업과 해석이 달라요(부채에 예금·보험부채 포함). ROE·순이익 위주로 보세요.</span>
            </p>
          )}
          {fundamentals.confidence === "low" && (
            <p className="mt-2 flex items-center gap-1 text-xs text-warn">
              <AlertTriangle size={13} className="shrink-0" /> 표준계정과 일부 불일치 — 원문(DART)으로 확인하세요.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            출처: {/^[0-9]{6}$/.test(symbol) ? "DART 정기보고서" : "SEC 정기보고서"} · 참고용(매수 추천 아님). {fundamentals.fsDiv} · {basis?.label} 기준.
            시총·안전마진은 항상 오늘 시세.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            공시 형식 차이로 일부 수치가 비거나 어긋날 수 있어요.{" "}
            <a
              href={`mailto:grapplay.com@gmail.com?subject=${encodeURIComponent(
                `[데이터 제보] ${name}(${symbol})`,
              )}&body=${encodeURIComponent(
                `종목: ${name}(${symbol})\n연도/항목:\n이상한 점:\n`,
              )}`}
              className="text-primary underline"
            >
              데이터 제보
            </a>
          </p>
        </section>
      ) : (
        <Link
          href="/soon?t=기본지표(PER·ROE)·펀더멘털"
          className="block rounded-2xl bg-card p-5 shadow-card transition active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">기본지표 · 펀더멘털</p>
            <span className="text-muted-foreground">›</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            해외 종목 펀더멘털은 곧 공개됩니다.
          </p>
        </Link>
      ))}

      {view === "overview" && disclosures.length > 0 && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">최근 공시</p>
            <Link
              href={`/stocks/${symbol}/disclosures`}
              className="text-xs text-muted-foreground"
            >
              전체 보기 ›
            </Link>
          </div>
          <DisclosureList items={disclosures.slice(0, 2)} />
          <p className="mt-3 text-xs text-muted-foreground">
            출처: DART · 힌트는 규칙 기반 해석(단정 아님)
          </p>
        </section>
      )}

      {view === "records" && (
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <p className="mb-3 text-sm font-semibold">거래 내역</p>
        {history.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">거래 내역이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {history.map((e, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="font-medium tabular-nums">
                  {EVENT_LABEL[e.type]}
                  {e.quantity ? ` ${e.quantity}${qtyUnit(symbol)}` : ""} @{e.priceOrAmount.toLocaleString()}
                </span>
                <span className="text-muted-foreground tabular-nums">{e.date}</span>
              </li>
            ))}
          </ul>
        )}
        {/* 배당은 자동 기록(배당락일·보유수량으로 생성). 자동 피드에 없는 종목만 폴백으로 직접 추가. */}
        {qty > 0 && (
          <Link
            href={`/transactions?type=DIVIDEND&symbol=${symbol}&from=/stocks/${symbol}`}
            className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground"
          >
            <span>+ 배당 직접 추가</span>
            <span className="text-xs">자동 기록이 안 된 배당만 ›</span>
          </Link>
        )}
      </section>
      )}
    </main>
  );
}

function Group({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground">{label}</p>
  );
}

function SnapshotMetric({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">
        {value != null ? wonCompact(value) : "—"}
      </p>
    </div>
  );
}

async function BusinessSummary({
  symbol,
  name,
  supabase,
}: {
  symbol: string;
  name: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const [profile, metaMap] = await Promise.all([
    getCompanyProfile(symbol),
    loadSecurityMeta(supabase, [symbol]),
  ]);
  const meta = metaMap[symbol];
  const tags = [...new Set([profile?.sector, profile?.industry, meta?.sector])].filter(
    (tag): tag is string => Boolean(tag),
  );
  const businessArea = profile?.industry ?? profile?.sector ?? meta?.sector;
  const fallback = businessArea
    ? meta?.assetType === "ETF"
      ? `${name}은 ${businessArea} 분야에 투자하는 ETF입니다. 상세 운용 정보는 데이터 제공처에서 확인 중입니다.`
      : `${name}은 ${businessArea} 분야에서 사업하는 기업입니다. 상세 사업 설명은 데이터 제공처에서 확인 중입니다.`
    : `${name}의 상세 사업 설명을 불러오지 못했습니다. 공시와 기업분석에서 사업 내용을 확인할 수 있습니다.`;

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">무슨 사업을 하나요?</p>
        {profile?.website && (
          <a
            href={profile.website}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-xs font-semibold text-muted-foreground"
          >
            홈페이지 ↗
          </a>
        )}
      </div>
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {profile?.summary ?? fallback}
      </p>
      {profile?.summary && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          출처: {profile.source ?? "회사 프로필"} · 사업 내용 자동 요약
        </p>
      )}
    </section>
  );
}

function BusinessSummarySkeleton() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card" aria-busy="true">
      <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
      <div className="mt-4 h-16 w-full animate-pulse rounded bg-secondary" />
    </div>
  );
}

type PriceClosesResult = Awaited<ReturnType<typeof getDailyKrwCloses>>;

async function PriceChartStreamed({
  symbol,
  dailyPromise,
  monthlyPromise,
  avgCost,
}: {
  symbol: string;
  dailyPromise: Promise<PriceClosesResult>;
  monthlyPromise: Promise<PriceClosesResult>;
  avgCost: number | null;
}) {
  const [dailyRes, monthlyRes] = await Promise.all([
    dailyPromise,
    monthlyPromise,
  ]);

  return (
    <PriceChart
      daily={dailyRes.series[symbol] ?? []}
      monthly={monthlyRes.series[symbol] ?? []}
      avgCost={avgCost}
    />
  );
}

function PriceChartSkeleton() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card" aria-busy="true">
      <div className="h-4 w-24 animate-pulse rounded bg-secondary" />
      <div className="mt-4 h-48 w-full animate-pulse rounded bg-secondary" />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium tabular-nums">{v}</dd>
    </div>
  );
}
