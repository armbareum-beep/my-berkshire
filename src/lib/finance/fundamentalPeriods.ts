import type { Fundamentals } from "./dart";

export type FiscalPeriod = "FY" | "Q1" | "H1" | "Q3";

export interface FundamentalPeriod {
  fiscalYear: number;
  fiscalPeriod: FiscalPeriod;
  periodEnd: string;
  data: Fundamentals;
}

export interface TtmFundamentals extends Fundamentals {
  basis: "TTM";
  periodEnd: string;
  fiscalPeriod: FiscalPeriod;
}

export interface LatestFundamentalSet {
  ttm: TtmFundamentals | null;
  latestAnnual: Fundamentals | null;
  fallbackReason: string | null;
}

const FLOW_KEYS = [
  "revenue",
  "operatingIncome",
  "netIncome",
  "ocf",
  "icf",
  "ffcf",
  "interestExpense",
  "capex",
  "dna",
] as const;

const SNAPSHOT_KEYS = [
  "assets",
  "liabilities",
  "equity",
  "intangibles",
  "receivables",
  "inventory",
  "retainedEarnings",
  "shares",
] as const;

/** FY + current YTD - prior-year matching YTD. Missing metrics stay null. */
export function composeTtm(
  annual: FundamentalPeriod,
  currentYtd: FundamentalPeriod | null,
  priorYtd: FundamentalPeriod | null,
): TtmFundamentals | null {
  if (!currentYtd || !priorYtd) return null;
  if (currentYtd.fiscalPeriod !== priorYtd.fiscalPeriod) return null;
  if (annual.data.fsDiv !== currentYtd.data.fsDiv || annual.data.fsDiv !== priorYtd.data.fsDiv)
    return null;

  const data = { ...annual.data } as Fundamentals;
  for (const key of FLOW_KEYS) {
    const fy = annual.data[key];
    const cur = currentYtd.data[key];
    const prev = priorYtd.data[key];
    data[key] = fy != null && cur != null && prev != null ? fy + cur - prev : null;
  }
  for (const key of SNAPSHOT_KEYS) data[key] = currentYtd.data[key];
  // DART 분기 주식총수 API는 종목에 따라 유통주식수를 비워 둔다.
  // 주식수는 합산 항목이 아니므로 최신 분기 값이 없을 때 직전 FY 값을 유지한다.
  data.shares = currentYtd.data.shares ?? annual.data.shares;

  data.year = currentYtd.fiscalYear;
  data.fcf = data.ocf != null && data.capex != null ? data.ocf - data.capex : null;
  data.ownerEarnings =
    data.netIncome != null && data.dna != null && data.capex != null
      ? data.netIncome + data.dna - data.capex
      : null;
  data.roe = data.netIncome != null && data.equity && data.equity > 0 ? data.netIncome / data.equity : null;
  data.debtRatio = data.liabilities != null && data.equity && data.equity > 0 ? data.liabilities / data.equity : null;
  data.operatingMargin = data.operatingIncome != null && data.revenue && data.revenue > 0 ? data.operatingIncome / data.revenue : null;
  data.eps = data.netIncome != null && data.shares && data.shares > 0 ? data.netIncome / data.shares : null;

  return {
    ...data,
    basis: "TTM",
    periodEnd: currentYtd.periodEnd,
    fiscalPeriod: currentYtd.fiscalPeriod,
  };
}
