import { performanceComparison } from "./comparison";
import { accountGroup, summarize, type Portfolio } from "./model";

export type AnnualResult = {
  year: number; start: string; end: string; opening: number | null; closing: number | null;
  net: number; profit: number | null; rate: number | null; annualized: null;
  partial: boolean; estimated: boolean; method: "twr" | "modified-dietz";
  notes: string[]; missing: string[];
};

const isStandaloneCashAccount = (type: string) => accountGroup(type) === "cma" || accountGroup(type) === "fx";
const day = (date: string) => Date.parse(date) / 86400000;

/** Daily TWR where available; older years use a clearly labelled Modified Dietz estimate. */
export function annualPerformance(p: Portfolio, owner = "all", account = "all", broker = "all", group = "all"): AnnualResult[] {
  const history = p.performance;
  const selected = summarize(p, owner, account, broker, group).selected;
  const invested = selected.filter(a => !isStandaloneCashAccount(a.type));
  const ids = new Set(invested.map(a => a.id));
  const movements = p.flows.filter(f => ids.has(f.account));
  const external = movements.filter(f => !f.transfer || !p.flows.some(g => g.id !== f.id && g.transfer === f.transfer && ids.has(g.account)));
  const knownDates = [
    ...invested.flatMap(a => a.inceptionDate ? [a.inceptionDate] : []),
    ...external.map(f => f.date),
    ...(p.valuations || []).filter(v => ids.has(v.account)).map(v => v.date),
    ...(history?.daily?.length ? [history.start, history.end] : []),
  ].sort();
  if (!knownDates.length && !history?.daily?.length) return [];

  const firstYear = Number((knownDates[0] || history!.start).slice(0, 4));
  const lastYear = Number((history?.end || knownDates[knownDates.length - 1]).slice(0, 4));
  const results: AnnualResult[] = [];

  for (let year = firstYear; year <= lastYear; year++) {
    const boundary = `${year - 1}-12-31`;
    const yearEnd = `${year}-12-31`;
    const twrStart = history && history.start > boundary ? history.start : boundary;
    const twrEnd = history && history.end < yearEnd ? history.end : yearEnd;
    if (history?.daily && twrStart < twrEnd && twrStart >= history.start && twrEnd <= history.end) {
      const result = performanceComparison(p, owner, account, broker, group, { start: twrStart, end: twrEnd });
      results.push({
        year,
        start: twrStart,
        end: twrEnd,
        opening: result.opening,
        closing: result.closing,
        net: result.net ?? 0,
        profit: result.profit,
        rate: result.rate,
        annualized: null,
        partial: twrStart !== boundary || twrEnd !== yearEnd,
        estimated: history.method === "daily-eod-estimate",
        method: "twr",
        notes: history.note ? [history.note] : [],
        missing: result.reason ? [result.reason] : [],
      });
      continue;
    }

    if (!invested.length) continue;
    const missing: string[] = [];
    const notes: string[] = [];
    let opening = 0;
    let closing = 0;
    let active = 0;
    for (const a of invested) {
      if (a.inceptionDate && a.inceptionDate > yearEnd) continue;
      active++;
      if (!a.complete) missing.push(`${a.name}: 입출금 이력 확인 필요`);
      if (!a.inceptionDate || a.inceptionDate <= boundary) {
        const value = p.valuations?.find(v => v.account === a.id && v.date === boundary);
        if (!value) missing.push(`${a.name}: ${boundary} 자산 필요`);
        else {
          opening += value.value;
          if (value.note) notes.push(value.note);
        }
      }
      const value = p.valuations?.find(v => v.account === a.id && v.date === yearEnd);
      if (!value) missing.push(`${a.name}: ${yearEnd} 자산 필요`);
      else {
        closing += value.value;
        if (value.note) notes.push(value.note);
      }
    }
    if (!active) continue;

    const flows = external.filter(f => f.date > boundary && f.date <= yearEnd);
    const contributions = flows.map(f => ({ date: f.date, amount: -f.amount }));
    const net = contributions.reduce((sum, f) => sum + f.amount, 0) || 0;
    const firstFlow = contributions.filter(f => Math.abs(f.amount) > 1e-8).sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
    const firstInception = invested.map(a => a.inceptionDate).filter((d): d is string => !!d && d > boundary && d <= yearEnd).sort()[0];
    const start = opening > 0 ? boundary : (firstFlow || firstInception || `${year}-01-01`);
    const duration = day(yearEnd) - day(start);
    const weighted = duration > 0
      ? contributions.reduce((sum, f) => sum + f.amount * Math.max(0, Math.min(1, (day(yearEnd) - day(f.date)) / duration)), 0)
      : 0;
    const profit = closing - opening - net;
    const denominator = opening + weighted;
    const uniqueMissing = [...new Set(missing)];
    const rate = uniqueMissing.length || duration <= 0 || denominator <= 0 ? null : profit / denominator;

    results.push({
      year,
      start,
      end: yearEnd,
      opening: uniqueMissing.some(m => m.includes(boundary)) ? null : opening,
      closing: uniqueMissing.some(m => m.includes(yearEnd)) ? null : closing,
      net,
      profit: uniqueMissing.length ? null : profit,
      rate,
      annualized: null,
      partial: start !== boundary,
      estimated: true,
      method: "modified-dietz",
      notes: [...new Set(notes)],
      missing: uniqueMissing,
    });
  }

  return results.reverse();
}
