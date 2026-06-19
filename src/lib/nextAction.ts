/**
 * Next Action 엔진 — /docs/user-rails-v1.md 2번.
 * 대시보드 최상단 버튼은 항상 이 함수 결과 1개. 화면들이 각자 판단하지 않는다.
 * 우선순위 1~5를 위에서부터 검사해 처음 맞는 것 하나만 반환.
 */

export interface UserState {
  hasHolding: boolean;
  eventCount: number; // 활성 이벤트 수(삭제·상쇄 제외)
  /** 분기 결산 미확인 여부(CFO 리포트). fast-follow 전까지 항상 false. */
  quarterCloseDue?: boolean;
  /** 마지막 이벤트 후 경과일. 이벤트 없으면 null. */
  daysSinceLastEvent: number | null;
}

export interface NextAction {
  label: string;
  href: string;
}

export function getNextAction(state: UserState): NextAction | null {
  // 1. 설립등기 미완료
  if (!state.hasHolding) {
    return { label: "회사 설립하기", href: "/onboarding" };
  }
  // 2. 등기 완료 & 이벤트 0건
  if (state.eventCount === 0) {
    return { label: "첫 매수 기록하기", href: "/transactions" };
  }
  // 3. 이번 분기 결산 미확인 (fast-follow — v0에선 비활성)
  if (state.quarterCloseDue) {
    return { label: "분기 결산 보기", href: "/transactions" };
  }
  // 4. 마지막 이벤트 후 30일 경과
  if (state.daysSinceLastEvent !== null && state.daysSinceLastEvent >= 30) {
    return { label: "장부 업데이트하기", href: "/transactions" };
  }
  // 5. 평시 — 별도 CTA 없음. 거래는 하단 + 버튼이 담당(중복 제거).
  return null;
}
