/**
 * 기대수익률 — Capital Allocator PRD v0.3 §4·§5.
 *
 * "고정된 적정주가를 저장하지 않는다. 실적이 바뀌면 매수가도 자동으로 바뀐다."
 *
 * ```text
 * 미래가격  = 현재이익력 × (1 + 성장률)^Y × 종료배수
 * 매수가    = 미래가격 ÷ (1 + 요구수익률)^Y
 * 기대CAGR  = (미래가격 ÷ 현재가)^(1/Y) − 1
 * ```
 *
 * ⚠️ 이건 **사실이 아니라 규칙 렌즈**다. 성장률·종료배수·요구수익률이 전부 사용자 가정이므로
 * 화면에는 항상 가정을 함께 노출한다("적정가 X" 금지, "내 가정으로는 X").
 *
 * ## `intrinsic.ts` 와의 관계 — 다른 모형이다
 *
 * | | `intrinsic.ts` | 이 파일 |
 * |---|---|---|
 * | 모형 | 고든 성장(영구) | 기간 종료 배수 |
 * | 식 | 오너이익 / (r − g) | EPS × (1+g)^Y × PER ÷ (1+r)^Y |
 * | 기간 | 없음(영구) | Y년 |
 * | 성장률 의미 | **영구** 성장률 (g < r 필수) | 향후 Y년 **EPS CAGR** (r 초과 가능) |
 *
 * 성장률의 의미가 달라 `valuation_assumptions.growth_rate`(고든 영구성장률)를
 * 재사용하면 조용히 틀린 값이 나온다. 반드시 별도 필드를 쓴다.
 */

/** 보유기간 기본값 — PRD §3.2. */
export const DEFAULT_HOLDING_YEARS = 5;
/** 요구수익률 기본값 — PRD §3.2. */
export const DEFAULT_REQUIRED_RETURN = 0.12;

/** 기준 지표 — 주당 이익력을 무엇으로 볼지. */
export type BaseMetric = "EPS" | "FCF";

export interface ExpectedReturnInput {
  /** 현재 이익력(주당). EPS 또는 주당 FCF. 종목 통화 기준. */
  currentMetric: number;
  /** 향후 `holdingYears` 동안의 연평균 성장률(소수). 음수 허용. */
  expectedGrowth: number;
  /** 기간 종료 시점의 적정 배수(PER/PFCF). */
  terminalMultiple: number;
  /** 보유기간(년). 기본 5. */
  holdingYears?: number;
  /** 요구수익률(소수). 기본 12%. */
  requiredReturn?: number;
}

export interface ExpectedReturn {
  /** Y년 뒤 예상 주가(종목 통화). */
  futurePrice: number;
  /** 요구수익률을 만족하는 최대 매수가(종목 통화). */
  buyPrice: number;
  /** 현재가로 샀을 때 기대 연평균 수익률(소수). 현재가를 모르면 null. */
  expectedCagr: number | null;
  /** 현재가가 매수가 이하인가. 현재가를 모르면 null. */
  buyable: boolean | null;
  holdingYears: number;
  requiredReturn: number;
}

/**
 * 모델 적용 가능 여부. 적자(이익력 ≤ 0)나 배수·기간이 비정상이면 계산하지 않는다.
 * 억지로 숫자를 만들지 않는 게 이 앱의 방침(가짜 정밀 금지).
 */
function usable(i: ExpectedReturnInput, years: number): boolean {
  return (
    Number.isFinite(i.currentMetric) &&
    i.currentMetric > 0 &&
    Number.isFinite(i.terminalMultiple) &&
    i.terminalMultiple > 0 &&
    Number.isFinite(i.expectedGrowth) &&
    // 성장률이 −100% 이하면 미래이익이 0 이하 → 의미 없음
    i.expectedGrowth > -1 &&
    years > 0
  );
}

/**
 * 기대수익률 계산. 적용 불가면 null.
 * `currentPrice` 를 주면 기대 CAGR·매수가능 여부까지 채운다(종목 통화로 같은 단위여야 한다).
 */
export function computeExpectedReturn(
  input: ExpectedReturnInput,
  currentPrice?: number | null,
): ExpectedReturn | null {
  const holdingYears = input.holdingYears ?? DEFAULT_HOLDING_YEARS;
  const requiredReturn = input.requiredReturn ?? DEFAULT_REQUIRED_RETURN;
  if (!usable(input, holdingYears)) return null;
  if (!(requiredReturn > -1)) return null;

  const futurePrice =
    input.currentMetric *
    Math.pow(1 + input.expectedGrowth, holdingYears) *
    input.terminalMultiple;

  const buyPrice = futurePrice / Math.pow(1 + requiredReturn, holdingYears);

  const priceOk =
    currentPrice != null && Number.isFinite(currentPrice) && currentPrice > 0;
  const expectedCagr = priceOk
    ? Math.pow(futurePrice / currentPrice, 1 / holdingYears) - 1
    : null;

  return {
    futurePrice,
    buyPrice,
    expectedCagr,
    buyable: priceOk ? currentPrice <= buyPrice : null,
    holdingYears,
    requiredReturn,
  };
}

/**
 * 기대수익률 → `planAllocation` 의 `attractiveness` 계수.
 *
 * ```text
 * 기대CAGR < 요구수익률   → 0    (후보에서 제외 — PRD §6.2 "요구수익률 미달")
 * 기대CAGR = 요구수익률   → 1    (중립 — 비중 기반 배분과 동일)
 * 기대CAGR > 요구수익률   → >1   (초과분에 비례해 우선순위 상승)
 * ```
 *
 * 비율(`cagr / required`)로 두면 요구수익률이 낮은 종목이 자동으로 유리해져
 * 종목 간 비교가 왜곡된다. **초과 스프레드 기준**으로 계산해 기준선을 통일한다.
 *
 * `slope` 는 스프레드 1%p 당 가중치 증가폭. 기본 10 이면 +5%p 초과 시 계수 1.5.
 *
 * PRD §6.2 의 "목표비중 초과 시 요구수익률을 12%→15% 로 올린다"는 여기가 아니라
 * `allocate.ts` 가 처리한다 — 매력도(순서)가 아니라 **매수 상한(비중)** 을 움직이는
 * 규칙이라 배분 엔진 쪽이 자리다(`ceilingOf`, `OVERWEIGHT_PREMIUM`).
 */
export function attractivenessFromCagr(
  expectedCagr: number | null,
  requiredReturn: number = DEFAULT_REQUIRED_RETURN,
  slope = 10,
): number {
  // 가정이 없으면 중립 — 비중 기반 배분으로 동작한다(스펙 v1.1 §15.3).
  if (expectedCagr == null || !Number.isFinite(expectedCagr)) return 1;
  const spread = expectedCagr - requiredReturn;
  if (spread < 0) return 0;
  return 1 + spread * slope;
}

/** 화면 표기용 상태 — PRD §10 의 STATUS. */
export type BuyStatus = "BUYABLE" | "WAIT" | "UNAVAILABLE";

export function buyStatus(r: ExpectedReturn | null): BuyStatus {
  if (!r || r.buyable === null) return "UNAVAILABLE";
  return r.buyable ? "BUYABLE" : "WAIT";
}
