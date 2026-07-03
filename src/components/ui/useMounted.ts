import { useSyncExternalStore } from "react";

// 하이드레이션 완료 여부 — 포털은 서버 렌더 불가라 클라이언트 확정 후에만 그린다.
const emptySubscribe = () => () => {};

export function useMounted(): boolean {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}
