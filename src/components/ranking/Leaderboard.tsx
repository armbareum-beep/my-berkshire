"use client";
import { useState } from "react";
import type { PublicMilestonesV1 } from "@/lib/rankingMilestones";
import { RankerProfileSheet } from "./RankerProfileSheet";

export interface LeaderboardRow {
  rank: number;
  holdingId: string;
  holdingName: string;
  totalScore: number;
  grade: string;
  isMe: boolean;
  /** 설립일(YYYY-MM-DD). 구버전 행은 null일 수 있음. */
  foundedAt: string | null;
  scoreVersion: number;
  holdingPeriodScore: number;
  contrarianScore: number;
  marketScore: number;
  diversificationScore: number;
  depositScore: number;
  /** 저레버리지·저비용 — score_version=1(구버전) 행은 null(산출 대기). */
  leverageScore: number | null;
  costScore: number | null;
  milestones: PublicMilestonesV1 | null;
}

function rankMedal(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}`;
}

export function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  const [selected, setSelected] = useState<LeaderboardRow | null>(null);

  if (rows.length === 0) return null;

  return (
    <>
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
                idx < rows.length - 1 ? "border-b border-border" : "",
                row.isMe ? "bg-primary/5" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                onClick={() => setSelected(row)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition active:bg-secondary/50"
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
                  {row.grade}
                </span>
                <span
                  className="w-8 shrink-0 text-right text-sm font-bold tabular-nums"
                  style={{ color: row.isMe ? "var(--primary)" : undefined }}
                >
                  {row.totalScore}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <RankerProfileSheet
        row={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
