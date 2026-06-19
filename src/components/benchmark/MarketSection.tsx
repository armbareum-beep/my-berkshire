"use client";

import { useState } from "react";
import { BenchmarkChart, type LinePoint } from "./BenchmarkChart";
import { pct, signedPct, changeColor, type Currency } from "@/lib/format";

interface IndexCompare {
  label: string;
  /** PME 연환산(XIRR). 단기·실패면 null. */
  xirr: number | null;
  /** 차트용 동일현금흐름 지수 평가 라인. */
  points: LinePoint[];
}

/**
 * vs 시장 — 한 섹션. 지수 선택 칩 → 그 지수 추이 차트 + (성숙 시) 전체 지수 연환산 %p 표.
 * 그래프(추이)는 1일차부터 보인다. "시장 초과 %"·연환산 표 같은 숫자는 설립 90일 후(연환산
 * 안정)에만 나타난다 — 빈 "아직 일러요" 카드는 띄우지 않고, 준비되면 그때 표가 붙는다.
 */
export function MarketSection({
  mine,
  indices,
  myXirr,
  defaultLabel,
  periodLabel,
  factor,
  currency,
}: {
  mine: LinePoint[];
  indices: IndexCompare[];
  /** 내 전체기간 연환산. null이면 미성숙(표 숨김, 차트만). */
  myXirr: number | null;
  defaultLabel: string;
  periodLabel: string;
  factor: number;
  currency: Currency;
}) {
  const mature = myXirr != null;
  const initial = indices.some((i) => i.label === defaultLabel)
    ? defaultLabel
    : indices[0]?.label;
  const [sel, setSel] = useState(initial);
  const selected = indices.find((i) => i.label === sel) ?? indices[0];
  if (!selected) return null;

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">vs 시장</p>
        {mature ? (
          <p className="text-sm text-muted-foreground">
            내 회사 <span className="font-bold text-foreground">{pct(myXirr)}</span>
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{periodLabel}</p>
        )}
      </div>

      {/* 지수 선택 드롭다운 — 항목이 늘어도 그대로 확장됨(모바일 네이티브 피커) */}
      <select
        value={selected.label}
        onChange={(e) => setSel(e.target.value)}
        aria-label="비교 지수 선택"
        className="w-full rounded-xl bg-secondary px-3 py-2 text-sm font-semibold text-foreground"
      >
        {indices.map((i) => (
          <option key={i.label} value={i.label}>
            {i.label}
          </option>
        ))}
      </select>

      {/* 선택 지수 추이 차트(카드 껍데기 없이 임베드) — 누적 격차는 1일차부터 */}
      <BenchmarkChart
        mine={mine}
        market={selected.points}
        label={selected.label}
        factor={factor}
        currency={currency}
        mature={mature}
        bare
      />

      {/* 전체 지수 연환산 비교 — 성숙(90일↑)일 때만 같은 카드 안에 구분선으로 덧붙임. */}
      {mature && (
        <div className="border-t border-border pt-4">
          <p className="mb-3 text-sm font-semibold">전체 지수 (연환산)</p>
          <ul className="flex flex-col gap-3">
            {indices.map((i) => {
              const diff = i.xirr == null ? null : myXirr - i.xirr;
              const on = i.label === selected.label;
              return (
                <li
                  key={i.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span className={on ? "font-bold" : "font-medium"}>
                    {i.label}
                  </span>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span className="text-muted-foreground">
                      {i.xirr == null ? "—" : pct(i.xirr)}
                    </span>
                    {diff != null && (
                      <span
                        className="w-20 text-right font-semibold"
                        style={{ color: changeColor(diff) }}
                      >
                        {signedPct(diff)}p
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            같은 날짜·같은 금액을 그 지수에 넣었다면(PME) 기준. 타이밍이 아니라
            실력으로 시장을 이겼는지를 봅니다.
          </p>
        </div>
      )}
    </section>
  );
}
