/**
 * ENUF Annual Report 계산 코어.
 * 설립 1주년 이후에만 열리며, 열람일 기준 직전 1년을 같은 XIRR 엔진으로 평가한다.
 */
import { daysSince } from "./xirr";
import { periodReturn } from "./periodReturns";
import { closeOnOrBefore, pointAt, type HoldingSeed } from "./valueSeries";
import { netQuantities, type InvestmentEvent } from "./valuation";
import type { DailyBar } from "./prices";

export interface AnnualBusinessPerf {
  symbol: string;
  name: string;
  changePct: number | null;
}

export interface AnnualReport {
  edition: number;
  label: string;
  start: string;
  end: string;
  xirr: number | null;
  cumulative: number | null;
  startValue: number;
  endValue: number;
  dividends: number;
  fees: number;
  buys: number;
  sells: number;
  best: AnnualBusinessPerf | null;
  worst: AnnualBusinessPerf | null;
  comment: string;
}

function shiftYear(date: string, amount: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + amount);
  // 2월 29일은 비윤년의 2월 말로 고정한다.
  if (d.getUTCMonth() !== month) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

export function annualReportEligibility(foundedAt: string, today: string) {
  const unlockDate = shiftYear(foundedAt, 1);
  return {
    eligible: today >= unlockDate,
    unlockDate,
    remainingDays: today >= unlockDate ? 0 : daysSince(today, unlockDate),
  };
}

function cfoComment(report: Pick<AnnualReport, "cumulative" | "fees" | "buys" | "sells">) {
  const trades = report.buys + report.sells;
  if (trades === 0)
    return "시장의 소음보다 보유한 사업에 집중한 한 해였습니다. 거래하지 않은 결정도 자본배분입니다.";
  if (report.cumulative != null && report.cumulative >= 0 && report.fees === 0)
    return "성과와 함께 비용 규율도 지켰습니다. 결과보다 반복 가능한 과정이 회사의 자산입니다.";
  if (report.fees > 0)
    return "올해의 성과와 별개로 마찰비용은 확정 손실입니다. 다음 해에는 각 거래의 이유와 비용을 함께 점검하세요.";
  return "한 해의 시장 평가는 끝났지만 사업의 가치는 계속 변합니다. 가격과 사업 실적을 분리해 다음 결정을 준비하세요.";
}

export function computeAnnualReport(
  holding: HoldingSeed,
  events: InvestmentEvent[],
  series: Record<string, DailyBar[]>,
  prices: Record<string, number>,
  names: Record<string, string>,
  currentValuation: number,
  today: string,
): AnnualReport {
  const eligibility = annualReportEligibility(holding.foundedAt, today);
  if (!eligibility.eligible) throw new Error("annual_report_locked");

  const start = shiftYear(today, -1);
  const startValue = pointAt(holding, events, series, start).value;
  const period = periodReturn(start, startValue, events, currentValuation, today);
  let dividends = 0;
  let fees = 0;
  let buys = 0;
  let sells = 0;
  for (const event of events) {
    if (event.date <= start || event.date > today) continue;
    fees += event.feeAndTax;
    if (event.type === "DIVIDEND") dividends += event.priceOrAmount;
    else if (event.type === "BUY") buys += 1;
    else if (event.type === "SELL") sells += 1;
  }

  const stocks: AnnualBusinessPerf[] = [];
  for (const [symbol, quantity] of Object.entries(netQuantities(events))) {
    if (quantity <= 0) continue;
    const startClose = series[symbol]
      ? closeOnOrBefore(series[symbol], start)
      : null;
    const endClose = prices[symbol] ?? null;
    stocks.push({
      symbol,
      name: names[symbol] ?? symbol,
      changePct:
        startClose != null && startClose > 0 && endClose != null
          ? endClose / startClose - 1
          : null,
    });
  }
  const ranked = stocks
    .filter((stock) => stock.changePct != null)
    .sort((a, b) => (b.changePct as number) - (a.changePct as number));

  const report: AnnualReport = {
    edition: Math.max(1, Math.floor(daysSince(holding.foundedAt, today) / 365)),
    label: `${today.slice(0, 4)} 연차보고서`,
    start,
    end: today,
    xirr: period.xirr,
    cumulative: period.cumulative,
    startValue,
    endValue: currentValuation,
    dividends,
    fees,
    buys,
    sells,
    best: ranked[0] ?? null,
    worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    comment: "",
  };
  report.comment = cfoComment(report);
  return report;
}
