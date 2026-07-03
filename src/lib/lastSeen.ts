/** "지난 접속" 스냅샷 쿠키 이름. (server action 파일은 async export만 허용 → 상수는 여기로 분리.) */
export const LAST_SEEN_COOKIE = "last_seen";

/** 한 시점의 손익·평가액(₩) 스냅샷. */
export type LastSeenSnapshot = { date: string; profit: number; value: number };

/**
 * 쿠키에 저장되는 2단 스냅샷 — prev(기준점)·latest(가장 최근 기록).
 * "지난 접속 이후" 숫자의 기준점이 같은 날 새로고침마다 흔들리지 않으려면, 오늘 안에서는
 * prev를 그대로 두고 latest만 갱신해야 한다 — 날짜가 바뀔 때만 latest → prev로 승격
 * (승격 판단은 route.ts POST 핸들러가 수행, 여긴 스키마와 기준점 선택만 담당).
 * 레거시 쿠키(2단 이전의 평면형 {date,profit,value})는 { prev: null, latest: 그 값 }으로 취급.
 */
export type LastSeenCookie = {
  prev: LastSeenSnapshot | null;
  latest: LastSeenSnapshot;
};

function isSnapshot(o: unknown): o is LastSeenSnapshot {
  const r = o as Record<string, unknown> | null;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.date === "string" &&
    typeof r.profit === "number" &&
    typeof r.value === "number"
  );
}

/** 쿠키 원문 파싱 — 레거시 평면형은 정규화, 손상/형식 불일치는 null(다음 방문에 새로 기록). */
export function parseLastSeenCookie(
  raw: string | undefined,
): LastSeenCookie | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (isSnapshot(o)) return { prev: null, latest: o };
    if (
      o &&
      typeof o === "object" &&
      isSnapshot(o.latest) &&
      (o.prev === null || isSnapshot(o.prev))
    ) {
      return { prev: o.prev ?? null, latest: o.latest };
    }
  } catch {
    // 손상된 쿠키 — 무시.
  }
  return null;
}

/**
 * "지난 접속 이후" 비교의 기준점 선택.
 * - latest.date !== today: 날짜가 바뀐 뒤 아직 승격 전 렌더 → latest가 곧 이전 접속일의 마지막 기록.
 * - latest.date === today: 오늘 재방문 → prev가 하루 종일 고정되는 기준점(없으면 null).
 */
export function pickBaseline(
  parsed: LastSeenCookie | null,
  today: string,
): LastSeenSnapshot | null {
  if (!parsed) return null;
  return parsed.latest.date !== today ? parsed.latest : parsed.prev;
}
