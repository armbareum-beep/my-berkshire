/**
 * 기대수익률 가정의 **출발점** — 종목마다 넣는 대신 한 번에 깔아준다.
 *
 * ## 왜 필요한가
 *
 * 가정이 없으면 그 종목은 기대수익률 순위에서 빠지고 목표 미달로만 판단된다. 그런데
 * 가정은 종목당 세 값(이익력·성장률·종료배수)이라 열 종목이면 서른 번을 넣어야 한다 —
 * 사용자 지적: *"주식에 일일이 넣기 힘드니까 일단 통일해줘."*
 *
 * ## 종료배수 = **현재 PER** 의 뜻
 *
 * 이건 "지금 시장이 매기는 배수가 그대로 유지된다"는 가정이다. 그러면 식이 통째로
 * 상쇄된다:
 *
 * ```text
 *   현재가   = EPS × PER
 *   미래가격 = EPS × (1+g)^Y × PER
 *   기대CAGR = (미래가격 ÷ 현재가)^(1/Y) − 1 = g
 * ```
 *
 * **기대수익률이 정확히 성장률과 같아진다.** 그래서 이 기본값을 깔면 전 종목이 10% 로
 * 똑같아지고, 순위는 안 갈린다. 그건 결함이 아니라 이 기본값의 정의다 — *"배수는 모르니
 * 그대로 둔다, 이익만 10% 씩 큰다"* 는 중립 출발점이고, 종목마다 성장률을 고치는 순간
 * 순위가 갈리기 시작한다. 화면이 그 사실을 같이 말해야 한다(안 그러면 균일한 순위를
 * 의미 있는 판단으로 오해한다).
 *
 * ## 배수를 안 건드리는 이유
 *
 * "PER 15 가 적정" 같은 값을 코드가 정할 수는 없다 — 그건 사람의 판단이고, 앱이 정하면
 * *"내 가정으로는 X"* 가 아니라 *"적정가 X"* 가 된다(`finance/expectedReturn.ts` 머리말).
 * 현재 PER 는 **판단이 아니라 관측값**이라 기본값으로 쓸 수 있다.
 */

/** 기본 성장률 — 향후 N년 이익 CAGR. */
export const DEFAULT_GROWTH = 0.1;

export interface DefaultAssumption {
  /** 향후 N년 이익 CAGR(소수). */
  expectedGrowth: number;
  /** 종료 시점 배수 = 지금 PER. */
  terminalMultiple: number;
}

/**
 * 이 종목의 기본 가정. 못 만들면 null.
 *
 * `price` 와 `eps` 는 **같은 통화**여야 한다. 이 앱의 캐시는 둘 다 ₩ 라 그대로 나눈다
 * (`finance/cachedEps.ts` — 미국 공시도 ₩ 로 환산해 들어온다). PER 는 비율이라 통화만
 * 맞으면 환율과 무관하다.
 *
 * 적자·0 이익은 애초에 캐시에 안 담기지만(`loadCachedEps`), 여기서도 막는다 — 음수 PER
 * 는 "배수가 유지된다"는 말 자체가 성립하지 않는다.
 */
export function defaultAssumptionFor(
  price: number,
  eps: number,
  growth: number = DEFAULT_GROWTH,
): DefaultAssumption | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(eps) || eps <= 0) return null;
  const per = price / eps;
  if (!Number.isFinite(per) || per <= 0) return null;
  return { expectedGrowth: growth, terminalMultiple: per };
}

/**
 * 이 종목에 기본값을 **깔아도 되는가** — 사용자가 이미 정한 값은 건드리지 않는다.
 *
 * 자산유형 제안(`lib/assetClass.ts`)과 같은 원칙이다: 기본값이 사람의 판단을 덮으면
 * 안 된다. 성장률·종료배수 **둘 다 비어 있을 때만** 채운다 — 하나만 넣어둔 사람은
 * 나머지를 일부러 비워둔 것일 수 있고, 반쯤 채워 넣으면 그 사람이 넣은 값과 앱이 넣은
 * 값이 한 종목 안에 섞인다.
 */
export function needsDefault(a: {
  expectedGrowth: number | null;
  terminalMultiple: number | null;
}): boolean {
  return a.expectedGrowth == null && a.terminalMultiple == null;
}
