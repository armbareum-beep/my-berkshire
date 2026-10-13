import { accountGroup, summarize, type Portfolio } from "./model";

/** Standalone cash accounts (CMA, foreign-currency deposits) are not invested portfolios. */
const isStandaloneCashAccount = (type: string) => accountGroup(type) === "cma" || accountGroup(type) === "fx";

/**
 * Today's quotes add one estimated step after the last daily close. Holdings and cash stay as of `asOf`,
 * so trades after that date must be recorded first.
 */
export function liveEnd(p: Portfolio) {
  const h = p.performance;
  return h?.daily && p.pricedAt && p.pricedAt > h.end && p.asOf >= h.end ? p.pricedAt : null;
}

/** Benchmarks through `liveEnd`: stored total return to the last daily close, then today's price move. Null unless every benchmark moved. */
export function liveBenchmarks(p: Portfolio) {
  const h = p.performance, moves = p.benchmarkMoves;
  if (!h || !liveEnd(p) || !moves || !h.benchmarks.length || h.benchmarks.some(b => !(moves[b.id] > 0))) return null;
  return h.benchmarks.map(b => ({ ...b, return: (1 + b.return) * moves[b.id] - 1, confirmed: b.return }));
}

/** Daily linked TWR approximation: external flows occur at the end of each day. */
export function performanceComparison(
  p: Portfolio,
  owner = "all",
  account = "all",
  broker = "all",
  group = "all",
  period?: { start: string; end: string },
) {
  const history = p.performance;
  const selected = summarize(p, owner, account, broker, group);
  const periodStart = period?.start ?? history?.start ?? null;
  const periodEnd = period?.end ?? history?.end ?? null;
  const unavailable = (reason: string) => ({
    rate: null as number | null,
    exIncomeRate: null as number | null,
    incomeContribution: null as number | null,
    exIncomeReason: reason,
    reason,
    history,
    start: periodStart,
    end: periodEnd,
    opening: null as number | null,
    closing: null as number | null,
    net: null as number | null,
    profit: null as number | null,
    live: false,
  });
  if (!history) return unavailable("일별 평가자료를 준비하면 운용성과를 비교할 수 있어요.");
  if (!history.daily) return unavailable("내 계좌의 일별 평가자료 확인 후 비교 수익률을 표시해요. XIRR을 TWR 대신 사용하지 않습니다.");
  const live = !!periodEnd && periodEnd === liveEnd(p);
  const lastDaily = live ? history.end : periodEnd;
  if (!periodStart || !periodEnd || !lastDaily || periodStart < history.start || lastDaily > history.end || periodStart >= periodEnd) {
    return unavailable("선택한 기간의 일별 평가자료가 필요해요.");
  }
  const daily = history.daily.filter(d => d.date >= periodStart && d.date <= lastDaily);
  if (daily.length < (live ? 1 : 2) || daily[0].date !== periodStart || daily[daily.length - 1].date !== lastDaily) {
    return unavailable("선택한 기간의 일별 평가자료가 필요해요.");
  }
  if (!selected.selected.length) return unavailable("선택한 가족의 계좌 자료가 아직 없어요.");
  const invested = selected.selected.filter(a => !isStandaloneCashAccount(a.type));
  if (!invested.length) return unavailable("독립 CMA·외화 계좌는 운용성과 비교에서 제외해요.");
  if (invested.some(a => !a.complete)) return unavailable("입출금 내역이 완전한 계좌만 비교할 수 있어요.");
  if (daily.some(d => invested.some(a => d.values[a.id] === undefined))) return unavailable("선택한 계좌의 일별 평가자료가 필요해요.");
  const ids = new Set(invested.map(a => a.id));
  const movements = p.flows.filter(f => ids.has(f.account));
  const external = movements.filter(f => !f.transfer || !p.flows.some(g => g.id !== f.id && g.transfer === f.transfer && ids.has(g.account)));
  const flows = new Map<string, number>();
  for (const f of external) flows.set(f.date, (flows.get(f.date) || 0) - f.amount);
  const income = new Map<string, number>();
  for (const row of history.income || []) if (ids.has(row.account)) income.set(row.date, (income.get(row.date) || 0) + row.dividend + row.interest);
  const values = daily.map(d => invested.reduce((n, a) => n + d.values[a.id], 0));
  const dates = daily.map(d => d.date);
  if (live) {
    const today = invested.reduce((n, a) => n + a.cash + selected.positions.filter(h => h.account === a.id).reduce((m, h) => m + (h.value ?? NaN), 0), 0);
    if (!Number.isFinite(today)) return unavailable("오늘 시세가 없는 상품이 있어 오늘까지의 TWR을 계산할 수 없어요.");
    values.push(today); dates.push(periodEnd);
  }
  /** Daily steps are consecutive dates; the live step covers every date after the last daily close. */
  const step = (map: Map<string, number>, i: number) => i < daily.length ? map.get(dates[i]) || 0 : [...map].reduce((n, [date, v]) => date > dates[i - 1] && date <= dates[i] ? n + v : n, 0);
  let growth = 1, exIncomeGrowth = 1;
  const incomeAccounts = new Set(history.incomeAccounts || []);
  const missingIncomeAccounts = invested.filter(a => !incomeAccounts.has(a.id));
  let exIncomeReason = missingIncomeAccounts.length
    ? `세후 배당·이자 입금 내역 필요: ${missingIncomeAccounts.map(a => `${a.broker} ${a.name}`).join(", ")}`
    : "";
  for (let i = 1; i < values.length; i++) {
    const prior = values[i - 1], adjusted = values[i] - step(flows, i);
    if (prior <= 0 || adjusted < 0) return unavailable("잔고가 0이거나 입출금 시점의 영향이 커서 이 기간의 TWR을 확정할 수 없어요.");
    growth *= adjusted / prior;
    if (!Number.isFinite(growth)) return unavailable("이 기간의 운용성과를 계산할 수 없어요.");
    if (!exIncomeReason) {
      const exIncomeAdjusted = adjusted - step(income, i);
      if (exIncomeAdjusted < 0) exIncomeReason = "배당·이자 입금일의 잔고를 확인해 주세요.";
      else {
        exIncomeGrowth *= exIncomeAdjusted / prior;
        if (!Number.isFinite(exIncomeGrowth)) exIncomeReason = "배당·이자 제외 수익률을 계산할 수 없어요.";
      }
    }
  }
  const rate = growth - 1, exIncomeRate = exIncomeReason ? null : exIncomeGrowth - 1;
  const opening = values[0], closing = values[values.length - 1];
  const net = external.filter(f => f.date > periodStart && f.date <= periodEnd).reduce((n, f) => n - f.amount, 0) || 0;
  return {
    rate,
    exIncomeRate,
    incomeContribution: exIncomeRate === null ? null : rate - exIncomeRate,
    exIncomeReason,
    reason: "",
    history,
    start: periodStart,
    end: periodEnd,
    opening,
    closing,
    net,
    profit: closing - opening - net,
    live,
  };
}
