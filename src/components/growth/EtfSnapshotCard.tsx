import Link from "next/link";
import type { ReactNode } from "react";
import { pct } from "@/lib/format";

interface EtfSlice {
  symbol: string;
  name: string;
  weight: number;
  ter: number | null;
}

const MAX_VISIBLE = 5;

export function EtfSnapshotCard({
  slices,
  weightedAvgTer,
  chart,
}: {
  slices: EtfSlice[];
  weightedAvgTer: number | null;
  /** ETF 배분 도넛(embedded). 있으면 텍스트 목록 대신 차트를 표시(범례가 목록 역할). */
  chart?: ReactNode;
}) {
  const visible = slices.slice(0, MAX_VISIBLE);
  const overflow = slices.length - MAX_VISIBLE;

  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <Link
        href="/etf-portfolio"
        className="block transition active:opacity-70"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">📦 내 ETF 포트폴리오</p>
          <span className="text-muted-foreground">›</span>
        </div>
      </Link>

      {chart ? (
        <div className="mt-4">{chart}</div>
      ) : (
        <ul className="mt-3 space-y-2">
          {visible.map((s) => (
            <li key={s.symbol} className="flex items-center justify-between">
              <span className="truncate text-sm text-foreground">{s.name}</span>
              <span className="ml-2 shrink-0 text-sm tabular-nums text-muted-foreground">
                {pct(s.weight)}
              </span>
            </li>
          ))}
          {overflow > 0 && (
            <li className="text-xs text-muted-foreground">외 {overflow}개</li>
          )}
        </ul>
      )}

      {weightedAvgTer !== null && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          연간 보수 {pct(weightedAvgTer, 2)}
        </p>
      )}
    </div>
  );
}
