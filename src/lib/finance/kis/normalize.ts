/**
 * KIS 시세 응답 → 내부 타입 정규화 — 순수함수(네트워크·DB 무관, 단위테스트 대상).
 * 필드: 국내 inquire-price(stck_prpr/stck_sdpr), 해외 price(last/base),
 *       해외 price-detail(t_rate). KIS 응답값은 모두 문자열.
 */

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface KisPriceQuote {
  price: number;
  prevClose: number | null;
  currency: string;
  instrumentType: string;
}

/** 국내 현재가(inquire-price, tr_id FHKST01010100)의 output. */
export function normalizeDomesticPrice(
  output: Record<string, string> | undefined,
): KisPriceQuote | null {
  const price = num(output?.stck_prpr);
  if (price == null || price <= 0) return null;
  return { price, prevClose: num(output?.stck_sdpr), currency: "KRW", instrumentType: "EQUITY" };
}

/** 해외 현재가(price, tr_id HHDFS00000300)의 output. last=0 은 잘못된 거래소 → null(다음 후보). */
export function normalizeOverseasPrice(
  output: Record<string, string> | undefined,
): KisPriceQuote | null {
  const price = num(output?.last);
  if (price == null || price <= 0) return null;
  return { price, prevClose: num(output?.base), currency: "USD", instrumentType: "EQUITY" };
}

/** 해외 현재가상세(price-detail, tr_id HHDFS76200200)의 output.t_rate = 원/외화 환율. */
export function normalizeTRate(output: Record<string, string> | undefined): number | null {
  const r = num(output?.t_rate);
  return r != null && r > 0 ? r : null;
}
