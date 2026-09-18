import { summarize, type Portfolio } from "./model";

/** Daily linked TWR approximation: external flows occur at the end of each day. */
export function performanceComparison(p: Portfolio, owner = "all", account = "all", broker = "all") {
  const history = p.performance;
  const selected = summarize(p, owner, account, broker);
  const unavailable = (reason: string) => ({ rate: null as number | null, reason, history });
  if (!history) return unavailable("일별 평가자료를 준비하면 운용성과를 비교할 수 있어요.");
  if (!history.daily) return unavailable("내 계좌의 일별 평가자료 확인 후 비교 수익률을 표시해요. XIRR을 TWR 대신 사용하지 않습니다.");
  if (!selected.selected.length) return unavailable("선택한 가족의 계좌 자료가 아직 없어요.");
  if (selected.selected.some(a => !a.complete)) return unavailable("입출금 내역이 완전한 계좌만 비교할 수 있어요.");
  if (history.daily.some(d => selected.selected.some(a => d.values[a.id] === undefined))) return unavailable("선택한 계좌의 일별 평가자료가 필요해요.");
  const flows = new Map<string, number>();
  for (const f of selected.external) flows.set(f.date, (flows.get(f.date) || 0) - f.amount);
  const values = history.daily.map(d => selected.selected.reduce((n, a) => n + d.values[a.id], 0));
  let growth = 1;
  for (let i = 1; i < values.length; i++) {
    const prior = values[i - 1], adjusted = values[i] - (flows.get(history.daily[i].date) || 0);
    if (prior <= 0 || adjusted < 0) return unavailable("잔고가 0이거나 입출금 시점의 영향이 커서 이 기간의 TWR을 확정할 수 없어요.");
    growth *= adjusted / prior;
    if (!Number.isFinite(growth)) return unavailable("이 기간의 운용성과를 계산할 수 없어요.");
  }
  return { rate: growth - 1, reason: "", history };
}
