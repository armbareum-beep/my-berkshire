import { performanceComparison } from "@/lib/family/comparison";
import { type Portfolio } from "@/lib/family/model";

const percent = (n: number) => (n > 0 ? "+" : "") + (n * 100).toFixed(2) + "%";
export default function PerformanceCard({ data, owner, account, broker }: { data: Portfolio; owner: string; account: string; broker: string }) {
  const result = performanceComparison(data, owner, account, broker), h = result.history;
  return <section className="surface performance-card">
    <div className="section-title"><h2>운용성과 비교</h2><span>{h ? `${h.start} ~ ${h.end}` : "자료 준비 중"}</span></div>
    <p className="performance-caption">같은 기간, 입출금 영향을 조정한 성과를 비교해요.</p>
    <div className="performance-grid"><div className="performance-own"><span>선택한 계좌 · 추정 TWR</span><strong className={result.rate !== null && result.rate < 0 ? "negative" : "positive"}>{result.rate === null ? "자료 확인 필요" : percent(result.rate)}</strong><small>원화 · 실제 기간 수익률</small></div>
      {h?.benchmarks.map(b => <div key={b.id}><span>{b.name}</span><strong>{percent(b.return)}</strong><small>{result.rate === null ? "동일 기간 비교 ETF" : <>내 계좌가 <b className={result.rate >= b.return ? "positive" : "negative"}>{Math.abs((result.rate - b.return) * 100).toFixed(2)}%p {result.rate >= b.return ? "높음" : "낮음"}</b></>}</small></div>)}
    </div>
    {result.reason && <p className="fine">{result.reason}</p>}
    <p className="fine">비교값은 지수를 추종하는 국내 ETF의 원화 수익률이며 분배금 재투자를 반영합니다. 주식·채권·CMA가 섞인 계좌와 위험 수준이 달라 참고용으로 비교해 주세요.</p>
    {h && <details className="method"><summary>비교 기준과 추정 범위</summary><p>{h.note}</p><p>각 날짜의 (종료 자산 − 순입금) ÷ 전일 자산을 연결합니다. 거래 시각을 알 수 없어 입출금은 일말로 가정합니다. ETF는 보수·추적오차로 지수 자체의 수익률과 다를 수 있어요.</p><p>이 카드는 {h.end}까지 확인된 거래·일별 가격 기준으로 고정됩니다. ‘시세 갱신’은 자산 현황만 갱신하며 비교 기간을 늘리지 않습니다. 이후 자료를 반영할 때 함께 갱신해요.</p></details>}
  </section>;
}
