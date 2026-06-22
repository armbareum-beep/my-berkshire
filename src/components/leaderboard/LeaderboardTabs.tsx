"use client";

import Link from "next/link";

export function LeaderboardTabs({ activeTab }: { activeTab: "challenge" | "live" }) {
  return (
    <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
      <Link
        href="/leaderboard"
        className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold transition-colors ${
          activeTab === "challenge"
            ? "bg-card shadow-sm text-foreground"
            : "text-muted-foreground"
        }`}
      >
        챌린지
      </Link>
      <Link
        href="/leaderboard?tab=live"
        className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold transition-colors ${
          activeTab === "live"
            ? "bg-card shadow-sm text-foreground"
            : "text-muted-foreground"
        }`}
      >
        라이브
      </Link>
    </div>
  );
}
