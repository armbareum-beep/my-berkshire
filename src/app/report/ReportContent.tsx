import { after } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { computeStyle } from "@/lib/style";
import { loadPortfolioValueSeries } from "@/lib/portfolioValueSeries";
import {
  computeQuarterReport,
  quarterBounds,
  quartersBetween,
  reviewedQuarters,
  reportStreak,
} from "@/lib/finance/quarterClose";
import { computeCompoundingStreak } from "@/lib/finance/compoundingStreak";
import { loadDismissed } from "@/lib/finance/homeSignal";
import { dismissHomeSignal } from "@/app/dashboard/signalActions";
import { getDisclosuresForSymbols } from "@/lib/finance/dart";
import { loadLiabilities } from "@/lib/liabilities";
import { totalLiabilities } from "@/lib/finance/liabilities";
import { loadManualAssets } from "@/lib/realAssets";
import { totalManualAssets } from "@/lib/finance/realAssets";
import { parsePlan, planProgress } from "@/lib/plan";
import { todayKST } from "@/lib/date";
import { QuarterReportView } from "@/components/report/QuarterReportView";

/**
 * CFO 분기 결산 리포트 본문 — 페이지 크롬(BackButton·BottomTabBar) 없이 내용만.
 * 전체 페이지(`/report`)와 바텀시트(`@sheet/(.)report`)가 이 컴포넌트를 공유한다.
 * 기존 데이터(events·시세·배당·부채·수기자산)만으로 이번 분기 실적을 파생.
 */
export async function ReportContent() {
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
  const today = todayKST();

  // 리포트를 열람하면 홈의 "이번 분기 리포트" 알림은 확인 처리(같은 분기 한정).
  after(() => dismissHomeSignal(`report:${quarterBounds(today).label}`));

  // 분기 수익률 재구성용 일별 종가(자산추이와 동일 소스)
  // 독립적인 조회를 한 번에 병렬 — 결산 열람기록·일별 시세·부채·수기자산.
  // (getDailyKrwCloses 는 종목이 없으면 페치 없이 즉시 빈 결과를 돌려준다.)
  const [dismissed, valueSeriesResult, liabilities, manualAssets] = await Promise.all([
    loadDismissed(supabase, portfolio.holding.id),
    loadPortfolioValueSeries({
      supabase,
      holdingId: portfolio.holding.id,
      portfolioRevision: portfolio.holding.portfolio_revision,
      foundedAt: portfolio.holding.founded_at,
      initialValuation: Number(portfolio.holding.initial_valuation),
      events: portfolio.events,
      today,
    }),
    loadLiabilities(supabase, portfolio.holding.id),
    loadManualAssets(supabase, portfolio.holding.id),
  ]);
  const series = valueSeriesResult.data.closes;

  // 결산 스트릭 — 디스미스(결산 열람 기록)에서 파생. 지금 이 분기를 보는 중이므로 포함.
  const reviewed = reviewedQuarters(dismissed);
  reviewed.add(quarterBounds(today).label);
  const streak = reportStreak(
    quartersBetween(portfolio.holding.founded_at, today).map((q) => q.label),
    reviewed,
  );

  const report = computeQuarterReport(
    {
      foundedAt: portfolio.holding.founded_at,
      initialValuation: Number(portfolio.holding.initial_valuation),
    },
    portfolio.events,
    series,
    portfolio.prices,
    portfolio.names,
    portfolio.result.currentValuation,
    today,
  );

  // 복리 무중단 — 소비성 인출 없이 복리를 지켜온 기간(events·설립자본 파생).
  const compounding = computeCompoundingStreak(
    portfolio.events,
    {
      foundedAt: portfolio.holding.founded_at,
      initialValuation: Number(portfolio.holding.initial_valuation),
    },
    today,
  );

  // 순자산 + 규율 점수(분기말 현재 스냅샷)
  const debtKrw = totalLiabilities(liabilities);
  const manualKrw = totalManualAssets(manualAssets);
  const netWorthKrw =
    portfolio.result.currentValuation != null
      ? portfolio.result.currentValuation + manualKrw - debtKrw
      : null;

  const plan = parsePlan(portfolio.holding.active_plan);
  const planProg = plan ? planProgress(plan, portfolio.events) : null;
  const planAdherence =
    planProg && planProg.total > 0 ? planProg.doneCount / planProg.total : null;
  const style = computeStyle(portfolio, data, debtKrw, planAdherence);

  // 이번 분기 보유종목 주요 공시(DART). 키 없거나 해외종목이면 빈 배열.
  const heldSymbols = Object.keys(portfolio.positions).filter(
    (s) => portfolio.positions[s] > 0,
  );
  const disclosures = await getDisclosuresForSymbols(
    heldSymbols,
    report.start,
    today,
  );

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">
        {portfolio.holding.name} 경영 리포트
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        회장님, 이번 분기 실적을 보고드립니다
      </p>
      <QuarterReportView
        report={report}
        netWorthKrw={netWorthKrw}
        score={style.score}
        gradeLabel={style.grade?.label ?? null}
        disclosures={disclosures}
        streak={streak}
        compounding={compounding}
        factor={factor}
        currency={useUsd ? "USD" : "KRW"}
      />
    </>
  );
}
