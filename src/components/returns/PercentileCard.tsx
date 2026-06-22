"use client";

import { useState } from "react";
import { Share2, Check, Trophy } from "lucide-react";
import type { PercentileData } from "@/lib/perf/snapshot";

interface Props {
  alpha: number;
  days: number;
  percentile: PercentileData | null;
  mode: "ledger" | "challenge" | "live";
  benchmarkLabel: string;
}

export function PercentileCard({ alpha, days, percentile, mode, benchmarkLabel }: Props) {
  const [copied, setCopied] = useState(false);

  const alphaLabel = `${alpha >= 0 ? "+" : ""}${(alpha * 100).toFixed(1)}%p`;

  if (mode === "ledger") {
    return null;
  }

  if (!percentile) return null;

  const { rank, total, topPct, histogram } = percentile;
  const pctLabel = topPct != null ? `상위 ${topPct}%` : "—";
  const maxCnt = Math.max(...histogram.map((h) => h.cnt), 1);
  const myBucket = histogram.find(
    (h) => (h.lo == null || alpha >= h.lo) && (h.hi == null || alpha < h.hi),
  )?.bucket;
  const hasPeers = total >= 2;

  async function handleShare() {
    const text = `${benchmarkLabel} 대비 ${alphaLabel} · 챌린지 ${total}명 중 ${pctLabel} · My Berkshire (${days}일 운용)`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // share cancelled or not supported
    }
  }

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Trophy size={16} className="text-muted-foreground" />
          <p className="text-sm font-semibold">챌린지 순위</p>
        </div>
        {hasPeers && (
          <button
            onClick={handleShare}
            className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium bg-primary/10 text-primary active:opacity-70"
          >
            {copied ? <Check size={13} /> : <Share2 size={13} />}
            {copied ? "복사됨" : "공유"}
          </button>
        )}
      </div>

      {hasPeers ? (
        <>
          <p className="mb-0.5 text-xs text-muted-foreground">
            {benchmarkLabel} 대비 알파 {alphaLabel}
          </p>
          <p className="mb-1 text-xl font-bold">
            <span>{total}명 중 </span>
            <span style={{ color: "var(--primary)" }}>{pctLabel}</span>
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            {rank}위 · {benchmarkLabel} 알파 기준 · {total}명 참여 중
          </p>

          <div className="flex items-end gap-[3px]" style={{ height: 44 }}>
            {histogram.map((h) => {
              const isMe = h.bucket === myBucket;
              const barH =
                h.cnt === 0 ? 3 : Math.max(5, Math.round((h.cnt / maxCnt) * 44));
              return (
                <div key={h.bucket} className="flex flex-1 flex-col items-center">
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: barH,
                      background: isMe ? "var(--primary)" : "var(--muted)",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-[10px] text-muted-foreground">시장 하회</span>
            <span className="text-[10px] text-muted-foreground">시장 초과</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          아직 비교할 유저가 부족해요. 유저가 모이면 여기서 순위를 확인할 수 있어요.
        </p>
      )}
    </section>
  );
}
