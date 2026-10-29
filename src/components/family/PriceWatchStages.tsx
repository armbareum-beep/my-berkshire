import { useEffect, useState } from "react";
import type { Portfolio } from "@/lib/family/model";
import { priceWatchEntries, readPriceWatchConnection, watchConditionStates, watchQuoteSymbol, type NativeQuote, type PriceWatchInstrument } from "@/lib/family/valuation-alerts";

const names = { hit: "도달", waiting: "미도달", pending: "검증 대기", unjudged: "판정 보류" };
const amount = (value: number, currency: string) => `${currency} ${value.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}`;
const timestamp = (value: number) => Number.isFinite(value) && value > 0 && value < 8.64e12 ? new Date(value * 1000).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " KST" : "시세 시각 확인 필요";

/** Each condition retains its own id/label/direction. Never turn independent A/B into stages. */
export default function PriceWatchStages({ instrument, title, quote }: { instrument: PriceWatchInstrument; title: string; quote?: NativeQuote }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const { conditions, reason } = watchConditionStates(instrument, quote, now);
  return <details className="valuation-alert price-watch">
    <summary aria-label={`${instrument.symbol} 가격 감시 조건과 기준가격 보기`}>
      <span className="watch-heading">{instrument.symbol} · {instrument.exchange} · {instrument.currency}/주</span>
      {!conditions.length && <span className="watch-condition pending">기준 설정 검증 대기</span>}
      {conditions.map(({ condition: c, state }) => <span key={c.id} className={`watch-condition ${state}`} aria-label={`${c.label} ${names[state]}`}><span>{c.label}</span><b>{state === "hit" ? "✓ " : ""}{names[state]}</b></span>)}
      <span className="alert-expand">조건·기준가격 보기</span>
    </summary>
    <div className="alert-detail">
      <p>{title}</p>
      <p>{quote ? `수신 시세 ${amount(quote.price, quote.currency)}/주 · ${quote.exchange || "시장 미확인"} · ${quote.symbol || "종목 미확인"}` : "시세 없음"}</p>
      <p>{quote ? timestamp(quote.marketTime) : "시세 시각 확인 필요"}</p>
      {reason && <p className="alert-pending">{reason} · 판정 보류</p>}
      {conditions.map(({ condition: c, state }) => <div className="watch-detail" key={c.id}><p><strong>{c.label}</strong> · {c.value === null ? "검증 대기" : `${amount(c.value, instrument.currency)}/주 ${c.direction === "lte" ? "이하" : "이상"}`} · {names[state]}</p>{c.note && <p>{c.note}</p>}</div>)}
      <p>재무 기준 {instrument.basisDate || "검증 대기"} · 기준 갱신 {instrument.updatedAt}</p>
      <p>{instrument.note}</p>
      <p>화면의 원시 주당 시세 비교예요. 20분 초과·시각 누락·통화·상장시장·주식단위 불일치는 판정 보류예요. 과거 도달 이력·예약 알림 발송 여부와 다르며 지연 시세일 수 있어요.</p>
    </div>
  </details>;
}

const countryGroup = (exchange: string) => exchange === "KRX" ? 0 : ["SSE", "SZSE", "HKEX"].includes(exchange) ? 1 : ["NYSE", "NASDAQ", "NYSEAMERICAN"].includes(exchange) ? 2 : 4;
/** All task-owned keys remain visible, including malformed/pending connections. */
export function PriceWatchConnections({ input }: { input: unknown }) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const entries = Object.entries(input);
  if (!entries.length) return null;
  return <details className="watch-connections"><summary>가격 감시 연결 {entries.length}개</summary><ul>{entries.map(([taskId, value]) => {
    const connection = readPriceWatchConnection(value);
    if (!connection) return <li key={taskId}>연결 형식 확인 필요<small>{taskId}</small></li>;
    const pending = connection.instruments.filter(i => i.status === "pending" || !i.conditions.length || i.conditions.some(c => c.value === null)).length;
    return <li key={taskId}><strong>{connection.title}</strong><span>{connection.instruments.length}종목 · {pending ? `${pending}종목 검증 대기` : "기준 연결 완료"}</span><small>예약 {taskId}</small></li>;
  })}</ul></details>;
}
/** A watch is not a holding. Keep unheld instruments separate from all financial totals. */
export function UnheldPriceWatches({ data, group }: { data: Portfolio; group: number }) {
  const held = new Set(data.holdings.map(h => h.code));
  const entries = priceWatchEntries(data.priceWatchConnections).filter(({ instrument: i }) => countryGroup(i.exchange) === group && !held.has(i.symbol) && !held.has(watchQuoteSymbol(i)));
  if (!entries.length) return null;
  return <section className="unheld-watches" aria-label="미보유 가격 감시"><p>가격 감시 · 미보유 <small>배분·잔고 합계에서 제외</small></p>{entries.map(({ taskId, title, instrument }) => <PriceWatchStages key={`${taskId}:${instrument.exchange}:${instrument.symbol}`} title={title} instrument={instrument} quote={data.rawQuotes?.[watchQuoteSymbol(instrument)]} />)}</section>;
}
