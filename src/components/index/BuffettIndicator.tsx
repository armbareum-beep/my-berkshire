"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { BuffettIndicatorItem } from "@/lib/finance/macroStats";

interface Props {
  data: BuffettIndicatorItem[];
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: BuffettIndicatorItem & { ratioDisplay: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl bg-card px-3 py-2 shadow-card text-xs">
      <p className="font-semibold">
        {d.flag} {d.country}
      </p>
      <p className="text-muted-foreground">시총/GDP: {(d.ratio * 100).toFixed(0)}%</p>
      <p className="text-muted-foreground">기준연도: {d.year}</p>
    </div>
  );
}

export function BuffettIndicator({ data }: Props) {
  if (data.length === 0) return null;

  const chartData = data
    .sort((a, b) => b.ratio - a.ratio)
    .map((d) => ({
      ...d,
      label: `${d.flag} ${d.country}`,
      ratioDisplay: Math.round(d.ratio * 100),
    }));

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <p className="mb-1 text-sm font-semibold">국가별 시총/GDP (버핏 인디케이터)</p>
      <p className="mb-4 text-xs text-muted-foreground">
        100% 초과 = 시총이 GDP보다 큼 · 버핏이 "가장 좋아하는 밸류에이션 지표"
      </p>
      <ResponsiveContainer width="100%" height={data.length * 44}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
          barCategoryGap="28%"
        >
          <XAxis
            type="number"
            domain={[0, Math.max(220, ...chartData.map((d) => d.ratioDisplay + 20))]}
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => `${v}%`}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={72}
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
          <ReferenceLine
            x={100}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
          <Bar dataKey="ratioDisplay" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.ratioDisplay > 100 ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-3 text-xs text-muted-foreground">
        출처: World Bank · 연간 데이터 (최신 발표 기준, 1~2년 지연 가능)
      </p>
    </section>
  );
}
