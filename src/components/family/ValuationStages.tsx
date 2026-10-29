import { alertStages, readAlertBasis } from "@/lib/family/valuation-alerts";

const won = (n: number) => Math.round(n).toLocaleString("ko-KR") + "원";
function Stages({ values, side }: { values: (boolean | null)[]; side: "down" | "up" }) {
  return <span className={`alert-side ${side}`}><span>{side === "down" ? "저평가" : "고평가"}</span>{values.map((hit, i) => <span key={i} className={`alert-stage ${hit === true ? "hit" : hit === null ? "unknown" : "waiting"}`} aria-label={`${i + 1}차 ${hit === true ? "도달" : hit === false ? "미도달" : "판정 보류"}`}>{i + 1}{hit === true && "✓"}</span>)}</span>;
}
/** Screen quote comparison; this does not claim a historical touch or an automation delivery. */
export default function ValuationStages({ basis: input, price, marketTime }: { basis: unknown; price: number | null; marketTime?: number }) {
  if (input === undefined) return <p className="alert-empty">가격 기준 미등록</p>;
  const basis = readAlertBasis(input);
  if (!basis) return <p className="alert-empty">가격 기준 확인 필요</p>;
  const methods = basis.methods.map(method => ({ method, state: alertStages(method, price, marketTime) }));
  const quoteTime = typeof marketTime === "number" && marketTime > 0 && Number.isFinite(marketTime) ? new Date(marketTime * 1000).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : null;
  return <details className="valuation-alert">
    <summary aria-label="저평가·고평가 단계와 기준가격 보기">{methods.map(({ method, state }) => <span className="alert-summary-row" key={method.id}><span className="alert-method">{method.label}</span><Stages values={state.down} side="down" /><Stages values={state.up} side="up" /></span>)}<span className="alert-expand">{methods.every(m => m.state.usable) ? "기준가격 보기" : "판정 보류 · 기준가격 보기"}</span></summary>
    <div className="alert-detail">
      <p>{price !== null ? `비교 주가 ${won(price)}` : "시세 없음"}{quoteTime ? ` · ${quoteTime} KST` : " · 시세 시각 확인 필요"}</p>
      {!methods.every(m => m.state.usable) && <p className="alert-pending">시세가 없거나 오래됐거나 기준 검토가 보류된 항목은 도달 여부를 표시하지 않아요.</p>}
      {methods.map(({ method, state }) => <div key={method.id} className="alert-method-detail"><p><strong>{method.label}</strong>{method.status === "hold" && " · 기준 검토 보류"}</p><table><caption className="sr-only">{method.label} 단계별 기준과 시세 비교</caption><thead><tr><th>단계</th><th>저평가 이하</th><th>고평가 이상</th></tr></thead><tbody>{Array.from({ length: Math.max(method.down.length, method.up.length) }, (_, i) => <tr key={i}><th>{i + 1}차</th>{(["down", "up"] as const).map(side => <td key={side} className={state[side][i] === true ? `reached-${side}` : ""}>{method[side][i] === undefined ? "—" : <>{won(method[side][i])}<small>{state[side][i] === true ? "✓ 도달" : state[side][i] === false ? "미도달" : "판정 보류"}</small></>}</td>)}</tr>)}</tbody></table><p>{method.note}</p></div>)}
      <p>재무 기준 {basis.basisDate} · 기준 갱신 {basis.updatedAt.slice(0, 10)}</p>
      <p>화면 시세 기준 비교예요. 과거 도달 이력·알림 발송 여부와 다르며 지연 시세일 수 있어요.</p>
    </div>
  </details>;
}
