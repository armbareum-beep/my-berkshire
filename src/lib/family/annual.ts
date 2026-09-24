import { summarize, xirr, type Portfolio } from "./model";

export type AnnualResult = {
  year: number; start: string; end: string; opening: number | null; closing: number | null;
  net: number; profit: number | null; rate: number | null; annualized: number | null;
  partial: boolean; estimated: boolean; notes: string[]; missing: string[];
};

/** Calendar-year money-weighted returns; partial periods are not annualized in the headline. */
export function annualPerformance(p: Portfolio, owner = "all", account = "all", broker = "all", group = "all"): AnnualResult[] {
  const s = summarize(p, owner, account, broker, group);
  if (!s.selected.length) return [];
  const terminal = p.pricedAt || p.asOf;
  const knownDates = [...s.movements.map(f => f.date), ...s.selected.flatMap(a => a.inceptionDate ? [a.inceptionDate] : [])].sort();
  if (!knownDates.length) return [];
  const firstYear = Number(knownDates[0].slice(0, 4)), lastYear = Number(terminal.slice(0, 4));
  const results: AnnualResult[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const boundary = `${year - 1}-12-31`, end = year === lastYear ? terminal : `${year}-12-31`;
    const missing: string[] = [], notes: string[] = [];
    let opening = 0, closing = 0, estimated = false;
    for (const a of s.selected) {
      if (a.inceptionDate && a.inceptionDate > end) continue;
      if (!a.complete) missing.push(`${a.name}: 입출금 이력 확인 필요`);
      if (!a.inceptionDate || a.inceptionDate <= boundary) {
        const v = p.valuations?.find(v => v.account === a.id && v.date === boundary);
        if (!v) missing.push(`${a.name}: ${boundary} 자산 필요`);
        else { opening += v.value; estimated ||= v.estimated; if (v.note) notes.push(v.note); }
      }
      if (end === terminal) {
        const current = summarize(p, "all", a.id);
        if (current.missing) missing.push(`${a.name}: 현재 가격 확인 필요`);
        closing += current.nav;
        if (a.valuationDate && a.valuationDate < end) { estimated = true; notes.push(`${a.name}: ${a.valuationDate} 최종 확인 잔고 사용`); }
        if (p.pricedAt && p.pricedAt !== p.asOf) { estimated = true; notes.push(`수량·현금 ${p.asOf}, 시세 ${p.pricedAt} 기준`); }
      } else {
        const v = p.valuations?.find(v => v.account === a.id && v.date === end);
        if (!v) missing.push(`${a.name}: ${end} 자산 필요`);
        else { closing += v.value; estimated ||= v.estimated; if (v.note) notes.push(v.note); }
      }
    }
    const flows = s.external.filter(f => f.date > boundary && f.date <= end);
    const net = -flows.reduce((n, f) => n + f.amount, 0) || 0;
    const daily = new Map<string, number>();
    for (const f of flows) daily.set(f.date, (daily.get(f.date) || 0) + f.amount);
    const firstFlow = [...daily].filter(([, amount]) => Math.abs(amount) > 1e-8).sort(([a], [b]) => a.localeCompare(b))[0]?.[0];
    const start = opening > 0 ? boundary : (firstFlow || `${year}-01-01`);
    const days = (Date.parse(end) - Date.parse(start)) / 86400000;
    const entries = [...(opening ? [{ date: boundary, amount: -opening }] : []), ...flows, { date: end, amount: closing }];
    const annualized = missing.length ? null : xirr(entries);
    let rate = annualized === null || days <= 0 ? null : Math.expm1(Math.log1p(annualized) * days / 365);
    if (!missing.length && days > 0 && closing === 0 && (opening > 0 || flows.some(f => f.amount < 0)) && !flows.some(f => f.amount > 0)) rate = -1;
    results.push({ year, start, end, opening: missing.some(m => m.includes(boundary)) ? null : opening,
      closing: missing.some(m => m.includes(end) || m.includes("현재 가격")) ? null : closing,
      net, profit: missing.length ? null : closing - opening - net, rate, annualized,
      partial: end !== `${year}-12-31` || start > boundary, estimated,
      notes: [...new Set(notes)], missing });
  }
  return results.reverse();
}
