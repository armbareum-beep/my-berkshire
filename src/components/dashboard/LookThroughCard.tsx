"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { moneyCompact, type Currency } from "@/lib/format";

interface Rot {
  label: string;
  value: string;
}

/**
 * 홈 "내 지분 실적" 카드 — 투시 연결 순이익(내 몫) + 밸류에이션 지표 로테이션(PRD §8-2).
 * ROE·PER·PBR 중 값 있는 것만 ~3.5초 자동 전환(단정 금지·중립 표기). 탭하면 /lookthrough 상세.
 */
export function LookThroughCard({
  netIncome,
  per,
  pbr,
  roe,
  factor = 1,
  currency = "KRW",
  chart,
}: {
  /** ₩ 기준 연결 순이익(내 몫). 표시 시 factor 로 환산. */
  netIncome: number;
  per: number | null;
  pbr: number | null;
  roe: number | null;
  factor?: number;
  currency?: Currency;
  /** 카드 하단에 붙는 배분 차트 섹션(예: ETF 도넛). 링크 영역 밖이라 자체 인터랙션 유지. */
  chart?: ReactNode;
}) {
  const rotations: Rot[] = [];
  if (per != null) rotations.push({ label: "PER", value: `${per.toFixed(1)}배` });
  if (pbr != null) rotations.push({ label: "PBR", value: `${pbr.toFixed(1)}배` });
  if (roe != null)
    rotations.push({ label: "ROE", value: `${(roe * 100).toFixed(1)}%` });

  const [i, setI] = useState(0);
  useEffect(() => {
    if (rotations.length < 2) return;
    const t = setInterval(
      () => setI((p) => (p + 1) % rotations.length),
      3500,
    );
    return () => clearInterval(t);
  }, [rotations.length]);

  const rot = rotations[i % Math.max(1, rotations.length)];

  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <Link href="/lookthrough" className="block transition active:opacity-70">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">🏭 내 지분 실적</p>
            <p className="text-xs text-muted-foreground">
              내 회사들이 버는 힘 · 지분 몫 이익
            </p>
          </div>
          <span className="text-muted-foreground">›</span>
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <p className="text-xs text-muted-foreground">연결 투시 순이익 (내 몫)</p>
            <p className="mt-0.5 text-2xl font-extrabold tabular-nums">
              {moneyCompact(netIncome * factor, currency)}
            </p>
          </div>
          {rot && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{rot.label}</p>
              <p className="text-lg font-bold tabular-nums">{rot.value}</p>
            </div>
          )}
        </div>
      </Link>
      {chart && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-3 text-xs font-semibold text-muted-foreground">
            ETF 배분
          </p>
          {chart}
        </div>
      )}
    </div>
  );
}
