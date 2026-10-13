import { liveEnd, performanceComparison } from "@/lib/family/comparison";
import { type Portfolio } from "@/lib/family/model";

const percent = (n: number) => (n > 0 ? "+" : "") + (n * 100).toFixed(2) + "%";
export default function PerformanceCard({ data, owner, account, broker, group }: { data: Portfolio; owner: string; account: string; broker: string; group: string }) {
  const result = performanceComparison(data, owner, account, broker, group), h = result.history;
  /** Benchmarks are fixed to the daily period, so today's estimate is shown beside it rather than replacing it. */
  const live = h && liveEnd(data), today = live ? performanceComparison(data, owner, account, broker, group, { start: h.start, end: live }) : null;
  return <section className="surface performance-card">
    <div className="section-title"><h2>운용성과 비교</h2><span>{h ? `${h.start} ~ ${h.end}` : "자료 준비 중"}</span></div>
    <p className="performance-caption">같은 기간, 독립 CMA·외화예금을 제외하고 입출금 영향을 조정한 성과를 비교해요.</p>
    <div className="performance-grid"><div className="performance-own"><span>투자계좌 · 총수익 TWR</span><strong className={result.rate !== null && result.rate < 0 ? "negative" : "positive"}>{result.rate === null ? "자료 확인 필요" : percent(result.rate)}</strong><small>세후 배당·이자 포함</small>{today && <small>{today.rate === null ? `오늘까지 추정: ${today.reason}` : <>{live}까지 오늘 시세 추정 <b className={today.rate < 0 ? "negative" : "positive"}>{percent(today.rate)}</b></>}</small>}</div>
      <div><span>배당·이자 제외 TWR</span><strong className={result.exIncomeRate !== null && result.exIncomeRate < 0 ? "negative" : "positive"}>{result.exIncomeRate === null ? "자료 확인 필요" : percent(result.exIncomeRate)}</strong><small>{result.incomeContribution === null ? result.exIncomeReason : `배당·이자 기여 ${(result.incomeContribution * 100).toFixed(2)}%p`}</small></div>
      {h?.benchmarks.map(b => <div key={b.id}><span>{b.name}</span><strong>{percent(b.return)}</strong><small>{result.rate === null ? "동일 기간 비교 ETF" : <>내 계좌가 <b className={result.rate >= b.return ? "positive" : "negative"}>{Math.abs((result.rate - b.return) * 100).toFixed(2)}%p {result.rate >= b.return ? "높음" : "낮음"}</b></>}</small></div>)}
    </div>
    {result.reason && <p className="fine">{result.reason}</p>}
    <p className="fine">비교값은 지수를 추종하는 국내 ETF의 원화 총수익률이며 분배금 재투자를 반영합니다. 독립 CMA·외화예금 계좌는 제외하지만 투자계좌 안의 예수금은 포함합니다.</p>
    {h && <details className="method"><summary>비교 기준과 추정 범위</summary><p>{h.note}</p><p>총수익은 각 날짜의 (종료 자산 − 순입금) ÷ 전일 자산을 연결합니다. 배당·이자 제외 수익률은 여기에 실제 세후 입금된 배당과 이자를 추가로 차감합니다. 세전액을 빼지 않으므로 원천징수세를 수익에서 두 번 차감하지 않습니다.</p><p>독립 CMA·외화예금과 투자계좌 사이의 이체는 투자계좌 기준 외부 입출금으로 처리합니다. 거래 시각을 알 수 없어 입출금은 일말로 가정합니다. 배당·이자 제외 수익률은 현재 총수익형 비교 ETF와 직접 비교하지 않습니다.</p><p>비교 수익률은 {h.end}까지 확인된 거래·일별 가격 기준으로 고정됩니다. 오늘 시세를 불러오면 {h.end} 이후를 한 구간으로 보고 현재 보유수량·현금에 오늘 가격을 곱해 추정 TWR을 함께 보여줘요. 그 사이 거래를 아직 반영하지 않았다면 추정값이 틀릴 수 있어요.</p></details>}
  </section>;
}
