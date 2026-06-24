"use client";

import { useState } from "react";
import { signedPct, changeColor } from "@/lib/format";
import type { PeriodKey } from "@/lib/finance/periodReturns";

export interface PeriodView {
  key: PeriodKey;
  label: string;
  days: number;
  xirr: number | null;
  cumulative: number | null;
  cagr: number | null;
}

/** 기간 토글 + 선택 구간의 수익률(연환산 XIRR 우선, 90일 미만은 누적). */
export function PeriodReturns({ periods }: { periods: PeriodView[] }) {
  const [key, setKey] = useState<PeriodKey>("all");
  const p = periods.find((x) => x.key === key) ?? periods[periods.length - 1];

  // 90일 이상이면 XIRR(연환산), 미만이면 누적만.
  const annualized = p.days >= 90 && p.xirr !== null;
  const headline = annualized ? p.xirr : p.cumulative;

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      {/* 기간 토글 */}
      <div className="flex gap-2">
        {periods.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setKey(x.key)}
            className={
              "flex-1 rounded-full py-1.5 text-sm font-semibold " +
              (x.key === key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground")
            }
          >
            {x.label}
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        {annualized ? "연환산 수익률 (XIRR)" : "누적 수익률"}
      </p>
      <p
        className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight"
        style={{ color: headline != null ? changeColor(headline) : undefined }}
      >
        {headline != null ? signedPct(headline) : "—"}
      </p>

      {/* 비율은 하나만 — 헤드라인(연환산 XIRR/누적)과 의미가 다른 CAGR을 같이 띄우면
          사용자가 둘을 혼동해서 제거(FR-009). 적립이 많을수록 CAGR이 부풀려져 오해를 부름. */}
      <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
        <Row k="누적 수익률" v={p.cumulative != null ? signedPct(p.cumulative) : "—"} />
        <Row k="기간" v={`${p.days.toLocaleString()}일`} />
      </dl>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium tabular-nums">{v}</dd>
    </div>
  );
}
