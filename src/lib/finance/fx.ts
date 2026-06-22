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
