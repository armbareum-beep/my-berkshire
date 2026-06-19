"use client";

import { ComposedChart, Line, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { money, signedPct, changeColor, type Currency } from "@/lib/format";

export interface LinePoint {
  date: string;
  value: number; // ₩
}

/** "YYYY-MM-DD" → "YYYY.MM.DD" (툴팁 라벨용). */
function fmtDate(d: string): string {
  return d.replaceAll("-", ".");
}

interface Row {
  date: string;
  mine: number;
  market: number | null;
}

/** 호버 툴팁 — 그날 나·시장·차이%. shadcn 톤 유지. */
function VsTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  label: string;
  currency: Currency;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const edge =
    p.market != null && p.market > 0 ? (p.mine - p.market) / p.market : null;
  return (
    <div className="grid min-w-44 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{fmtDate(p.date)}</div>
      <div className="grid gap-0.5">
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">나</span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {money(p.mine, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-mono tabular-nums text-foreground/80">
            {p.market != null ? money(p.market, currency) : "—"}
          </span>
        </div>
        {edge != null && (
          <div className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground">차이</span>
            <span
              className="font-mono font-medium tabular-nums"
              style={{ color: changeColor(edge) }}
            >
              {signedPct(edge)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 나 vs 시장(KOSPI/S&P) 시계열 — 같은 현금흐름·같은 ₩ 기준. shadcn/recharts.
 * 나=진한 프라이머리 라인+옅은 면적, 시장=옅은 회색 얇은 선. 같은 날짜 축(동일 길이) 가정.
 * 마우스를 올리면 그날 나·시장·차이% 툴팁.
 */
export function BenchmarkChart({
  mine,
  market,
  label,
  factor,
  currency,
  mature = true,
  bare = false,
}: {
  mine: LinePoint[];
  market: LinePoint[];
  label: string; // 지수명(KOSPI/S&P 500)
  factor: number;
  currency: Currency;
  /** 설립 90일↑(연환산 안정). false면 단기 출렁임 주의문구를 덧댄다(누적 격차는 항상 표시). */
  mature?: boolean;
  /** 바깥 카드 껍데기 없이 내용만(상위 카드에 임베드). 상단 "vs {label}" 줄도 생략. */
  bare?: boolean;
}) {
  if (mine.length < 2) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        비교 추이는 며칠 쌓이면 나타나요.
      </p>
    );
  }

  // mine·market 은 동일 날짜·동일 길이(returns 페이지에서 market = mine.map). 인덱스로 병합.
  const data: Row[] = mine.map((p, i) => ({
    date: p.date,
    mine: p.value * factor,
    market: market[i]?.value != null ? market[i].value * factor : null,
  }));

  const vals = data.flatMap((d) =>
    d.market != null ? [d.mine, d.market] : [d.mine],
  );
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const padY = (max - min) * 0.05 || max * 0.02 || 1;

  const myLast = data[data.length - 1].mine;
  const mktLast = data[data.length - 1].market;
  // 같은 돈 기준이라 평가액 차이 = 초과수익(₩). 비율로도.
  const edge = mktLast != null && mktLast > 0 ? (myLast - mktLast) / mktLast : null;

  const chartConfig = {
    mine: { label: "나", color: "var(--primary)" },
  } satisfies ChartConfig;

  return (
    <div className={bare ? "" : "rounded-2xl bg-card p-5 shadow-card"}>
      {!bare && (
        <p className="text-sm text-muted-foreground">
          vs {label} · 같은 돈을 같은 날 넣었다면
        </p>
      )}
      {edge != null ? (
        <>
          <p
            className="mt-1 text-2xl font-extrabold tabular-nums tracking-tight"
            style={{ color: changeColor(edge) }}
          >
            {edge >= 0 ? "앞서는 중 " : "뒤처지는 중 "}
            {signedPct(edge)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            지금 내 평가액과 {label} 투자 평가액의 누적 차이
            {!mature && " · 최근 입금분은 아직 시장 노출이 짧아 지수 간 차이가 거의 없어요"}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          비교 추이는 며칠 쌓이면 나타나요.
        </p>
      )}

      <ChartContainer config={chartConfig} className="mt-4 aspect-auto h-44 w-full">
        <ComposedChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={[min - padY, max + padY]} />
          <ChartTooltip
            cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            content={<VsTooltip label={label} currency={currency} />}
          />
          {/* 시장 — 옅은 회색 얇은 선(기준선) */}
          <Line
            dataKey="market"
            type="monotone"
            stroke="var(--muted-foreground)"
            strokeWidth={1.5}
            strokeOpacity={0.6}
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={false}
          />
          {/* 나 — 진한 프라이머리 가는 라인(면적 채움 없음, §차트 규칙) */}
          <Line
            dataKey="mine"
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
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-primary" /> 나{" "}
          {money(myLast, currency)}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-muted-foreground" /> {label}{" "}
          {mktLast != null ? money(mktLast, currency) : "—"}
        </span>
      </div>
    </div>
  );
}
