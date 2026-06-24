import { cookies } from "next/headers";
import { todayKST } from "@/lib/date";
import { LAST_SEEN_COOKIE } from "@/lib/lastSeen";

/**
 * "지난 접속" 스냅샷 기록 — 손익·평가액(₩)을 쿠키에 저장.
 * 서버 액션이 아니라 Route Handler 로 둔다: 서버 액션은 호출 후 라우트를 자동 revalidate 해서
 * useEffect 안에서 부르면 새로고침 루프가 생긴다. 일반 fetch 는 그 트리거가 없다.
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
  store.set(
    LAST_SEEN_COOKIE,
    JSON.stringify({
      date: todayKST(),
      profit: Math.round(profit),
      value: Math.round(value),
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
