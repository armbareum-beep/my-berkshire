/**
 * 요구수익률 = "난이도" — Capital Allocator PRD v0.3 §3.2, 게이미피케이션 §2.
 *
 * 요구수익률은 이 앱에서 사실상 **난이도 설정**이다. 올리면 통과하는 종목이 줄고,
 * 자본배분은 더 자주 "현금으로 남김"을 권한다. 스스로 게임을 어렵게 만드는 노브다.
 *
 * ## 왜 이게 축하 매트릭스를 통과하는가 (`celebration.ts`)
 *
 * 축하해도 되는 것은 **결정·규율**뿐이고 시장 결과는 절대 아니다. 허들을 정하는 것도,
 * 그 허들을 못 넘겨서 안 사는 것도 100% 통제 가능한 결정이다. 반대로 "허들을 넘겼다"는
 * 사실 자체는 **주가가 내려온 결과**일 수 있으므로 축하 대상이 아니다 — 그래서 이 파일은
 * 난이도를 *표시*만 하고 어떤 축하 신호도 만들지 않는다.
 *
 * ## 우선순위
 *
 * ```text
 * 종목별 er_required_return  >  holdings.required_return  >  DEFAULT_REQUIRED_RETURN(12%)
 * ```
 *
 * 종목별 값이 늘 이긴다 — "이 기업만은 20% 아니면 안 산다"가 전사 기본값에 덮이면 안 된다.
 */
import { DEFAULT_REQUIRED_RETURN } from "./finance/expectedReturn";

export interface HurdleLevel {
  key: "lenient" | "standard" | "strict";
  /** 요구수익률(소수). */
  rate: number;
  label: string;
  /** 이 난이도가 무엇을 뜻하는지 — 숫자를 과장하지 않고 결과만 담백하게. */
  note: string;
}

/**
 * 난이도 프리셋. 표준(12%)이 PRD 기본값이고, 양옆은 ±4%p.
 *
 * 프리셋 밖의 값도 허용한다(직접 입력) — 프리셋은 출발점이지 울타리가 아니다.
 */
export const HURDLE_LEVELS: HurdleLevel[] = [
  {
    key: "lenient",
    rate: 0.08,
    label: "관대",
    note: "웬만하면 통과 — 현금을 오래 들고 있기 싫을 때",
  },
  {
    key: "standard",
    rate: DEFAULT_REQUIRED_RETURN,
    label: "표준",
    note: "기본값. 연 12%를 못 넘기면 사지 않습니다",
  },
  {
    key: "strict",
    rate: 0.15,
    label: "엄격",
    note: "거의 안 삽니다 — 기회가 없으면 현금이 정답이라는 쪽",
  },
];

/** 전사 기본 요구수익률. 안 정했으면 코드 기본값(12%). */
export function houseHurdle(holdingRequiredReturn: number | null | undefined): number {
  const r = holdingRequiredReturn;
  return r != null && Number.isFinite(r) && r > 0 && r <= 1 ? r : DEFAULT_REQUIRED_RETURN;
}

/**
 * 한 종목에 실제로 적용되는 요구수익률.
 * 종목별 값 → 전사 기본값 → 코드 기본값 순으로 내려간다.
 */
export function effectiveHurdle(
  symbolRequiredReturn: number | null | undefined,
  holdingRequiredReturn: number | null | undefined,
): number {
  const s = symbolRequiredReturn;
  if (s != null && Number.isFinite(s) && s > 0 && s <= 1) return s;
  return houseHurdle(holdingRequiredReturn);
}

/** 이 값과 일치하는 프리셋. 직접 입력한 값이면 null. */
export function levelOf(rate: number): HurdleLevel | null {
  return HURDLE_LEVELS.find((l) => Math.abs(l.rate - rate) < 1e-9) ?? null;
}
