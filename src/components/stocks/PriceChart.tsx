"use client";

import { useState } from "react";
import { Bar, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { won, signedWon, signedPct, changeColor } from "@/lib/format";

export interface PriceBar {
  date: string; // YYYY-MM-DD
  close: number; // ₩ 환산 종가
  open?: number;
  high?: number;
  low?: number;
  volume?: number; // 주/계약 수(통화 환산 안 함)
}

// 기간 칩 — source 가 daily(일봉)/monthly(월봉) 중 어디서 가져올지 + 최근 N봉.
// 짧은 구간은 일봉, 긴 구간(5년·최대)은 월봉(가볍게). bars=Infinity 면 그 소스 전체.
const RANGES = [
  { key: "1개월", source: "daily", bars: 21 },
  { key: "3개월", source: "daily", bars: 63 },
  { key: "6개월", source: "daily", bars: 126 },
  { key: "1년", source: "daily", bars: Infinity },
  { key: "5년", source: "monthly", bars: 60 },
  { key: "최대", source: "monthly", bars: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

/** "YYYY-MM-DD" → "YYYY.MM.DD" (툴팁 라벨용). */
function fmtDate(d: string): string {
  return d.replaceAll("-", ".");
}

interface TipRowProps {
  label: string;
  value: string;
  strong?: boolean;
}
function TipRow({ label, value, strong }: TipRowProps) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          "font-mono tabular-nums " +
          (strong ? "font-semibold text-foreground" : "text-foreground/80")
        }
      >
        {value}
      </span>
    </div>
  );
}

/** 호버 툴팁 — 그날 시·고·저·종 + 거래량(있을 때). shadcn 톤 유지. */
function OhlcvTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: PriceBar }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="grid min-w-40 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">{fmtDate(p.date)}</div>
      <div className="grid gap-0.5">
        <TipRow label="종가" value={won(p.close)} strong />
        {p.open != null && <TipRow label="시가" value={won(p.open)} />}
        {p.high != null && <TipRow label="고가" value={won(p.high)} />}
        {p.low != null && <TipRow label="저가" value={won(p.low)} />}
        {p.volume != null && (
          <TipRow label="거래량" value={p.volume.toLocaleString()} />
        )}
      </div>
    </div>
  );
}

/**
 * 종목 시세차트 — 종가 라인(shadcn/recharts) + 옅은 거래량 막대. 기간 칩으로 구간 선택.
 * 마우스를 올리면 커서를 따라다니는 툴팁에 그날 시·고·저·종 + 거래량이 뜬다.
 * 화면은 종가 라인이 주인공, 거래량은 하단 저채도 보조(가치투자 톤 유지하되 정보는 안 가림).
 * 가격은 ₩ 환산(외화는 현재 환율), 거래량은 원 수량.
 * 보유 종목은 평균단가(avgCost)를 가로 점선으로 — "지금 평단 위냐 아래냐" 한눈에.
 */
export function PriceChart({
  daily,
  monthly,
  avgCost,
}: {
  /** 1년치 일봉(짧은 구간용). */
  daily: PriceBar[];
  /** 상장 이후 월봉(5년·최대용). */
  monthly: PriceBar[];
  /** 보유 평균단가(₩). 있으면 평단선 오버레이. 미보유면 생략. */
  avgCost?: number | null;
}) {
  const [range, setRange] = useState<RangeKey>("1년");

  const sources = { daily, monthly };
  // 데이터 2점 이상인 구간만 칩으로 노출(월봉 없으면 5년·최대 자동 숨김).
  const ranges = RANGES.filter((r) => sources[r.source].length >= 2);
  if (ranges.length === 0) return null; // 그릴 게 없음(없는 종목·신규)

  // 선택 구간이 데이터 없으면(예: 월봉만 있는 케이스) 가용한 첫 구간으로.
  const active = ranges.find((r) => r.key === range) ?? ranges[0];
  const src = sources[active.source];
  const view = active.bars === Infinity ? src : src.slice(-active.bars);
  const pts = view.length >= 2 ? view : src;

  const closes = pts.map((b) => b.close);
  const hasAvg = avgCost != null && avgCost > 0;
  // 평단선이 범위 밖이면 잘리니, 도메인에 평단도 포함.
  const min = Math.min(...closes, hasAvg ? avgCost! : Infinity);
  const max = Math.max(...closes, hasAvg ? avgCost! : -Infinity);

  // "최대"는 수십 년 — 선형 축이면 옛 저가가 바닥에 깔려 평평해 보임(분할 보정은 이미 됨).
  // 장기 비율 변화를 제대로 보려면 로그 스케일. 짧은 구간은 선형이 직관적.
  const logScale = active.key === "최대" && min > 0;
  // 선형은 5% 절대 여백, 로그는 배수 여백(양수 유지).
  const padY = (max - min) * 0.05 || max * 0.02 || 1;
  const domLow = logScale ? min * 0.92 : min - padY;
  const domHigh = logScale ? max * 1.08 : max + padY;

  // 구간 고가·저가(시·고·저 있으면 그걸로, 없으면 종가).
  const periodHigh = Math.max(...pts.map((b) => b.high ?? b.close));
  const periodLow = Math.min(...pts.map((b) => b.low ?? b.close));

  const volumes = pts.map((b) => b.volume ?? 0);
  const hasVolume = volumes.some((v) => v > 0);
  const maxVol = Math.max(...volumes, 0);

  const first = pts[0].close;
  const last = pts[pts.length - 1].close;
  const change = last - first;
  const rate = first > 0 ? change / first : 0;
  const color = changeColor(change);

  const chartConfig = { close: { label: "종가", color } } satisfies ChartConfig;

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">시세</p>
        <p className="text-sm font-semibold tabular-nums" style={{ color }}>
          {signedWon(change)} ({signedPct(rate, 2)})
        </p>
      </div>

      <ChartContainer config={chartConfig} className="mt-3 aspect-auto h-44 w-full">
        <ComposedChart data={pts} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis
            yAxisId="price"
            hide
            scale={logScale ? "log" : "linear"}
            domain={[domLow, domHigh]}
            allowDataOverflow
          />
          {/* 거래량 축 — 막대를 하단 ~25%에 가두려 도메인을 4배로(저채도 보조). */}
          {hasVolume && (
            <YAxis yAxisId="vol" hide domain={[0, maxVol * 4]} />
          )}
          <ChartTooltip
            cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            content={<OhlcvTooltip />}
          />
          {hasAvg && (
            <ReferenceLine
              yAxisId="price"
              y={avgCost!}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: `평단 ${won(avgCost!)}`,
                position: "insideTopLeft",
                fill: "var(--muted-foreground)",
                fontSize: 11,
              }}
            />
          )}
          {hasVolume && (
            <Bar
              yAxisId="vol"
              dataKey="volume"
              fill="var(--muted-foreground)"
              opacity={0.18}
              isAnimationActive={false}
            />
          )}
          <Line
            yAxisId="price"
            dataKey="close"
            type="monotone"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: color, stroke: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>

      <div className="mt-1 text-center text-xs text-muted-foreground tabular-nums">
        최고 {won(periodHigh)} · 최저 {won(periodLow)}
        {logScale && <span className="ml-1.5">· 로그 스케일</span>}
      </div>

      {/* 기간 칩 — 이미 받은 일봉/월봉에서 클라이언트가 잘라 표시(추가 요청 없음).
          5년·최대는 월봉(데이터 가벼움), 그 외는 일봉. 데이터 없는 구간은 위에서 제외됨. */}
      <div className="mt-4 flex gap-2">
        {ranges.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            className={
              "flex-1 rounded-lg py-1.5 text-xs font-semibold transition " +
              (r.key === active.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground")
            }
          >
            {r.key}
          </button>
        ))}
      </div>
    </section>
  );
}
