/**
 * @sheet 슬롯의 catch-all — null.
 * 병렬 라우트는 현재 URL과 매칭 안 되는 슬롯의 직전 활성 상태를 소프트 내비게이션 후에도 유지한다.
 * 시트가 열린 채 인터셉터가 없는 라우트(작업형: /transactions·/rebalance·/import·/accounts 등)로
 * 이동하면 시트가 남는 버그가 생기는데, 이 catch-all이 null을 매칭시켜 시트를 닫는다(US3).
 */
export default function SheetCatchAll() {
  return null;
}
