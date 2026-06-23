/**
 * @sheet 병렬 슬롯의 기본값 — null.
 * Next 16에서 모든 병렬 슬롯은 default.js가 필수(없으면 빌드 실패).
 * 하드 내비게이션/새로고침/딥링크 시 @sheet는 여기로 떨어져 시트가 뜨지 않는다(전체 페이지로 열림 → FR-008).
 */
export default function SheetDefault() {
  return null;
}
