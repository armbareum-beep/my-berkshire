import { annualPerformance } from "@/lib/family/annual";
import { type Portfolio } from "@/lib/family/model";

const won = (n: number | null) => n === null ? "자료 필요" : Math.round(n).toLocaleString("ko-KR") + "원";
const percent = (n: number | null) => n === null ? "계산 불가" : (n > 0 ? "+" : "") + (n * 100).toFixed(2) + "%";

export default function AnnualPerformance({ data, owner, account, broker, group }: { data: Portfolio; owner: string; account: string; broker: string; group: string }) {
  const years = annualPerformance(data, owner, account, broker, group);
  const max = Math.max(.01, ...years.map(y => Math.abs(y.rate ?? 0)));
  return <>
    <section className="surface annual-intro">
      <div className="section-title"><h2>해마다 운용은 어땠을까?</h2><span>일별 TWR · 과거 수정 디츠 추정</span></div>
      <p>일별 평가자료가 있는 기간은 TWR로, 그 이전은 연말 자산과 날짜별 입출금으로 추정해요. 올해와 첫해는 확인된 기간만 표시하며 1년 수익률로 늘리지 않습니다.</p>
      <div className="annual-chart" aria-label="연도별 수익률 비교">
        {[...years].reverse().map(y => <div className="annual-bar-row" key={y.year}>
          <span>{y.year}<small>{y.end !== `${y.year}-12-31` ? "진행 중" : y.partial ? "투자 시작" : "연간"}</small></span>
          <div className="annual-track" aria-hidden="true"><i className={y.rate !== null && y.rate < 0 ? "loss" : "gain"} style={{ width: `${Math.abs(y.rate ?? 0) / max * 100}%` }} /></div>
          <strong className={y.rate === null ? "" : y.rate < 0 ? "negative" : "positive"}>{percent(y.rate)}{y.rate !== null && <small>{y.method === "twr" ? "TWR" : "과거 추정"}</small>}</strong>
        </div>)}
      </div>
      {!years.length && <p className="fine">연말 자산과 입출금 자료를 확인하면 연도별 수익률을 표시해요.</p>}
    </section>
    <section className="surface">
      <div className="section-title"><h2>연도별 성과 내역</h2><span>독립 CMA·외화예금 제외</span></div>
      <div className="table-wrap"><table className="annual-table"><thead><tr><th>연도 / 계산 기간</th><th>수익률</th><th>투자손익</th><th>순입금</th><th>시작 자산</th><th>종료 자산</th></tr></thead><tbody>
        {years.map(y => <tr key={y.year}><td><strong>{y.year}년 {y.end !== `${y.year}-12-31` && <span className="tag">진행 중</span>}</strong><small>{y.start} ~ {y.end}</small></td><td><strong className={y.rate === null ? "" : y.rate < 0 ? "negative" : "positive"}>{percent(y.rate)}</strong>{y.rate !== null && <small>{y.method === "twr" ? "총수익 TWR" : "수정 디츠 추정"}</small>}</td><td className={y.profit === null ? "" : y.profit < 0 ? "negative" : "positive"}>{won(y.profit)}</td><td>{won(y.net)}</td><td>{won(y.opening)}</td><td>{won(y.closing)}</td></tr>)}
      </tbody></table></div>
      <p className="fine">투자손익 = 종료 자산 − 시작 자산 − 순입금. 계좌별 수익률을 단순 평균하지 않고 선택한 계좌의 자산과 입출금을 합쳐 계산합니다.</p>
    </section>
    <details className="method annual-method"><summary>연도별 수익률 계산과 자료 범위</summary>
      <p>일별 평가자료가 있는 연도는 각 날짜의 (종료 자산 − 순입금) ÷ 전일 자산을 연결한 총수익 TWR입니다. 같은 기간의 운용성과 카드와 같은 값입니다.</p>
      <p>그 이전 연도는 원본 거래내역으로 복원한 연말 자산과 날짜별 입출금을 사용한 수정 디츠 추정치입니다. 일별 평가액이 없는 과거를 TWR이나 XIRR로 잘못 부르지 않습니다.</p>
      <p>독립 CMA·외화예금은 제외하고 투자계좌 안의 예수금은 포함합니다. 두 계좌가 모두 선택된 내부이체는 상계하며, CMA·외화예금에서 투자계좌로 옮긴 돈은 투자계좌의 외부 입금으로 처리합니다.</p>
      <p>배당·이자와 세금은 실제 잔고에 반영된 총수익 기준입니다. 과거 값은 연말 평가액과 입출금 시점이 정확할수록 TWR에 가까워지지만, 일별 TWR과 완전히 같은 지표는 아닙니다.</p>
      {years.map(y => <div key={y.year}><strong>{y.year}년</strong>{y.missing.length > 0 ? <p>{y.missing.join(" · ")}</p> : y.rate === null ? <p>수익률을 하나로 정할 수 없거나 투자기간이 부족합니다.</p> : null}{y.notes.map(n => <p key={n}>{n}</p>)}</div>)}
    </details>
  </>;
}
