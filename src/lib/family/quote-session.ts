/** Provider-supplied UTC session boundaries; no guessed exchange hours or holidays. */
export type RegularSession = { start: number; end: number };
export type SessionQuote = {
  marketTime: number;
  regularSession?: RegularSession;
  regularSessions?: RegularSession[];
  sessionTimeZone?: string;
};
const validSession = (s: unknown): s is RegularSession => {
  if (!s || typeof s !== "object") return false;
  const { start, end } = s as RegularSession;
  return Number.isFinite(start) && Number.isFinite(end) && start > 0 && end > start && end - start <= 86400;
};

/** Intraday charts include recent regular sessions, including shortened sessions. */
export function readQuoteSessions(meta: { currentTradingPeriod?: { regular?: unknown }; tradingPeriods?: unknown; exchangeTimezoneName?: unknown }): Omit<SessionQuote, "marketTime"> {
  const current = meta.currentTradingPeriod?.regular;
  if (!validSession(current)) return {};
  const recent: RegularSession[] = [];
  const visit = (v: unknown, depth = 0) => {
    if (depth > 3) return;
    if (Array.isArray(v)) v.slice(0, 32).forEach(s => visit(s, depth + 1));
    else if (validSession(v)) recent.push({ start: v.start, end: v.end });
  };
  // With pre/post metadata Yahoo uses { regular: [[...]], pre: ..., post: ... }.
  const periods = meta.tradingPeriods;
  visit(periods && !Array.isArray(periods) && typeof periods === "object" ? (periods as { regular?: unknown }).regular : periods);
  const sessions = [...recent, current].filter((s, i, all) => all.findIndex(t => t.start === s.start && t.end === s.end) === i);
  let sessionTimeZone: string | undefined;
  try {
    if (typeof meta.exchangeTimezoneName === "string") {
      new Intl.DateTimeFormat("en", { timeZone: meta.exchangeTimezoneName }).format(0);
      sessionTimeZone = meta.exchangeTimezoneName;
    }
  } catch { /* Missing/invalid timezone cannot establish cross-day session freshness. */ }
  return { regularSession: { start: current.start, end: current.end }, regularSessions: sessions, ...(sessionTimeZone ? { sessionTimeZone } : {}) };
}

/** Screen-only comparison. Reopening immediately restores the 20-minute limit. */
export function quoteTimeBasis(q: SessionQuote | undefined, now = Date.now()): "latest" | "close" | null {
  if (!q || !Number.isFinite(now) || !Number.isFinite(q.marketTime) || q.marketTime <= 0) return null;
  const seconds = now / 1000, age = seconds - q.marketTime;
  if (age < -300) return null;
  if (!validSession(q.regularSession)) return age <= 1200 ? "latest" : null;
  const current = q.regularSession;
  // Re-fetch the schedule as well as the price when it is more than a week old.
  if (seconds - current.end > 7 * 86400 || current.start - seconds > 7 * 86400) return null;
  const sessions = [...(q.regularSessions || []).filter(validSession), current];
  if (sessions.some(s => seconds >= s.start && seconds < s.end)) return age <= 1200 ? "latest" : null;
  // An open screen must not keep Friday's schedule into Monday's new session.
  // On a later weekday require refreshed current/future session metadata.
  if (seconds >= current.end) {
    if (!q.sessionTimeZone) return null;
    try {
      const day = new Intl.DateTimeFormat("en-US", { timeZone: q.sessionTimeZone, dateStyle: "short" });
      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: q.sessionTimeZone, weekday: "short" }).format(now);
      if (day.format(now) !== day.format(current.end * 1000) && !["Sat", "Sun"].includes(weekday)) return null;
    } catch { return null; }
  }
  const last = sessions.filter(s => s.end <= seconds).sort((a, b) => b.end - a.end)[0];
  // A delayed intraday trade must never be relabelled as a closing quote.
  if (!last || age > 7 * 86400 || q.marketTime < last.end - 60 || q.marketTime > last.end + 300) return null;
  return "close";
}

export function quoteBasisLabel(basis: "latest" | "close", marketTime: number) {
  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(marketTime * 1000);
  return `${basis === "close" ? "종가 기준" : "시세 기준"} · ${time} KST`;
}
