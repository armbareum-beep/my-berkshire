import { annualPerformance } from "@/lib/family/annual";
import { type Portfolio } from "@/lib/family/model";

const won = (n: number | null) => n === null ? "자료 필요" : Math.round(n).toLocaleString("ko-KR") + "원";
const percent = (n: number | null) => n === null ? "계산 불가" : (n > 0 ? "+" : "") + (n * 100).toFixed(2) + "%";

export default function AnnualPerformance({ data, owner, account, broker, group }: { data: Portfolio; owner: string; account: string; broker: string; group: string }) {
  const years = annualPerformance(data, owner, account, broker, group);
  const max = Math.max(.01, ...years.map(y => Math.abs(y.rate ?? 0)));
  return <>
    <section className="surface annual-intro">
      <div className="section-title"><h2>해마다 얼마나 늘었을까?</h2><span>입출금을 반영한 기간 수익률</span></div>
      <p>각 연도의 시작 자산, 입출금 날짜·금액, 종료 자산으로 계산해요. 올해는 자료 기준일까지, 첫해는 투자를 시작한 날부터의 성과입니다.</p>
      <div className="annual-chart" aria-label="연도별 수익률 비교">
        {[...years].reverse().map(y => <div className="annual-bar-row" key={y.year}>
          <span>{y.year}<small>{y.end !== `${y.year}-12-31` ? "진행 중" : y.partial ? "투자 시작" : "연간"}</small></span>
          <div className="annual-track" aria-hidden="true"><i className={y.rate !== null && y.rate < 0 ? "loss" : "gain"} style={{ width: `${Math.abs(y.rate ?? 0) / max * 100}%` }} /></div>
          <strong className={y.rate === null ? "" : y.rate < 0 ? "negative" : "positive"}>{percent(y.rate)}{y.estimated && y.rate !== null && <small>추정</small>}</strong>
        </div>)}
      </div>
      {!years.length && <p className="fine">투자 시작일과 입출금 자료를 확인하면 연도별 수익률을 표시해요.</p>}
    </section>
    <section className="surface">
      <div className="section-title"><h2>연도별 성과 내역</h2><span>선택한 가족·계좌 기준</span></div>
      <div className="table-wrap"><table className="annual-table"><thead><tr><th>연도 / 계산 기간</th><th>기간 수익률</th><th>투자손익</th><th>순입금</th><th>시작 자산</th><th>종료 자산</th></tr></thead><tbody>
        {years.map(y => <tr key={y.year}><td><strong>{y.year}년 {y.end !== `${y.year}-12-31` && <span className="tag">진행 중</span>}</strong><small>{y.start} ~ {y.end}</small></td><td><strong className={y.rate === null ? "" : y.rate < 0 ? "negative" : "positive"}>{percent(y.rate)}</strong>{y.estimated && <small>연말·최근 잔고 추정 포함</small>}</td><td className={y.profit === null ? "" : y.profit < 0 ? "negative" : "positive"}>{won(y.profit)}</td><td>{won(y.net)}</td><td>{won(y.opening)}</td><td>{won(y.closing)}</td></tr>)}
      </tbody></table></div>
      <p className="fine">투자손익 = 종료 자산 − 시작 자산 − 순입금. 두 계좌가 모두 선택된 내부이체는 상계하며, 계좌별 수익률을 단순 평균하지 않습니다.</p>
    </section>
    <details className="method annual-method"><summary>수익률 계산과 연말 자료 확인</summary>
      <p>각 기간의 XIRR을 계산한 뒤 실제 투자 일수에 맞춰 기간 수익률로 환산합니다: (1 + XIRR)^(기간 일수 / 365) − 1. 연말을 모두 포함한 해는 한 해의 성과이며, 올해·첫해 수익률은 1년으로 늘려 표시하지 않습니다. 시작 자산은 전년도 12월 31일 평가액입니다.</p>
      <p>CAGR은 여러 해에 걸친 연평균 성장률입니다. 이 화면은 매년의 성과를 보여주며, 추가 납입과 출금이 있어 금액가중 방식으로 계산합니다. 전체 투자기간의 연환산 XIRR은 자산 현황에서 확인할 수 있어요.</p>
      <p>과거 연말 자산은 거래내역에서 복원한 보유수량·현금과 연말 직전 거래일의 종가로 평가했습니다. CMA는 해당 시점까지 마지막으로 확인된 RP 포함 평가잔액을 사용합니다. 미기록 이자 등으로 실제 연말 잔고와 차이가 날 수 있습니다. 가격 출처: <a href="https://finance.yahoo.com/" target="_blank" rel="noreferrer">Yahoo Finance</a>.</p>
      {years.map(y => <div key={y.year}><strong>{y.year}년</strong>{y.missing.length > 0 ? <p>{y.missing.join(" · ")}</p> : y.rate === null ? <p>수익률을 하나로 정할 수 없거나 투자기간이 부족합니다.</p> : null}{y.notes.map(n => <p key={n}>{n}</p>)}</div>)}
    </details>
  </>;
}
