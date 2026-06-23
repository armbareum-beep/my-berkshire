import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import {
  totalDeposits,
  totalWithdrawals,
  type InvestmentEvent,
} from "@/lib/finance/valuation";
import {
  getDividends,
  projectDividends,
  annualDpsNative,
} from "@/lib/finance/dividends";
import { findCatalogItem } from "@/lib/finance/catalog";
import { getTaxConfig } from "@/lib/config/tax";
import { todayKST } from "@/lib/date";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { DividendView, type DivLine } from "@/components/dividends/DividendView";
import {
  DividendYields,
  type HoldingYield,
} from "@/components/dividends/DividendYields";

type PortfolioSnapshot = NonNullable<Awaited<ReturnType<typeof getPortfolio>>>;

/**
 * 배당 탭 — "언제 얼마 받(았/을)나".
 *  · 확정: 자동 생성된 DIVIDEND 이벤트(정확, 계좌세금 반영).
 *  · 예상: 과거 배당락 주기 추정(인터페이스 seam — 토스 API 승인 시 실제 예정 배당으로 교체).
 * 모든 금액은 ₩로 계산, 표시 통화(₩/$)는 클라이언트에서 환산.
 */
export default async function DividendsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <DividendsContent yearParam={yearParam} />
    </main>
  );
}

/**
 * 배당 본문 — 페이지 크롬 없이 내용만.
 * 전체 페이지(`/dividends`)와 바텀시트(`@sheet/(.)dividends`)가 공유.
 */
export async function DividendsContent({ yearParam }: { yearParam?: string }) {
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

  const today = todayKST();
  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">배당</h1>
      {/* 배당 피드(야후, 보유 종목별)가 무거워 본문은 스트리밍 — 제목은 즉시 보인다. */}
      <Suspense fallback={<DividendsSkeleton />}>
        <DividendsBody
          portfolio={portfolio}
          today={today}
          yearParam={yearParam}
          displayCcy={displayCcy}
        />
      </Suspense>
    </>
  );
}

async function DividendsBody({
  portfolio,
  today,
  yearParam,
  displayCcy,
}: {
  portfolio: PortfolioSnapshot;
  today: string;
  yearParam?: string;
  displayCcy: "KRW" | "USD";
}) {
  const { events, positions, names, usdKrw, holding, prices } = portfolio;
  const currentYear = Number(today.slice(0, 4));

  // 투입원금(₩) = 설립자본 + 증자 − 인출
  const investedKrw =
    Number(holding.initial_valuation) +
    totalDeposits(events) -
    totalWithdrawals(events);

  const nameOf = (s: string) => names[s] ?? findCatalogItem(s)?.name ?? s;

  // 배당락일 시점 보유수량(date ≤ exDate)
  const sharesAt = (symbol: string, exDate: string) => {
    let q = 0;
    for (const e of events) {
      if (e.symbol !== symbol || e.date > exDate) continue;
      if (e.type === "BUY") q += e.quantity ?? 0;
      else if (e.type === "SELL") q -= e.quantity ?? 0;
    }
    return q;
  };

  // ── 확정 배당(이벤트) ──
  const confirmed: DivLine[] = events
    .filter((e: InvestmentEvent) => e.type === "DIVIDEND" && e.symbol)
    .map((e) => {
      const symbol = e.symbol as string;
      const fx = e.fxRate && e.fxRate > 0 ? e.fxRate : 1;
      const shares = sharesAt(symbol, e.date);
      const grossNative = e.priceOrAmount / fx;
      return {
        symbol,
        name: nameOf(symbol),
        exDate: e.date,
        month: Number(e.date.slice(5, 7)),
        shares,
        dpsNative: shares > 0 ? grossNative / shares : 0,
        currency: e.currency ?? "KRW",
        grossKrw: e.priceOrAmount,
        taxKrw: e.feeAndTax,
        estimated: false,
      } satisfies DivLine;
    });

  // ── 예상 배당(추정) — 현재 보유 종목, 과거 주기 기반 ──
  const generalTax = getTaxConfig("GENERAL").dividendTaxRate; // 예상치는 일반 세율로 근사
  const heldSymbols = Object.keys(positions).filter((s) => positions[s] > 0);
  const earliest = events.reduce<string>(
    (min, e) => (e.date < min ? e.date : min),
    today,
  );
  const feed = heldSymbols.length
    ? await getDividends(heldSymbols, earliest, today)
    : {};

  const projected: DivLine[] = [];
  for (const symbol of heldSymbols) {
    const sd = feed[symbol];
    if (!sd) continue;
    const rate = sd.currency === "KRW" ? 1 : sd.currency === "USD" ? usdKrw : null;
    if (!rate) continue; // 환율 모르는 통화는 예상 생략
    const shares = positions[symbol];
    for (const p of projectDividends(sd.payments, today)) {
      const grossKrw = p.amountNative * shares * rate;
      projected.push({
        symbol,
        name: nameOf(symbol),
        exDate: p.exDate,
        month: Number(p.exDate.slice(5, 7)),
        shares,
        dpsNative: p.amountNative,
        currency: sd.currency,
        grossKrw,
        taxKrw: grossKrw * generalTax,
        estimated: true,
      });
    }
  }

  // ── 종목별 배당수익률(현재가 기준) — 연배당 ÷ 평가액 ──
  const holdingYields: HoldingYield[] = [];
  let totalAnnualDivKrw = 0;
  let totalHeldValueKrw = 0;
  for (const symbol of heldSymbols) {
    const priceKrw = prices[symbol]; // ₩ 현재가
    const shares = positions[symbol];
    if (priceKrw != null) totalHeldValueKrw += shares * priceKrw;
    const sd = feed[symbol];
    if (!sd) continue;
    const rate = sd.currency === "KRW" ? 1 : sd.currency === "USD" ? usdKrw : null;
    if (!rate) continue;
    const dps = annualDpsNative(sd.payments, today);
    if (!(dps > 0)) continue;
    const annualDivKrw = dps * shares * rate;
    totalAnnualDivKrw += annualDivKrw;
    const heldValueKrw = priceKrw != null ? shares * priceKrw : 0;
    holdingYields.push({
      symbol,
      name: nameOf(symbol),
      annualDivKrw,
      yieldOnPrice: heldValueKrw > 0 ? annualDivKrw / heldValueKrw : null,
      annualDpsNative: dps,
      currency: sd.currency,
    });
  }
  const portfolioYield =
    totalHeldValueKrw > 0 ? totalAnnualDivKrw / totalHeldValueKrw : null;

  // ── 연도 선택(?year=) ── 네비게이터 범위 = 배당 기록(받은+예상)이 있는
  // 연도 전체. 올해는 항상 포함. 예상이 다음 해까지 뻗으면 앞으로도 이동 가능.
  // 범위 밖 요청은 안전하게 클램프.
  const all = [...confirmed, ...projected];
  const divYears = all.map((l) => Number(l.exDate.slice(0, 4)));
  const minYear = divYears.length ? Math.min(currentYear, ...divYears) : currentYear;
  const maxYear = divYears.length ? Math.max(currentYear, ...divYears) : currentYear;
  const reqYear = Number(yearParam) || currentYear;
  const year = Math.min(maxYear, Math.max(minYear, reqYear));

  // 선택 연도분(차트·합계·받은 배당의 기준).
  const lines = all.filter((l) => l.exDate.startsWith(String(year)));

  // 하이브리드: 올해를 볼 때만, 연 경계를 넘는 임박(90일 내) 예정 배당을 추가로
  // '받을 예정'에 노출 → 연말에도 다음 배당 D-day가 비지 않게.
  const cutoffDate = new Date(`${today}T12:00:00`);
  cutoffDate.setDate(cutoffDate.getDate() + 90);
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  const yearEnd = `${year}-12-31`;
  const extraUpcoming: DivLine[] =
    year === currentYear
      ? projected.filter((l) => l.exDate > yearEnd && l.exDate <= cutoff)
      : [];

  const useUsd = displayCcy === "USD" && !!usdKrw;
  const factor = useUsd ? 1 / (usdKrw as number) : 1;

  return (
    <>
      <DividendYields
        items={holdingYields}
        totalAnnualDivKrw={totalAnnualDivKrw}
        portfolioYield={portfolioYield}
        factor={factor}
        currency={useUsd ? "USD" : "KRW"}
      />
      <DividendView
        year={year}
        minYear={minYear}
        maxYear={maxYear}
        today={today}
        lines={lines}
        extraUpcoming={extraUpcoming}
        investedKrw={investedKrw}
        factor={factor}
        currency={useUsd ? "USD" : "KRW"}
      />
    </>
  );
}

/** 배당 본문 로딩 스켈레톤. */
function DividendsSkeleton() {
  return (
    <>
      <div className="rounded-2xl bg-card p-5 shadow-card" aria-busy="true">
        <div className="h-4 w-28 animate-pulse rounded bg-secondary" />
        <div className="mt-3 h-7 w-40 animate-pulse rounded bg-secondary" />
      </div>
      <div className="rounded-2xl bg-card p-5 shadow-card" aria-busy="true">
        <div className="h-4 w-24 animate-pulse rounded bg-secondary" />
        <div className="mt-3 h-32 w-full animate-pulse rounded bg-secondary" />
      </div>
    </>
  );
}
