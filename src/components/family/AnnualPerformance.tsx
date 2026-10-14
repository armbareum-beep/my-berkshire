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
    </section>
  </>;
}
