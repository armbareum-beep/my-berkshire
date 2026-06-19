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
import { moneyCompact, type Currency } from "@/lib/format";
import type { QuarterPoint } from "@/lib/finance/lookThrough";

type Unit = "won" | "mult" | "pct";

interface Metric {
  id: keyof QuarterPoint;
  label: string;
  unit: Unit;
}

const METRICS: Metric[] = [
  { id: "netIncome", label: "연결 순이익", unit: "won" },
  { id: "revenue", label: "매출", unit: "won" },
  { id: "operatingIncome", label: "영업이익", unit: "won" },
  { id: "equity", label: "자본총계", unit: "won" },
  { id: "assets", label: "자산총계", unit: "won" },
  { id: "fcf", label: "FCF", unit: "won" },
  { id: "coveredValue", label: "반영 시장가치", unit: "won" },
  { id: "per", label: "PER", unit: "mult" },
  { id: "pbr", label: "PBR", unit: "mult" },
  { id: "psr", label: "PSR", unit: "mult" },
  { id: "roe", label: "ROE", unit: "pct" },
  { id: "roa", label: "ROA", unit: "pct" },
  { id: "netMargin", label: "순이익률", unit: "pct" },
  { id: "operatingMargin", label: "영업이익률", unit: "pct" },
];

function fmt(v: number, unit: Unit, currency: Currency): string {
  if (unit === "won") return moneyCompact(v, currency);
  if (unit === "pct") return `${(v * 100).toFixed(1)}%`;
  return `${v.toFixed(2)}배`; // mult
}

/**
 * 투시 펀더멘털 분기별 진화 — 큰 라인 차트(지표 토글). 분기 많으면 가로 스크롤.
 * 데이터는 events+공시+과거주가에서 복원된 분기 시계열(저장 없음).
 */
export function LookThroughTrend({
  points,
  factor = 1,
  currency = "KRW",
}: {
  points: QuarterPoint[];
  /** ₩값 → 표시통화 환산 계수(USD 모드면 1/usdKrw). */
  factor?: number;
  currency?: Currency;
}) {
  const [metric, setMetric] = useState<keyof QuarterPoint>("netIncome");
  if (points.length < 2) return null;

  const current = METRICS.find((m) => m.id === metric) ?? METRICS[0];
  // 금액(won) 지표만 표시통화로 환산, 비율(mult/pct)은 통화 무관.
  const data = points.map((p) => {
    const raw = p[current.id] as number | null;
    const value =
      raw == null ? null : current.unit === "won" ? raw * factor : raw;
    return { label: p.label, value };
  });
  const hasData = data.some((d) => typeof d.value === "number");

  const config = {
    value: { label: current.label, color: "var(--primary)" },
  } satisfies ChartConfig;

  const chartWidth = Math.max(points.length * 64, 320);

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <p className="mb-1 text-sm font-semibold">분기별 진화</p>
      <p className="mb-3 text-xs text-muted-foreground">
        연간 재무 기준 · 내 자본배분과 시장가치가 분기마다 반영돼요
      </p>

      <div className="mb-3">
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as keyof QuarterPoint)}
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm font-medium"
        >
          {METRICS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {hasData ? (
        <div className="-mx-1 overflow-x-auto px-1">
          <div style={{ width: chartWidth }}>
            <ChartContainer config={config} className="h-56 w-full">
              <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <ReferenceLine y={0} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
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
                  tickFormatter={(v) => fmt(Number(v), current.unit, currency)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (
                        <span className="font-semibold tabular-nums">
                          {fmt(Number(value), current.unit, currency)}
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
    </section>
  );
}
