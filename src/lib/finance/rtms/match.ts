/**
 * 실거래 매칭 — 순수함수.
 *
 * 등록 시 사용자가 RTMS 응답 원문에서 단지를 선택하므로, 단지명은 정규화 후
 * 완전일치로 매칭한다. 퍼지 매칭은 다른 단지 시세로 평가하는 오매칭 위험이
 * 커서 의도적으로 두지 않는다 — 무매칭이면 기존 평가액 유지가 안전.
 */

import type { RtmsDeal } from "./parse";

/** 전용면적 매칭 허용오차(±10%) — 같은 평형대의 소수점 차이·타입 차이 흡수. */
export const AREA_TOLERANCE = 0.1;

/** 공백 제거 + 소문자화. 예: "래미안 원베일리" ≡ "래미안원베일리". */
export function normalizeComplexName(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

/** 동일 단지(정규화 완전일치) + 전용면적 ±tolerance(경계 포함) 여부. */
export function isComparable(
  deal: RtmsDeal,
  complexName: string,
  area: number,
  tolerance: number = AREA_TOLERANCE,
): boolean {
  if (normalizeComplexName(deal.name) !== normalizeComplexName(complexName)) return false;
  // 1e-9: 부동소수점 오차 흡수(경계 포함 보장) — 면적 단위(㎡)에서 무의미한 크기.
  return Math.abs(deal.area - area) <= area * tolerance + 1e-9;
}

/** 조건 만족 거래 중 계약일 최신 1건. 없으면 null. */
export function latestComparableDeal(
  deals: RtmsDeal[],
  complexName: string,
  area: number,
): RtmsDeal | null {
  let best: RtmsDeal | null = null;
  for (const d of deals) {
    if (!isComparable(d, complexName, area)) continue;
    if (!best || d.date > best.date) best = d;
  }
  return best;
}
