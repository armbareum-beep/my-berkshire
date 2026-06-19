/**
 * 자산추이 재구성 — 일별 평가액 + 투입원금 시계열.
 *
 * returns.ts 의 현재 평가액 모델과 **정확히 일치**:
 *   평가액(d) = Σ(보유수량≤d × 그날 ₩종가) + 설립자본 + 현금잔고(≤d)
 *   투입원금(d) = 설립자본 + 증자(≤d) − 인출(≤d)
 *   누적손익(d) = 평가액(d) − 투입원금(d)   (두 선 사이 쐐기)
 *
 * 종가는 ₩ 환산 일별 시계열(prices.getDailyKrwCloses). 거래일이 아닌 날(주말 등)은
 * 직전 거래일 종가(closeOnOrBefore)로 평탄 유지. 순수함수 — 화면은 호출만.
 */

import type { InvestmentEvent } from "./valuation";
import type { DailyBar } from "./prices";

export interface ValuePoint {
  date: string; // YYYY-MM-DD
  value: number; // ₩ 평가액
  invested: number; // ₩ 투입원금(순)
}

export interface HoldingSeed {
  foundedAt: string;
  initialValuation: number;
}

/** date 이하 가장 가까운 거래일 종가. 시작 이전이면 첫 종가, 시계열 없으면 null. */
export function closeOnOrBefore(bars: DailyBar[], date: string): number | null {
  if (!bars.length) return null;
  let chosen: number | null = null;
  for (const b of bars) {
    if (b.date <= date) chosen = b.close;
    else break;
  }
  // 시작 이전(보유 시작 전엔 어차피 수량 0이라 영향 없음) → 첫 종가로 폴백.
  return chosen ?? bars[0].close;
}

/** foundedAt~today 달력일 enumerate(UTC). maxPoints 로 균등 다운샘플(끝점 today 항상 포함). */
export function dateAxis(
  foundedAt: string,
  today: string,
  maxPoints = 120,
): string[] {
  const start = Date.parse(`${foundedAt}T00:00:00Z`);
  const end = Date.parse(`${today}T00:00:00Z`);
  if (!(end >= start)) return [today];
  const totalDays = Math.round((end - start) / 86400000);
  const all: string[] = [];
  for (let i = 0; i <= totalDays; i++)
    all.push(new Date(start + i * 86400000).toISOString().slice(0, 10));
  if (all.length <= maxPoints) return all;
  // 균등 stride 다운샘플 + 마지막(today) 보장.
  const stride = (all.length - 1) / (maxPoints - 1);
  const out: string[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(all[Math.round(i * stride)]);
  out[out.length - 1] = all[all.length - 1];
  return out;
}

/** 특정 날짜 d 시점의 평가액·투입원금(≤d 이벤트로 재구성). returns.ts 모델과 동일. */
export function pointAt(
  holding: HoldingSeed,
  events: InvestmentEvent[],
  series: Record<string, DailyBar[]>,
  d: string,
): ValuePoint {
  const upto = events.filter((e) => e.date <= d);

  // 보유 평가액
  const nets: Record<string, number> = {};
  for (const e of upto) {
    if ((e.type === "BUY" || e.type === "SELL") && e.symbol && e.quantity) {
      nets[e.symbol] =
        (nets[e.symbol] ?? 0) + (e.type === "BUY" ? e.quantity : -e.quantity);
    }
  }
  let posValue = 0;
  for (const [sym, qty] of Object.entries(nets)) {
    if (qty === 0) continue;
    const close = series[sym] ? closeOnOrBefore(series[sym], d) : null;
    if (close != null) posValue += qty * close;
  }

  // 현금잔고(returns.ts 와 동일 정의)
  let deposits = 0,
    withdrawals = 0,
    dividends = 0,
    sell = 0,
    buy = 0,
    fees = 0;
  for (const e of upto) {
    fees += e.feeAndTax;
    if (e.type === "DEPOSIT") deposits += e.priceOrAmount;
    else if (e.type === "WITHDRAWAL") withdrawals += e.priceOrAmount;
    else if (e.type === "DIVIDEND") dividends += e.priceOrAmount;
    else if (e.type === "SELL" && e.quantity) sell += e.quantity * e.priceOrAmount;
    else if (e.type === "BUY" && e.quantity) buy += e.quantity * e.priceOrAmount;
  }
  const cash = deposits - withdrawals + dividends + sell - buy - fees;

  return {
    date: d,
    value: posValue + holding.initialValuation + cash,
    invested: holding.initialValuation + deposits - withdrawals,
  };
}

/**
 * 일별 평가액·투입원금 시계열.
 * @param series 종목코드 → ₩ 일별 종가(오름차순).
 * @param maxPoints 렌더 포인트 상한(기본 120) — 균등 다운샘플.
 */
export function buildValueSeries(
  holding: HoldingSeed,
  events: InvestmentEvent[],
  series: Record<string, DailyBar[]>,
  today: string,
  maxPoints = 120,
): ValuePoint[] {
  return dateAxis(holding.foundedAt, today, maxPoints).map((d) =>
    pointAt(holding, events, series, d),
  );
}
