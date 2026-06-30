interface LeaderboardRow {
  rank: number;
  holdingId: string;
  holdingName: string;
  totalScore: number;
  isMe: boolean;
}

function rankMedal(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}`;
}

function scoreGrade(score: number): string {
  if (score >= 90) return "S";
  if (score >= 80) return "A+";
  if (score >= 70) return "A";
  if (score >= 60) return "B+";
  if (score >= 50) return "B";
  return "C";
}

export function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl bg-card shadow-card">
      <div className="px-5 pt-5 pb-3">
        <p className="text-sm font-semibold">전체 순위</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {rows.length}명 참여 중
        </p>
      </div>
      <ul>
        {rows.map((row, idx) => (
          <li
            key={row.holdingId}
            className={[
              "flex items-center gap-3 px-5 py-3",
              idx < rows.length - 1 ? "border-b border-border" : "",
              row.isMe ? "bg-primary/5" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {/* 순위 */}
            <span className="w-7 shrink-0 text-center text-sm font-bold tabular-nums text-muted-foreground">
              {rankMedal(row.rank)}
            </span>

            {/* 이름 */}
            <span className="flex-1 truncate text-sm font-medium">
              {row.holdingName}
              {row.isMe && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  나
                </span>
              )}
            </span>

            {/* 등급 + 점수 */}
            <span className="shrink-0 text-xs text-muted-foreground">
              {scoreGrade(row.totalScore)}
            </span>
            <span
              className="w-8 shrink-0 text-right text-sm font-bold tabular-nums"
              style={{ color: row.isMe ? "var(--primary)" : undefined }}
            >
              {row.totalScore}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
