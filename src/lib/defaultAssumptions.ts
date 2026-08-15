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

/** 과거 성장률을 못 재는 종목에 쓰는 성장률. */
export const DEFAULT_GROWTH = 0.1;

/**
 * 과거 성장률을 그대로 미래로 밀 때의 **상한·하한**.
 *
 * 사용자 제안: *"그건 과거 5년 평균성장률로 지정할까?"* 방향은 맞다 — 종목마다 다른 값이
 * 나와야 순위가 갈린다. 그런데 이 앱의 실제 데이터로 재보면 그대로 쓰는 건 위험하다:
 *
 * ```text
 *   삼성전자   +11.7%   정상
 *   BGF리테일   +9.7%   정상
 *   SK하이닉스 +54.5%   2023년 −13,242원 적자(사이클 바닥에서 쟀다)
 *   휴젤       +31.2%
 *   NAVER      +17.9%   2021년 EPS 110,367원(라인 합병 일회성)
 * ```
 *
 * 하이닉스를 54% 로 5년 돌리면 이익이 **8.8배**가 된다. 과거 CAGR 은 시작·끝 두 점만
 * 보므로 사이클 바닥에서 재면 이렇게 튄다 — 그걸 그대로 미래 가정으로 쓰면 앱이
 * 사용자 대신 낙관을 만들어내는 셈이다.
 *
 * 그래서 **자르되 자른 사실을 말한다.** 원래 값도 같이 돌려주므로 화면이 "과거는 54.5%
 * 였고 15% 로 잘랐다"고 적을 수 있다. 조용히 자르면 그것도 거짓말이다.
 *
 * 상한 15% 는 기본 요구수익률(12%)보다 조금 위다 — 이보다 높게 두면 기본값만으로 모든
 * 종목이 허들을 넘겨 "다 사도 된다"가 된다.
 */
export const GROWTH_CAP = 0.15;
/** 하한 0% — 과거가 역성장이어도 **줄어든다고 앱이 단정하지는 않는다**(그건 판단이다). */
export const GROWTH_FLOOR = 0;

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

export interface HistoricalGrowth {
  /** 실제로 쓸 성장률(잘린 뒤). */
  growth: number;
  /** 자르기 전 값 — 화면이 "원래는 얼마였다"를 말할 수 있게. */
  raw: number;
  /** 잰 구간. */
  fromYear: number;
  toYear: number;
  /** 몇 해에 걸쳐 쟀나(= toYear − fromYear). */
  span: number;
  /** 상·하한에 걸렸나. */
  clamped: boolean;
}

/** 과거 성장률을 **못 쓰는** 이유. 화면이 그대로 말한다. */
export type GrowthGap =
  | "short" // 연도가 모자라다(2년 이상 걸쳐야 잰다)
  | "loss" // 구간 안에 적자 연도가 있다
  | "negative"; // 역성장 — 자르면 0%가 되는데 그건 측정이 아니라 가정이다

/**
 * 과거 이익 성장률(CAGR). 못 재면 이유를 돌려준다.
 *
 * ## 적자 연도가 하나라도 있으면 안 쓴다
 *
 * 시작점이 음수면 `(끝÷시작)^(1/n)` 자체가 뜻이 없고, 중간에 적자가 있으면 그건 **성장이
 * 아니라 사이클**이다. 두 점만 보는 CAGR 로는 그 사실이 지워진다 — SK하이닉스가 2023년
 * 적자를 지나고도 +54.5% 로 보이는 게 정확히 그 경우다. 이런 종목은 사람이 판단해야
 * 하므로 기본값(10%)으로 두고 **왜 못 썼는지 말한다.**
 *
 * 최근 `window` 해만 본다(기본 6개 = 5년 구간). 캐시가 그보다 짧으면 있는 만큼 쓰되
 * 2년 이상은 걸쳐야 한다 — 한 해 차이로 낸 CAGR 은 그냥 작년 증감률이다.
 */
export function historicalGrowth(
  series: { year: number; eps: number }[],
  window = 6,
): { ok: true; value: HistoricalGrowth } | { ok: false; reason: GrowthGap } {
  const recent = [...series].sort((a, b) => a.year - b.year).slice(-window);
  if (recent.length < 3) return { ok: false, reason: "short" };

  const first = recent[0];
  const last = recent[recent.length - 1];
  const span = last.year - first.year;
  if (span < 2) return { ok: false, reason: "short" };

  // 구간 안 어디든 적자면 못 쓴다 — 끝점만 멀쩡해도 마찬가지다.
  if (recent.some((p) => p.eps <= 0)) return { ok: false, reason: "loss" };

  const raw = Math.pow(last.eps / first.eps, 1 / span) - 1;
  if (!Number.isFinite(raw)) return { ok: false, reason: "loss" };
  // 역성장은 0%로 자르는 대신 아예 안 쓴다. 0%는 "안 큰다"는 **판단**이지 관측이 아니다.
  if (raw < GROWTH_FLOOR) return { ok: false, reason: "negative" };

  const growth = Math.min(raw, GROWTH_CAP);
  return {
    ok: true,
    value: {
      growth,
      raw,
      fromYear: first.year,
      toYear: last.year,
      span,
      clamped: growth !== raw,
    },
  };
}
