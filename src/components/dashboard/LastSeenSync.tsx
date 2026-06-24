"use client";

import { useEffect } from "react";
import { syncLastSeen } from "@/app/dashboard/actions";

/**
 * 렌더 후(클라이언트 마운트) 현재 손익·평가액을 "지난 접속" 스냅샷 쿠키에 기록.
 * 페이지는 *이전* 스냅샷을 읽어 "지난 접속 이후" 변화를 보여주고, 이 컴포넌트가 다음 비교용으로 갱신한다.
 * (RSC 렌더 중엔 쿠키를 못 쓰므로 서버 액션으로 분리.)
 */
export function LastSeenSync({
  profitKrw,
  valueKrw,
}: {
  profitKrw: number;
  valueKrw: number;
}) {
  useEffect(() => {
    syncLastSeen(profitKrw, valueKrw).catch(() => {});
  }, [profitKrw, valueKrw]);
  return null;
}
