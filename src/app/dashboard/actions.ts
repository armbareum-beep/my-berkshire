"use server";

import { cookies } from "next/headers";
import { todayKST } from "@/lib/date";
import { LAST_SEEN_COOKIE } from "@/lib/lastSeen";

/** 마지막 방문 스냅샷(누적손익·투자평가액, ₩) 저장 — "지난 접속 이후" 비교 기준. */
export async function syncLastSeen(
  profitKrw: number,
  valueKrw: number,
): Promise<void> {
  const store = await cookies();
  store.set(
    LAST_SEEN_COOKIE,
    JSON.stringify({
      date: todayKST(),
      profit: Math.round(profitKrw),
      value: Math.round(valueKrw),
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    },
  );
}
