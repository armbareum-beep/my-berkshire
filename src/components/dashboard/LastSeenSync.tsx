"use client";

import { useEffect, useRef } from "react";

/**
 * 렌더 후(클라이언트 마운트) 현재 손익·평가액을 "지난 접속" 스냅샷 쿠키에 기록.
 * 페이지는 *이전* 스냅샷을 읽어 "지난 접속 이후" 변화를 보여주고, 이 컴포넌트가 다음 비교용으로 갱신한다.
 *
 * ⚠️ 서버 액션이 아니라 fetch 로 Route Handler(`/api/last-seen`)를 친다:
 *    서버 액션은 완료 후 라우트를 자동 revalidate → useEffect 안에서 부르면 새로고침 무한루프.
 *    fetch 는 그 트리거가 없어 1회만 기록하고 끝난다.
 */
export function LastSeenSync({
  profitKrw,
  valueKrw,
}: {
  profitKrw: number;
  valueKrw: number;
}) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return; // 마운트당 1회만(중복 기록 방지)
    done.current = true;
    fetch("/api/last-seen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profit: profitKrw, value: valueKrw }),
      keepalive: true,
    }).catch(() => {});
  }, [profitKrw, valueKrw]);
  return null;
}
