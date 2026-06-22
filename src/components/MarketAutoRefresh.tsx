"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 장중에만 주기적으로 서버 데이터를 다시 받아 현재가를 갱신한다(soft refresh).
 * Vercel 서버리스라 실시간 WebSocket 스트리밍은 불가 → 클라이언트 폴링으로 "거의 실시간".
 * 장이 닫혔거나 탭이 백그라운드면 갱신하지 않는다(불필요한 호출 방지).
 */
export function MarketAutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      if (isMarketOpen()) router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}

/** 한국(09:00~15:30) 또는 미국(대략 22:30~05:00 KST) 정규장 여부. 서머타임·휴장일은 무시(근사). */
function isMarketOpen(): boolean {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay();
  if (day === 0 || day === 6) return false; // 주말
  const min = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const krOpen = min >= 9 * 60 && min <= 15 * 60 + 30;
  const usOpen = min >= 22 * 60 + 30 || min <= 5 * 60;
  return krOpen || usOpen;
}
