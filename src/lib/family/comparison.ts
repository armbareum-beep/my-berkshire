import { summarize, type Portfolio } from "./model";

const isStandaloneCma = (type: string) => type === "CMA" || type.startsWith("CMA(");

/** Daily linked TWR approximation: external flows occur at the end of each day. */
export function performanceComparison(p: Portfolio, owner = "all", account = "all", broker = "all") {
  const history = p.performance;
  const selected = summarize(p, owner, account, broker);
  const unavailable = (reason: string) => ({ rate: null as number | null, exIncomeRate: null as number | null, incomeContribution: null as number | null, exIncomeReason: reason, reason, history });
  if (!history) return unavailable("일별 평가자료를 준비하면 운용성과를 비교할 수 있어요.");
  if (!history.daily) return unavailable("내 계좌의 일별 평가자료 확인 후 비교 수익률을 표시해요. XIRR을 TWR 대신 사용하지 않습니다.");
  if (!selected.selected.length) return unavailable("선택한 가족의 계좌 자료가 아직 없어요.");
  const invested = selected.selected.filter(a => !isStandaloneCma(a.type));
  if (!invested.length) return unavailable("독립 CMA는 운용성과 비교에서 제외해요.");
  if (invested.some(a => !a.complete)) return unavailable("입출금 내역이 완전한 계좌만 비교할 수 있어요.");
  if (history.daily.some(d => invested.some(a => d.values[a.id] === undefined))) return unavailable("선택한 계좌의 일별 평가자료가 필요해요.");
  const ids = new Set(invested.map(a => a.id));
  const movements = p.flows.filter(f => ids.has(f.account));
  const external = movements.filter(f => !f.transfer || !p.flows.some(g => g.id !== f.id && g.transfer === f.transfer && ids.has(g.account)));
  const flows = new Map<string, number>();
  for (const f of external) flows.set(f.date, (flows.get(f.date) || 0) - f.amount);
  const income = new Map<string, number>();
  for (const row of history.income || []) if (ids.has(row.account)) income.set(row.date, (income.get(row.date) || 0) + row.dividend + row.interest);
  const values = history.daily.map(d => invested.reduce((n, a) => n + d.values[a.id], 0));
  let growth = 1, exIncomeGrowth = 1;
  const incomeAccounts = new Set(history.incomeAccounts || []);
  let exIncomeReason = invested.every(a => incomeAccounts.has(a.id)) ? "" : "선택 계좌의 세후 입금 내역이 모두 필요해요.";
  for (let i = 1; i < values.length; i++) {
    const prior = values[i - 1], adjusted = values[i] - (flows.get(history.daily[i].date) || 0);
    if (prior <= 0 || adjusted < 0) return unavailable("잔고가 0이거나 입출금 시점의 영향이 커서 이 기간의 TWR을 확정할 수 없어요.");
    growth *= adjusted / prior;
    if (!Number.isFinite(growth)) return unavailable("이 기간의 운용성과를 계산할 수 없어요.");
    if (!exIncomeReason) {
      const exIncomeAdjusted = adjusted - (income.get(history.daily[i].date) || 0);
      if (exIncomeAdjusted < 0) exIncomeReason = "배당·이자 입금일의 잔고를 확인해 주세요.";
      else {
        exIncomeGrowth *= exIncomeAdjusted / prior;
        if (!Number.isFinite(exIncomeGrowth)) exIncomeReason = "배당·이자 제외 수익률을 계산할 수 없어요.";
      }
    }
  }
  const rate = growth - 1, exIncomeRate = exIncomeReason ? null : exIncomeGrowth - 1;
  return { rate, exIncomeRate, incomeContribution: exIncomeRate === null ? null : rate - exIncomeRate, exIncomeReason, reason: "", history };
}
