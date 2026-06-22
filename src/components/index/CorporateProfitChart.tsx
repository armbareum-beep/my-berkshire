"use client";

import { Area, AreaChart, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer } from "recharts";
import type { CorporateProfitPoint } from "@/lib/finance/macroStats";

interface Props {
  series: CorporateProfitPoint[];
  latestRatio: number;
  asOf: string;
}

export function CorporateProfitChartFallback() {
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <p className="mb-1 text-sm font-semibold">미국 기업이익/GDP 추이</p>
      <p className="text-sm text-muted-foreground">
        FRED 데이터를 가져올 수 없어요. 잠시 후 다시 시도해 주세요.
      </p>
    </section>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-card px-3 py-2 shadow-card text-xs">
      <p className="text-muted-foreground">{label?.slice(0, 7)}</p>
      <p className="font-semibold tabular-nums">{(payload[0].value * 100).toFixed(1)}%</p>
    </div>
  );
}

export function CorporateProfitChart({ series, latestRatio, asOf }: Props) {
  // 연도별로 1개 포인트만 남겨 차트 밀도 조절 (분기 → 연간)
  const annual: CorporateProfitPoint[] = [];
  const seenYears = new Set<string>();
  for (const p of series) {
    const year = p.date.slice(0, 4);
    if (!seenYears.has(year)) {
      seenYears.add(year);
      annual.push(p);
    }
  }

  const avg =
    series.reduce((s, p) => s + p.ratio, 0) / series.length;

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <p className="mb-1 text-sm font-semibold">미국 기업이익/GDP 추이</p>
      <p className="mb-1 text-xs text-muted-foreground">
        세후 법인이익 ÷ 명목 GDP · 1990년 이후 분기별
      </p>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="text-2xl font-extrabold tabular-nums">
          {(latestRatio * 100).toFixed(1)}%
        </span>
        <span className="text-xs text-muted-foreground">({asOf.slice(0, 7)} 기준)</span>
        <span className="ml-auto text-xs text-muted-foreground">
          평균 {(avg * 100).toFixed(1)}%
        </span>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={annual} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="cpGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(0, 4)}
            tick={{ fontSize: 10 }}
            interval={4}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            domain={["auto", "auto"]}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={avg}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
          <Area
            type="monotone"
            dataKey="ratio"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            fill="url(#cpGrad)"
            dot={false}
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <p className="mt-3 text-xs text-muted-foreground">
        출처: FRED (CP · GDP) · 미국 전체 법인 · 점선=기간 평균
      </p>
    </section>
  );
}
