/**
 * 환율 — 외국 통화 → 원화(KRW) 환산율. 소스: 야후 파이낸스 `{CCY}KRW=X`(키 불필요).
 * 지주회사 기능통화는 KRW. 외국 주식 가격(네이티브) × 이 환율 = ₩.
 *
 * 토스 등 다른 소스로 교체 시 fetchRate 만 바꾸면 된다.
 */

import { financeSource } from "./source";
import { kisFetch, type KisQuoteResponse } from "./kis/client";
import { normalizeTRate } from "./kis/normalize";
import { tossFetch, type TossRateResponse } from "./toss/client";
import { normalizeTossRate } from "./toss/normalize";

/** KRW 는 1, 그 외는 야후에서 `{CCY}KRW=X` 현재가. 실패한 통화는 맵에서 빠진다. */
async function fetchRate(currency: string): Promise<number | null> {
  if (currency === "KRW") return 1;
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${currency}KRW=X?interval=1d&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 10 } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const rate = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

/** KIS 모드 USD/KRW — 해외 현재가상세(price-detail)의 t_rate. 실패 시 null(야후 폴백용). */
async function kisUsdKrw(): Promise<number | null> {
  try {
    const res = await kisFetch<KisQuoteResponse>(
      "/uapi/overseas-price/v1/quotations/price-detail",
      { trId: "HHDFS76200200", params: { AUTH: "", EXCD: "NAS", SYMB: "AAPL" }, revalidate: 10 },
    );
    return normalizeTRate(res.output);
  } catch {
    return null;
  }
}

/** 토스 환율 — /api/v1/exchange-rate(baseCurrency→KRW). 실패 시 null(야후 폴백용). */
async function tossRate(currency: string): Promise<number | null> {
  try {
    const res = await tossFetch<TossRateResponse>("/api/v1/exchange-rate", {
      params: { baseCurrency: currency, quoteCurrency: "KRW" },
    });
    return normalizeTossRate(res);
  } catch {
    return null;
  }
}

/** 통화→KRW 환율. 토스=전용 환율 엔드포인트, KIS=USD t_rate, 그 외/실패는 야후. */
async function resolveRate(currency: string): Promise<number | null> {
  if (currency === "KRW") return 1;
  const src = financeSource();
  if (src === "toss") {
    const r = await tossRate(currency);
    if (r != null) return r;
  } else if (src === "kis" && currency === "USD") {
    const r = await kisUsdKrw();
    if (r != null) return r;
  }
  return fetchRate(currency); // 야후 폴백
}

/** 일별 환율 봉(종가만). */
export interface FxBar {
  date: string; // YYYY-MM-DD
  close: number;
}

/**
 * 봉 목록에서 **그 날짜 또는 그 이전** 마지막 종가를 고른다.
 *
 * 주말·공휴일엔 봉이 없으므로 "정확히 그 날"을 요구하면 안 된다. 거래일 기준 가장
 * 최근에 형성된 환율이 그날 실제로 쓰인 값에 가장 가깝다.
 * 대상 날짜보다 **이후** 봉은 절대 쓰지 않는다(look-ahead 금지).
 */
export function pickRateOnOrBefore(bars: FxBar[], date: string): number | null {
  let best: FxBar | null = null;
  for (const b of bars) {
    if (b.date > date) continue;
    if (!best || b.date > best.date) best = b;
  }
  return best && best.close > 0 ? best.close : null;
}

/**
 * `{CCY}KRW` 일봉 시계열. 실패하면 빈 배열.
 *
 * 연휴·장기 휴장 대비 시작일 앞으로 14일 여유를 둔다 — 그래야 `pickRateOnOrBefore`
 * 가 첫 거래일에도 직전 종가를 찾을 수 있다.
 *
 * `prices.ts` 의 `fetchCloseSeries` 와 파싱이 같지만 재사용하지 않는다 —
 * prices.ts 가 이 파일(fx.ts)을 import 하므로 반대 방향은 순환이 된다.
 *
 * @param from 시작 YYYY-MM-DD
 * @param to   종료 YYYY-MM-DD(생략 시 from)
 */
export async function getFxBars(
  currency: string,
  from: string,
  to: string = from,
): Promise<FxBar[]> {
  if (currency === "KRW") return [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const p1 = Math.floor(start / 1000) - 14 * 86400;
  const p2 = Math.floor(end / 1000) + 86400;
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${currency}KRW=X?period1=${p1}&period2=${p2}&interval=1d`,
      // 과거 환율은 확정값이라 오래 캐시해도 안전하다.
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 86400 } },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const ts: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const bars: FxBar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (typeof c !== "number" || !(c > 0)) continue; // 결측·휴장 봉은 건너뜀
      bars.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c });
    }
    return bars;
  } catch {
    return [];
  }
}

/**
 * **거래일 기준** 통화→KRW 환율 맵.
 *
 * 소급 입력(과거 거래를 지금 기록)에서 오늘 환율을 쓰면 원가가 그만큼 어긋난다.
 * 미래·오늘 날짜면 현재 환율이 더 정확하므로 그대로 `getFxToKrw` 를 쓴다.
 *
 * 과거 환율 조회에 실패하면 **현재 환율로 폴백**한다 — 기록 자체를 막지 않는다.
 * (사용자가 적용환율을 직접 넣었다면 호출부에서 그 값이 최종적으로 덮어쓴다.)
 */
export async function getFxToKrwOn(
  currencies: string[],
  date: string,
  today: string,
): Promise<Record<string, number>> {
  if (date >= today) return getFxToKrw(currencies);

  const uniq = [...new Set(currencies)].filter((c) => c !== "KRW");
  const current = await getFxToKrw(currencies); // 폴백용 + KRW:1 확보
  const out: Record<string, number> = { ...current };

  const results = await Promise.allSettled(
    uniq.map((c) =>
      getFxBars(c, date).then((bars) => [c, pickRateOnOrBefore(bars, date)] as const),
    ),
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value[1] != null) out[r.value[0]] = r.value[1];
  }
  return out;
}

/**
 * 통화 목록 → {통화: KRW환산율} 맵. KRW=1.
 * 예: getFxToKrw(["USD","KRW"]) → { USD: 1511.83, KRW: 1 }.
 */
export async function getFxToKrw(
  currencies: string[],
): Promise<Record<string, number>> {
  const uniq = [...new Set(currencies)];
  const out: Record<string, number> = { KRW: 1 };
  const results = await Promise.allSettled(
    uniq.filter((c) => c !== "KRW").map((c) => resolveRate(c).then((r) => [c, r] as const)),
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value[1] != null) out[r.value[0]] = r.value[1];
  }
  return out;
}

/** USD→KRW 단일 환율(표시 토글용). 실패 시 null. */
export async function getUsdKrw(): Promise<number | null> {
  return resolveRate("USD");
}

/** 환율 + 전날대비 변동 정보. */
export interface FxRateInfo {
  rate: number;
  prev: number | null;
  changeAbs: number | null;
  changePct: number | null;
}

/** 야후에서 현재가 + 전일 종가(chartPreviousClose) 함께 취득. */
async function fetchRateInfo(currency: string): Promise<FxRateInfo | null> {
  if (currency === "KRW") return { rate: 1, prev: 1, changeAbs: 0, changePct: 0 };
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${currency}KRW=X?interval=1d&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 10 } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const rate: unknown = meta?.regularMarketPrice;
    const prev: unknown = meta?.chartPreviousClose ?? meta?.previousClose;
    if (typeof rate !== "number" || rate <= 0) return null;
    const changeAbs = typeof prev === "number" ? rate - prev : null;
    const changePct = typeof prev === "number" && prev > 0 ? (rate - prev) / prev : null;
    return { rate, prev: typeof prev === "number" ? prev : null, changeAbs, changePct };
  } catch {
    return null;
  }
}

/**
 * 통화 목록 → 환율 + 전날대비 변동 맵. 표시 전용(항상 야후 소스).
 * 예: getFxRateInfo(["USD"]) → { USD: { rate: 1511, prev: 1508, changeAbs: 3.2, changePct: 0.0021 } }
 */
export async function getFxRateInfo(
  currencies: string[],
): Promise<Record<string, FxRateInfo>> {
  const uniq = [...new Set(currencies)];
  const out: Record<string, FxRateInfo> = { KRW: { rate: 1, prev: 1, changeAbs: 0, changePct: 0 } };
  const results = await Promise.allSettled(
    uniq.filter((c) => c !== "KRW").map((c) => fetchRateInfo(c).then((r) => [c, r] as const)),
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value[1] != null) out[r.value[0]] = r.value[1];
  }
  return out;
}
