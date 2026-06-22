/**
 * 토스 시세 응답 → 내부 타입 정규화 — 순수함수(단위테스트 대상). 응답값은 문자열.
 */
import type { TossPricesResponse, TossRateResponse, TossCandlesResponse } from "./client";

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface TossQuote {
  price: number;
  currency: string;
}

/** /api/v1/prices 의 result[] → {symbol: {price, currency}}. 전일종가는 토스 미제공. */
export function normalizeTossPrices(
  res: TossPricesResponse,
): Record<string, TossQuote> {
  const out: Record<string, TossQuote> = {};
  for (const row of res.result ?? []) {
    const price = num(row.lastPrice);
    if (price == null || price <= 0) continue;
    out[row.symbol] = { price, currency: row.currency || "KRW" };
  }
  return out;
}

/** /api/v1/exchange-rate 의 result.rate → 환율(숫자). */
export function normalizeTossRate(res: TossRateResponse): number | null {
  const r = num(res.result?.rate);
  return r != null && r > 0 ? r : null;
}

export interface TossBar {
  date: string; // YYYY-MM-DD
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  currency: string;
}

/** /api/v1/candles 의 result.candles[] → 일별 봉(내림차순으로 올 수 있어 호출부에서 정렬). */
export function normalizeTossCandles(res: TossCandlesResponse): TossBar[] {
  const bars: TossBar[] = [];
  for (const c of res.result?.candles ?? []) {
    const close = num(c.closePrice);
    if (close == null) continue;
    const bar: TossBar = { date: c.timestamp.slice(0, 10), close, currency: c.currency || "KRW" };
    const open = num(c.openPrice);
    const high = num(c.highPrice);
    const low = num(c.lowPrice);
    const volume = num(c.volume);
    if (open != null) bar.open = open;
    if (high != null) bar.high = high;
    if (low != null) bar.low = low;
    if (volume != null) bar.volume = volume;
    bars.push(bar);
  }
  return bars;
}
