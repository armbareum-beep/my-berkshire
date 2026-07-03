import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadPortfolioValueSeries } from "@/lib/portfolioValueSeries";
import { annualReportEligibility, computeAnnualReport } from "@/lib/finance/annualReport";
import { computeLookThrough } from "@/lib/finance/lookThrough";
import { getOrComputeSnapshot } from "@/lib/calculationSnapshots";
import { todayKST } from "@/lib/date";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { AnnualReportView } from "@/components/report/AnnualReportView";

export default async function AnnualReportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [portfolio, cookieStore] = await Promise.all([getPortfolio(supabase), cookies()]);
  if (!portfolio) redirect("/onboarding");

  const today = todayKST();
  const eligibility = annualReportEligibility(portfolio.holding.founded_at, today);
  const displayCcy = cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const useUsd = displayCcy === "USD" && !!portfolio.usdKrw;
  const factor = useUsd ? 1 / (portfolio.usdKrw as number) : 1;

  if (!eligibility.eligible) {
    return (
      <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
        <BottomTabBar /><BackButton />
        <section className="mx-auto mt-12 w-full max-w-lg rounded-3xl bg-card p-8 text-center shadow-card">
          <p className="text-4xl">🔒</p>
          <h1 className="mt-4 text-2xl font-extrabold">회장님의 첫 연차보고서를 준비 중입니다</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">1년의 기록을 채운 회사에만 발행됩니다. {eligibility.unlockDate}에 열려요.</p>
          <p className="mt-5 text-sm font-bold">발행까지 {eligibility.remainingDays}일</p>
        </section>
      </main>
    );
  }

  const data = computeDashboard(portfolio, "KRW");
  if (portfolio.result.currentValuation == null) redirect("/dashboard");
  const valueSeriesPromise = loadPortfolioValueSeries({
    supabase,
    holdingId: portfolio.holding.id,
    portfolioRevision: portfolio.holding.portfolio_revision,
    foundedAt: portfolio.holding.founded_at,
    initialValuation: Number(portfolio.holding.initial_valuation),
    events: portfolio.events,
    today,
  });
  const lookThroughPromise = data.allocation.length > 0
    ? getOrComputeSnapshot({
        supabase,
        holdingId: portfolio.holding.id,
        kind: "lookthrough-current",
        portfolioRevision: portfolio.holding.portfolio_revision,
        asOfDate: today,
        ttlMs: 5 * 60 * 1000,
        compute: () => computeLookThrough(supabase, { allocation: data.allocation, year: Number(today.slice(0, 4)), invested: data.invested }),
      }).then((result) => result.data)
    : Promise.resolve(null);
  const [valueSeries, lookThrough] = await Promise.all([valueSeriesPromise, lookThroughPromise]);
  const report = computeAnnualReport(
    { foundedAt: portfolio.holding.founded_at, initialValuation: Number(portfolio.holding.initial_valuation) },
    portfolio.events,
    valueSeries.data.closes,
    portfolio.prices,
    portfolio.names,
    portfolio.result.currentValuation,
    today,
  );

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28 print:p-0">
      <div className="print:hidden"><BottomTabBar /><BackButton /></div>
      <AnnualReportView companyName={portfolio.holding.name} foundedAt={portfolio.holding.founded_at} report={report} lookThrough={lookThrough} factor={factor} currency={useUsd ? "USD" : "KRW"} />
    </main>
  );
}
