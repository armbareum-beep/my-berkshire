import { performanceComparison } from "./comparison";
import { type Portfolio } from "./model";

export type AnnualResult = {
  year: number; start: string; end: string; opening: number | null; closing: number | null;
  net: number; profit: number | null; rate: number | null; annualized: null;
  partial: boolean; estimated: boolean; notes: string[]; missing: string[];
};

/** Calendar-year slices of the same daily linked TWR used by the performance card. */
export function annualPerformance(p: Portfolio, owner = "all", account = "all", broker = "all", group = "all"): AnnualResult[] {
  const history = p.performance;
  if (!history?.daily || history.daily.length < 2) return [];

  const firstYear = Number(history.daily[1].date.slice(0, 4));
  const lastYear = Number(history.end.slice(0, 4));
  const results: AnnualResult[] = [];

  for (let year = firstYear; year <= lastYear; year++) {
    const boundary = `${year - 1}-12-31`;
    const yearEnd = `${year}-12-31`;
    const start = history.start > boundary ? history.start : boundary;
    const end = history.end < yearEnd ? history.end : yearEnd;
    if (start >= end) continue;

    const result = performanceComparison(p, owner, account, broker, group, { start, end });
    results.push({
      year,
      start,
      end,
      opening: result.opening,
      closing: result.closing,
      net: result.net ?? 0,
      profit: result.profit,
      rate: result.rate,
      annualized: null,
      partial: start !== boundary || end !== yearEnd,
      estimated: history.method === "daily-eod-estimate",
      notes: history.note ? [history.note] : [],
      missing: result.reason ? [result.reason] : [],
    });
  }

  return results.reverse();
}
