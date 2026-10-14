import { liveBenchmarks, liveEnd, performanceComparison } from "@/lib/family/comparison";
import { type Portfolio } from "@/lib/family/model";

const percent = (n: number) => (n > 0 ? "+" : "") + (n * 100).toFixed(2) + "%";
export default function PerformanceCard({ data, owner, account, broker, group }: { data: Portfolio; owner: string; account: string; broker: string; group: string }) {
  const result = performanceComparison(data, owner, account, broker, group), h = result.history;
  /** With today's quotes for the account and every benchmark, the whole card moves to today; otherwise the daily period stays and today's TWR sits beside it. */
  const live = h && liveEnd(data), today = live ? performanceComparison(data, owner, account, broker, group, { start: h.start, end: live }) : null;
  const liveBench = today && today.rate !== null ? liveBenchmarks(data) : null;
  const shown = liveBench ? today! : result, benchmarks = liveBench ?? h?.benchmarks.map(b => ({ ...b, confirmed: null })) ?? [];
  return <section className="surface performance-card">
    <div className="section-title"><h2>운용성과 비교</h2><span>{h ? `${h.start} ~ ${liveBench ? `${live} · 오늘 시세 추정` : h.end}` : "자료 준비 중"}</span></div>
    <div className="performance-grid"><div className="performance-own"><span>투자계좌 · 총수익 TWR</span><strong className={shown.rate !== null && shown.rate < 0 ? "negative" : "positive"}>{shown.rate === null ? "자료 확인 필요" : percent(shown.rate)}</strong><small>세후 배당·이자 포함</small>{liveBench ? result.rate !== null && <small>{h!.end} 확정 {percent(result.rate)}</small> : today && <small>{today.rate === null ? `오늘까지 추정: ${today.reason}` : <>{live}까지 오늘 시세 추정 <b className={today.rate < 0 ? "negative" : "positive"}>{percent(today.rate)}</b></>}</small>}</div>
      <div><span>배당·이자 제외 TWR</span><strong className={shown.exIncomeRate !== null && shown.exIncomeRate < 0 ? "negative" : "positive"}>{shown.exIncomeRate === null ? "자료 확인 필요" : percent(shown.exIncomeRate)}</strong><small>{shown.incomeContribution === null ? shown.exIncomeReason : `배당·이자 기여 ${(shown.incomeContribution * 100).toFixed(2)}%p`}</small></div>
      {benchmarks.map(b => <div key={b.id}><span>{b.name}</span><strong>{percent(b.return)}</strong><small>{shown.rate === null ? "동일 기간 비교 ETF" : <>내 계좌가 <b className={shown.rate >= b.return ? "positive" : "negative"}>{Math.abs((shown.rate - b.return) * 100).toFixed(2)}%p {shown.rate >= b.return ? "높음" : "낮음"}</b></>}</small>{b.confirmed !== null && <small>{h!.end} 확정 {percent(b.confirmed)}</small>}</div>)}
    </div>
    {shown.reason && <p className="fine">{shown.reason}</p>}
  </section>;
}
