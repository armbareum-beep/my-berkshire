import { benchmarkPerformance, liveEnd, performanceComparison } from "@/lib/family/comparison";
import { type Portfolio } from "@/lib/family/model";

const percent = (n: number) => (n > 0 ? "+" : "") + (n * 100).toFixed(2) + "%";
export default function PerformanceCard({ data, owner, account, broker, group }: { data: Portfolio; owner: string; account: string; broker: string; group: string }) {
  const result = performanceComparison(data, owner, account, broker, group), h = result.history;
  const live = h && liveEnd(data), today = live ? performanceComparison(data, owner, account, broker, group, { start: h.start, end: live }) : null;
  const shown = today && today.rate !== null ? today : result, benchmarks = benchmarkPerformance(data);
  return <section className="surface performance-card">
    <div className="section-title"><h2>운용성과 비교</h2><span>{h ? `${h.start} 이후 · 항목별 기준일 표시` : "자료 준비 중"}</span></div>
    <div className="performance-grid"><div className="performance-own"><span>투자계좌 · 총수익 TWR</span><strong className={shown.rate !== null && shown.rate < 0 ? "negative" : "positive"}>{shown.rate === null ? "자료 확인 필요" : percent(shown.rate)}</strong><small>세후 배당·이자 포함</small><small>{shown.start} ~ {shown.end}{shown.live ? " · 시세 추정" : " · 저장 자료"}</small>{shown.live ? result.rate !== null && <small>{h!.end} 저장 {percent(result.rate)}</small> : today && today.rate === null && <small>최근 시세 추정: {today.reason}</small>}</div>
      <div><span>배당·이자 제외 TWR</span><strong className={shown.exIncomeRate !== null && shown.exIncomeRate < 0 ? "negative" : "positive"}>{shown.exIncomeRate === null ? "자료 확인 필요" : percent(shown.exIncomeRate)}</strong><small>{shown.incomeContribution === null ? shown.exIncomeReason : `배당·이자 기여 ${(shown.incomeContribution * 100).toFixed(2)}%p`}</small></div>
      {benchmarks.map(b => <div key={b.id}><span>{b.name}</span><strong>{percent(b.return)}</strong><small>{h!.start} ~ {b.asOf}{b.current ? ` · ${b.currency} · ${b.totalReturn ? "분배금 재투자" : "분배금 제외"}` : " · 갱신 대기"}</small><small>{shown.rate !== null && shown.end === b.asOf ? <>내 계좌가 <b className={shown.rate >= b.return ? "positive" : "negative"}>{Math.abs((shown.rate - b.return) * 100).toFixed(2)}%p {shown.rate >= b.return ? "높음" : "낮음"}</b></> : "계좌와 기준일이 달라 격차 비교 보류"}</small></div>)}
    </div>
    {shown.reason && <p className="fine">{shown.reason}</p>}
  </section>;
}
