"use client";

import { useState } from "react";
import Link from "next/link";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import {
  money,
  signedMoneyShort,
  pct,
  changeColor,
  type Currency,
} from "@/lib/format";
import { qtyUnit } from "@/lib/securities";
import type { ConsolidatedHolding } from "@/lib/accounts";

type SortKey = "value" | "gain" | "rate";

const SORT_LABEL: Record<SortKey, string> = {
  value: "평가액",
  gain: "수익금",
  rate: "수익률",
};

function numOf(h: ConsolidatedHolding, key: SortKey): number | null {
  if (key === "value") return h.totalValue;
  if (key === "gain") return h.totalGain;
  return h.changeRate;
}

function makeCmp(key: SortKey, dir: "asc" | "desc") {
  return (a: ConsolidatedHolding, b: ConsolidatedHolding) => {
    const av = numOf(a, key);
    const bv = numOf(b, key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return dir === "asc" ? av - bv : bv - av;
  };
}

/**
 * 홈화면용 종목별 통합 보유목록 — 서버에서 합산된 ConsolidatedHolding[] 수신.
 * 정렬 칩(평가액·수익금·수익률)으로 클라이언트 측 정렬.
 */
export function ConsolidatedHoldings({
  holdings: initialHoldings,
  currency,
}: {
  holdings: ConsolidatedHolding[];
  currency: Currency;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  function pick(k: SortKey) {
    if (k === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setDir("desc");
    }
  }

  const holdings = [...initialHoldings].sort(makeCmp(sortKey, dir));

  if (holdings.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        보유 종목 없음
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => {
          const active = k === sortKey;
          return (
            <button
              key={k}
              type="button"
              onClick={() => pick(k)}
              className={
                "rounded-full px-3 py-1.5 text-sm font-medium transition " +
                (active
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground")
              }
            >
              {SORT_LABEL[k]}
              {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
            </button>
          );
        })}
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {holdings.map((h) => (
          <li key={h.symbol}>
            <Link
              href={`/stocks/${h.symbol}`}
              scroll={false}
              className="flex items-center gap-3 py-3 transition active:scale-[0.99]"
            >
              <SymbolAvatar name={h.name} symbol={h.symbol} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{h.name}</span>
                <span className="text-sm text-muted-foreground">
                  {h.totalQuantity.toLocaleString()}
                  {qtyUnit(h.symbol)}
                </span>
              </span>
              <span className="ml-auto flex shrink-0 flex-col items-end">
                <span className="font-semibold tabular-nums">
                  {money(h.totalValue, currency)}
                </span>
                {h.changeRate !== null && (
                  <span
                    className="text-sm font-medium tabular-nums"
                    style={{ color: changeColor(h.changeRate) }}
                  >
                    {signedMoneyShort(h.totalGain ?? 0, currency)} (
                    {pct(Math.abs(h.changeRate))})
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
