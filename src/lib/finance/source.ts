/**
 * 시세·검색 데이터 소스 선택 플래그.
 *
 * 야후(기본) ↔ KIS(한국투자증권) 교체용. UI·인터페이스·반환 shape 는 불변이고,
 * 각 데이터소스 함수(getPrices·getFxToKrw·/api/search 등)가 이 값으로 내부 구현만 분기한다.
 *
 * env `FINANCE_SOURCE` 미설정 시 기존 소스(`yahoo`) — 미완성 단계도 프로덕션 안전.
 */
export type FinanceSource = "yahoo" | "kis" | "toss";

export function financeSource(): FinanceSource {
  const v = process.env.FINANCE_SOURCE;
  return v === "kis" || v === "toss" ? v : "yahoo";
}
