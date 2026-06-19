"use client";

import { ComposedChart, Line, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  money,
  signedMoney,
  changeColor,
  type Currency,
} from "@/lib/format";
import type { ValuePoint } from "@/lib/finance/valueSeries";
import { CountUp } from "@/components/ui/CountUp";

/** "YYYY-MM-DD" → "YYYY.MM.DD" (툴팁 라벨용). */
function fmtDate(d: string): string {
  return d.replaceAll("-", ".");
}

interface Row {
  date: string;
  value: number;
  invested: number;
}

/** 호버 툴팁 — 그날 평가액·투입원금·손익. shadcn 톤 유지. */
function TrendTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  currency: Currency;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const profit = p.value - p.invested;
  return (
    <div className="grid min-w-40 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{fmtDate(p.date)}</div>
      <div className="grid gap-0.5">
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">평가액</span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {money(p.value, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">투입원금</span>
          <span className="font-mono tabular-nums text-foreground/80">
            {money(p.invested, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">손익</span>
          <span
            className="font-mono font-medium tabular-nums"
            style={{ color: changeColor(profit) }}
          >
            {signedMoney(profit, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * 자산추이 — 평가액(진한 라인 + 옅은 면적) + 투입원금(옅은 점선). shadcn/recharts.
 * 두 선 사이 = 누적손익. 마우스를 올리면 그날 평가액·투입원금·손익 툴팁.
 * 금액은 ₩ 포인트 × factor 로 표시통화 환산.
 */
export function ValueTrendChart({
  points,
  factor,
  currency,
}: {
  points: ValuePoint[];
  factor: number;
  currency: Currency;
}) {
  if (points.length < 2) {
    return (
      <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
        추이는 며칠 쌓이면 나타나요(설립 직후엔 점이 하나뿐).
      </p>
    );
  }

  const data: Row[] = points.map((p) => ({
    date: p.date,
    value: p.value * factor,
    invested: p.invested * factor,
  }));

  const vals = data.flatMap((d) => [d.value, d.invested]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const padY = (max - min) * 0.05 || max * 0.02 || 1;

  const last = data[data.length - 1];
  const profit = last.value - last.invested;

  const chartConfig = {
    value: { label: "평가액", color: "var(--primary)" },
  } satisfies ChartConfig;

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <p className="text-sm text-muted-foreground">현재 평가액</p>
      <CountUp
        value={last.value}
        format="money"
        currency={currency}
        className="mt-1 block text-3xl font-extrabold tracking-tight"
      />
      <p
        className="mt-1 text-sm font-semibold tabular-nums"
        style={{ color: changeColor(profit) }}
      >
        {signedMoney(profit, currency)} (투입원금 대비)
      </p>

      <ChartContainer config={chartConfig} className="mt-4 aspect-auto h-44 w-full">
        <ComposedChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={[min - padY, max + padY]} />
          <ChartTooltip
            cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            content={<TrendTooltip currency={currency} />}
          />
          {/* 투입원금 — 옅은 점선(기준선) */}
          <Line
            dataKey="invested"
            type="monotone"
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          {/* 평가액 — 진한 프라이머리 가는 라인(면적 채움 없음, §차트 규칙) */}
          <Line
            dataKey="value"
            type="monotone"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{data[0].date}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-primary" /> 평가액
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-4 border-t border-dashed border-muted-foreground" />{" "}
            투입원금
          </span>
        </span>
        <span>{last.date}</span>
      </div>
    </section>
  );
}
