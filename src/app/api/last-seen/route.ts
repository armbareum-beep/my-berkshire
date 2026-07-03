import { cookies } from "next/headers";
import { todayKST } from "@/lib/date";
import { LAST_SEEN_COOKIE, parseLastSeenCookie } from "@/lib/lastSeen";

/**
 * "지난 접속" 스냅샷 기록 — 손익·평가액(₩)을 쿠키에 저장.
 * 서버 액션이 아니라 Route Handler 로 둔다: 서버 액션은 호출 후 라우트를 자동 revalidate 해서
 * useEffect 안에서 부르면 새로고침 루프가 생긴다. 일반 fetch 는 그 트리거가 없다.
 *
 * 쿠키는 prev(기준점)/latest(오늘 최신) 2단 스냅샷. 오늘 안에서 몇 번을 새로고침해도
 * "지난 접속 이후" 기준점(prev)은 그대로 — 날짜가 바뀐 최초 요청에서만 latest → prev 로 승격한다.
 */
export async function POST(request: Request) {
  let profit = 0;
  let value = 0;
  try {
    const body = await request.json();
    profit = Number(body?.profit);
    value = Number(body?.value);
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!Number.isFinite(profit) || !Number.isFinite(value)) {
    return Response.json({ ok: false }, { status: 400 });
  }

  const store = await cookies();
  const today = todayKST();
  const existing = parseLastSeenCookie(store.get(LAST_SEEN_COOKIE)?.value);
  // 승격 판단: 오늘 이미 기록이 있으면(latest.date===오늘) prev 를 그대로 유지하고,
  // 날짜가 바뀌었으면 어제까지의 latest 를 오늘의 prev 로 승격한다.
  const prev = !existing
    ? null
    : existing.latest.date === today
      ? existing.prev
      : existing.latest;

  store.set(
    LAST_SEEN_COOKIE,
    JSON.stringify({
      prev,
      latest: {
        date: today,
        profit: Math.round(profit),
        value: Math.round(value),
      },
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    },
  );
  return Response.json({ ok: true });
}
