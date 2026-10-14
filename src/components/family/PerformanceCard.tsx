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
    <p className="performance-caption">같은 기간, 독립 CMA·외화예금을 제외하고 입출금 영향을 조정한 성과를 비교해요.</p>
    <div className="performance-grid"><div className="performance-own"><span>투자계좌 · 총수익 TWR</span><strong className={shown.rate !== null && shown.rate < 0 ? "negative" : "positive"}>{shown.rate === null ? "자료 확인 필요" : percent(shown.rate)}</strong><small>세후 배당·이자 포함</small>{liveBench ? result.rate !== null && <small>{h!.end} 확정 {percent(result.rate)}</small> : today && <small>{today.rate === null ? `오늘까지 추정: ${today.reason}` : <>{live}까지 오늘 시세 추정 <b className={today.rate < 0 ? "negative" : "positive"}>{percent(today.rate)}</b></>}</small>}</div>
      <div><span>배당·이자 제외 TWR</span><strong className={shown.exIncomeRate !== null && shown.exIncomeRate < 0 ? "negative" : "positive"}>{shown.exIncomeRate === null ? "자료 확인 필요" : percent(shown.exIncomeRate)}</strong><small>{shown.incomeContribution === null ? shown.exIncomeReason : `배당·이자 기여 ${(shown.incomeContribution * 100).toFixed(2)}%p`}</small></div>
      {benchmarks.map(b => <div key={b.id}><span>{b.name}</span><strong>{percent(b.return)}</strong><small>{shown.rate === null ? "동일 기간 비교 ETF" : <>내 계좌가 <b className={shown.rate >= b.return ? "positive" : "negative"}>{Math.abs((shown.rate - b.return) * 100).toFixed(2)}%p {shown.rate >= b.return ? "높음" : "낮음"}</b></>}</small>{b.confirmed !== null && <small>{h!.end} 확정 {percent(b.confirmed)}</small>}</div>)}
    </div>
    {shown.reason && <p className="fine">{shown.reason}</p>}
    <p className="fine">비교값은 지수를 추종하는 국내 ETF의 원화 총수익률이며 분배금 재투자를 반영합니다. 독립 CMA·외화예금 계좌는 제외하지만 투자계좌 안의 예수금은 포함합니다.</p>
    {h && <details className="method"><summary>비교 기준과 추정 범위</summary><p>{h.note}</p><p>총수익은 각 날짜의 (종료 자산 − 순입금) ÷ 전일 자산을 연결합니다. 배당·이자 제외 수익률은 여기에 실제 세후 입금된 배당과 이자를 추가로 차감합니다. 세전액을 빼지 않으므로 원천징수세를 수익에서 두 번 차감하지 않습니다.</p><p>독립 CMA·외화예금과 투자계좌 사이의 이체는 투자계좌 기준 외부 입출금으로 처리합니다. 거래 시각을 알 수 없어 입출금은 일말로 가정합니다. 배당·이자 제외 수익률은 현재 총수익형 비교 ETF와 직접 비교하지 않습니다.</p><p>{h.end}까지는 확인된 거래·일별 가격으로 계산한 확정값입니다. 오늘 시세를 불러오면 {h.end} 이후를 한 구간으로 보고, 내 계좌는 현재 보유수량·현금에 오늘 가격을 곱하고 비교 ETF는 {h.end} 종가 대비 오늘 가격 변동을 이어 붙여 같은 기간으로 비교해요. 이 구간의 ETF 분배금과 아직 반영하지 않은 거래는 빠지므로 추정값입니다.</p></details>}
  </section>;
}
