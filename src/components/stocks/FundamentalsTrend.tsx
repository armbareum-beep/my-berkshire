"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { wonCompact } from "@/lib/format";

/** page 에서 직렬화돼 넘어오는 연도별 지표(필요한 필드만). */
export interface SeriesPoint {
  year: number;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  assets: number | null;
  liabilities: number | null;
  equity: number | null;
  ocf: number | null;
  icf: number | null;
  ffcf: number | null;
  capex: number | null;
  interestExpense: number | null;
  per: number | null;
  pbr: number | null;
  psr: number | null;
}

type Unit = "won" | "mult" | "pct" | "turn";

interface Metric {
  id: string;
  label: string;
  unit: Unit;
  value: (p: SeriesPoint) => number | null;
}

/** 비율 헬퍼 — 분모 0/결측이면 null. */
function ratio(
  num: keyof SeriesPoint,
  den: keyof SeriesPoint,
): (p: SeriesPoint) => number | null {
  return (p) => {
    const a = p[num];
    const b = p[den];
    return typeof a === "number" && typeof b === "number" && b !== 0
      ? a / b
      : null;
  };
}

const METRICS: Metric[] = [
  { id: "revenue", label: "매출액", unit: "won", value: (p) => p.revenue },
  { id: "operatingIncome", label: "영업이익", unit: "won", value: (p) => p.operatingIncome },
  { id: "netIncome", label: "당기순이익", unit: "won", value: (p) => p.netIncome },
  { id: "assets", label: "자산총계", unit: "won", value: (p) => p.assets },
  { id: "liabilities", label: "부채총계", unit: "won", value: (p) => p.liabilities },
  { id: "equity", label: "자본총계", unit: "won", value: (p) => p.equity },
  { id: "ocf", label: "영업활동CF", unit: "won", value: (p) => p.ocf },
  { id: "icf", label: "투자활동CF", unit: "won", value: (p) => p.icf },
  { id: "ffcf", label: "재무활동CF", unit: "won", value: (p) => p.ffcf },
  { id: "per", label: "PER", unit: "mult", value: (p) => p.per },
  { id: "pbr", label: "PBR", unit: "mult", value: (p) => p.pbr },
  { id: "psr", label: "PSR", unit: "mult", value: (p) => p.psr },
  // 듀폰 분해: ROE = 순이익률 × 총자산회전율 × 재무레버리지
  { id: "roe", label: "ROE", unit: "pct", value: ratio("netIncome", "equity") },
  { id: "netMargin", label: "순이익률", unit: "pct", value: ratio("netIncome", "revenue") },
  { id: "assetTurnover", label: "총자산회전율", unit: "turn", value: ratio("revenue", "assets") },
  { id: "leverage", label: "재무레버리지", unit: "mult", value: ratio("assets", "equity") },
  { id: "interestCoverage", label: "이자보상배율", unit: "mult", value: ratio("operatingIncome", "interestExpense") },
];

/** 지표 단위에 맞춘 표시 포맷. */
function fmt(v: number, unit: Unit): string {
  if (unit === "won") return wonCompact(v);
  if (unit === "pct") return `${(v * 100).toFixed(1)}%`;
  if (unit === "turn") return `${v.toFixed(2)}회`;
  return `${v.toFixed(2)}배`; // mult
}

/**
 * 최근 실적 추이 — 큰 라인 차트(shadcn/Recharts) + 지표 토글. 연도 많으면 가로 스크롤.
 * 정확한 값은 "표로 보기" 접기. 다년 평균/추세를 이 차트가 담당(셀렉터는 단년 선택만).
 */
/** 성장률(CAGR) 요약 — 다년 값이라 연도 그리드 대신 여기. 소수(0.15=+15%). */
export interface GrowthSummary {
  revenue: number | null;
  netIncome: number | null;
  operatingIncome: number | null;
  years: number;
}

function pctSigned(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

export function FundamentalsTrend({
  series,
  growth,
}: {
  series: SeriesPoint[];
  growth?: GrowthSummary;
}) {
  const [metric, setMetric] = useState<string>("revenue");
  if (series.length < 2) return null;

  const asc = [...series].sort((a, b) => a.year - b.year);
  const current = METRICS.find((m) => m.id === metric) ?? METRICS[0];
  const data = asc.map((p) => ({ year: p.year, value: current.value(p) }));
  const hasData = data.some((d) => typeof d.value === "number");

  const config = {
    value: { label: current.label, color: "var(--primary)" },
  } satisfies ChartConfig;

  // 연도 많으면 가로 스크롤(연당 최소 폭).
  const chartWidth = Math.max(asc.length * 64, 320);

  return (
    <div className="mt-3 border-t border-border pt-4">
      <p className="mb-2 text-sm font-semibold">최근 실적 추이</p>

      {/* 성장률(CAGR) 요약 — 다년 값이라 여기에(연도 선택과 무관) */}
      {growth && (
        <div className="mb-3 rounded-lg bg-secondary px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">최근 {growth.years}년 성장률(CAGR)</span>
          {growth.revenue != null && <> · 매출 {pctSigned(growth.revenue)}</>}
          {growth.operatingIncome != null && <> · 영업이익 {pctSigned(growth.operatingIncome)}</>}
          {growth.netIncome != null && <> · 순이익 {pctSigned(growth.netIncome)}</>}
        </div>
      )}

      {/* 지표 선택 — 드롭다운(지표가 많아 스크롤 칩보다 깔끔) */}
      <div className="mb-3">
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm font-medium"
        >
          {METRICS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* 가로 스크롤 라인 차트 */}
      {hasData ? (
        <div className="-mx-1 overflow-x-auto px-1">
          <div style={{ width: chartWidth }}>
            <ChartContainer config={config} className="h-56 w-full">
              <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <XAxis
                  dataKey="year"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                />
                <YAxis
                  width={48}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tickFormatter={(v) => fmt(Number(v), current.unit)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(l) => `${l}년`}
                      formatter={(value) => (
                        <span className="font-semibold tabular-nums">
                          {fmt(Number(value), current.unit)}
                        </span>
                      )}
                    />
                  }
                />
                <Line
                  dataKey="value"
                  type="monotone"
                  stroke="var(--color-value)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </LineChart>
            </ChartContainer>
          </div>
        </div>
      ) : (
        <p className="py-8 text-center text-xs text-muted-foreground">
          {current.label} 데이터가 없어요.
        </p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          표로 보기 (정확한 값)
        </summary>
        <div className="-mx-1 mt-2 overflow-x-auto px-1">
          <table className="min-w-full border-collapse whitespace-nowrap text-xs tabular-nums">
            <thead>
              <tr className="text-muted-foreground">
                <th className="sticky left-0 z-10 bg-card py-1.5 pr-3 text-left font-medium">
                  항목
                </th>
                {asc.map((p) => (
                  <th key={p.year} className="px-2.5 py-1.5 text-right font-medium">
                    {p.year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.id} className="border-t border-border/60">
                  <td className="sticky left-0 z-10 bg-card py-1.5 pr-3 text-left text-muted-foreground">
                    {m.label}
                  </td>
                  {asc.map((p) => {
                    const v = m.value(p);
                    return (
                      <td key={p.year} className="px-2.5 py-1.5 text-right">
                        {typeof v === "number" ? fmt(v, m.unit) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
