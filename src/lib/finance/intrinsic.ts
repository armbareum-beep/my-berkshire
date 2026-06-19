/**
 * §12 가치평가 — 내재가치·안전마진.
 *
 * 핵심 원칙: 이건 **사실(fact)이 아니라 규칙 렌즈(lens)**다. 오너이익·할인율·성장 가정이
 * 다 주관이므로, 화면엔 항상 가정을 노출한다("진짜 가치 X" 금지, "내 규칙으로 계산하면 X").
 *
 * 공식(사용자 §12):
 *   내재가치 = 오너이익 / (할인율 − 성장률)   [표준 Gordon Growth Model]
 *     · 할인율 = max(미국채10년물 × 2, 8%)
 *     · 성장률 g 기본 0%(무성장=가장 보수적). g=0 이면 오너이익/할인율 로 환원.
 *     · g 는 할인율보다 낮아야(g≥r → 분모≤0 폭발) → g≥r 이면 평가 불가(null).
 *   안전마진 = 내재가치 − 시가총액   (+면 규칙상 할인=쌈)
 *   시장가정성장률(implied growth) = 할인율 − 오너이익수익률  (성장투자자용 중립 렌즈)
 *
 * ×2 = 버핏式(위험프리미엄+안전마진을 할인율에). floor 8% = 저금리서 분모 과소→내재가치
 * 폭발 방지(환원율 바닥). 성장 0% 가정(거짓정밀 회피 — staged DCF 를 성장0으로 붕괴).
 */

/** 환원율 바닥 — 저금리 극단에서 내재가치 폭발 방지. */
export const DISCOUNT_FLOOR = 0.08;
/** 버핏式 금리 배수(위험프리미엄·안전마진을 할인율에 흡수). */
export const RATE_MULTIPLE = 2;

export interface IntrinsicValuation {
  discountRate: number; // 적용 할인율(소수)
  rateFloored: boolean; // 바닥(8%)이 적용됐는지
  customRate: boolean; // 사용자가 직접 입력한 할인율인지(기본 규칙 무시)
  growth: number; // 적용 성장률(소수, 기본 0)
  intrinsicValue: number; // 내재가치(₩)
  marketCap: number; // 시가총액(₩)
  marginOfSafety: number; // 안전마진 = 내재가치 − 시총(₩)
  marginPct: number; // 안전마진율 = 안전마진 / 내재가치
  impliedGrowth: number; // 시장이 가정한 성장률(중립 표시)
}

/** 할인율 = max(10년물 × 2, 8%). */
export function discountRate(tenYear: number): {
  rate: number;
  floored: boolean;
} {
  const raw = tenYear * RATE_MULTIPLE;
  return raw < DISCOUNT_FLOOR
    ? { rate: DISCOUNT_FLOOR, floored: true }
    : { rate: raw, floored: false };
}

/**
 * 내재가치·안전마진 계산. ownerEarnings·marketCap 은 같은 통화(₩) 기준.
 * ownerEarnings ≤ 0 이거나 시총 ≤ 0 이면 이 모델로 평가 불가(null) — 적자/오너이익 음수.
 *
 * overrideRate(소수) 주면 기본 규칙(10년물×2, floor 8%) 대신 그 할인율을 쓴다(사용자 가정).
 * overrideRate 가 있으면 tenYear 는 무시되므로 0 을 넘겨도 된다.
 * growth(소수, 기본 0) = 고든 성장률. g≥할인율 이면 분모≤0 → 평가 불가(null).
 */
export function computeIntrinsic(
  ownerEarnings: number,
  marketCap: number,
  tenYear: number,
  overrideRate?: number | null,
  growth?: number | null,
): IntrinsicValuation | null {
  if (!(ownerEarnings > 0) || !(marketCap > 0)) return null;
  const customRate = overrideRate != null && overrideRate > 0;
  const auto = discountRate(tenYear);
  const rate = customRate ? overrideRate : auto.rate;
  const floored = customRate ? false : auto.floored;
  const g = growth != null && growth > 0 ? growth : 0;
  const denom = rate - g; // 고든: 오너이익/(r−g)
  if (denom <= 0) return null; // g≥r → 폭발(평가 불가)
  const intrinsicValue = ownerEarnings / denom;
  const marginOfSafety = intrinsicValue - marketCap;
  const marginPct = marginOfSafety / intrinsicValue;
  // 시장가가 정당화되려면 필요한 성장률 = 할인율 − 오너이익수익률(오너이익/시총).
  const impliedGrowth = rate - ownerEarnings / marketCap;
  return {
    discountRate: rate,
    rateFloored: floored,
    customRate,
    growth: g,
    intrinsicValue,
    marketCap,
    marginOfSafety,
    marginPct,
    impliedGrowth,
  };
}
