"use client";

import { useState } from "react";
import { Pie, PieChart, Sector, Tooltip } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { money, pct, type Currency } from "@/lib/format";
import { donutColor } from "./donutPalette";

/**
 * 자산배분 도넛 차트 — shadcn/recharts.
 * 호버하면 (1) 그 조각이 살짝 커지고, (2) 커서 옆에 툴팁(라벨·비중·금액)이 뜨고,
 * (3) 도넛 **가운데**에도 그 조각 정보가 표시된다.
 * 호버를 떼도 가운데는 **마지막에 본 조각**을 유지(기본=가장 큰 비중).
 * 범례 색(donutColor)과 인덱스로 일치.
 */

interface DonutSlice {
  label: string;
  weight: number; // 0~1
  value?: number; // 금액(있으면 툴팁에 표시)
}

interface FilledSlice extends DonutSlice {
  fill: string;
}

/** 커서 옆 툴팁 — 라벨 · 비중(· 금액). recharts 가 active/payload 주입. */
function DonutTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: { payload: FilledSlice }[];
  currency: Currency;
}) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <span className="flex items-center gap-1.5">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: s.fill }}
        />
        <span className="font-medium">{s.label}</span>
      </span>
      <span className="mt-0.5 block tabular-nums text-muted-foreground">
        {pct(s.weight)}
        {s.value != null ? ` · ${money(s.value, currency)}` : ""}
      </span>
    </div>
  );
}

export function Donut({
  slices,
  size = 168,
  thickness = 26,
  currency = "KRW",
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  currency?: Currency;
}) {
  // 호버 중인 조각(슬라이스 팝업·툴팁용) / 마지막에 본 조각(가운데 라벨 유지용).
  const [active, setActive] = useState<number | null>(null);
  const [lastIdx, setLastIdx] = useState<number | null>(null);

  if (slices.length === 0) return null;

  // 색을 데이터에 실어 보냄 → 슬라이스 채움·중앙 라벨·툴팁 색이 범례(donutColor(i))와 일치.
  const data: FilledSlice[] = slices.map((s, i) => ({
    ...s,
    fill: donutColor(i),
  }));

  // 강조 조각이 SVG 밖으로 안 나가게 바깥 반지름에 여유(+5 팝업분).
  const outer = size / 2 - 6;
  const inner = outer - thickness;

  // 기본(아직 안 본 상태) = 가장 큰 비중.
  const defaultIdx = data.reduce(
    (mi, s, i, arr) => (s.weight > arr[mi].weight ? i : mi),
    0,
  );
  // 가운데 = 호버 중 조각 → 없으면 마지막에 본 조각 → 없으면 기본. 범위 밖이면 기본으로.
  const rawIdx = active ?? lastIdx ?? defaultIdx;
  const shown = data[rawIdx] ?? data[defaultIdx];

  // 호버/탭으로 한 조각에 포커스 — 가운데도 그 조각을 "기억".
  const focus = (i: number) => {
    setActive(i);
    setLastIdx(i);
  };

  const config = {} satisfies ChartConfig;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ChartContainer config={config} className="absolute inset-0 aspect-square">
        <PieChart>
          <Tooltip
            content={<DonutTooltip currency={currency} />}
            // 작은 도넛 박스 밖으로 새어 나가도 잘리지 않게.
            allowEscapeViewBox={{ x: true, y: true }}
            wrapperStyle={{ zIndex: 50, outline: "none" }}
            isAnimationActive={false}
          />
          <Pie
            data={data}
            dataKey="weight"
            nameKey="label"
            innerRadius={inner}
            outerRadius={outer}
            // 위(12시)에서 시작해 시계방향(기존 SVG 와 동일).
            startAngle={90}
            endAngle={-270}
            stroke="var(--card)"
            strokeWidth={2}
            // 호버한 조각만 살짝 커지게(데스크탑 피드백).
            activeShape={(props) => (
              <Sector {...props} outerRadius={(props.outerRadius ?? outer) + 5} />
            )}
            onMouseEnter={(_, i) => focus(i)}
            onMouseLeave={() => setActive(null)}
            // 모바일 PWA — 탭하면 그 조각으로 갱신(onMouseEnter 는 터치서 불안정).
            onClick={(_, i) => {
              setLastIdx(i);
              setActive((cur) => (cur === i ? null : i));
            }}
            isAnimationActive={false}
          />
        </PieChart>
      </ChartContainer>

      {/* 가운데 라벨 — 호버/마지막 조각. 도넛 구멍 안이라 절대 안 잘림. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <span className="flex w-full items-center gap-1.5 overflow-hidden">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: shown.fill }}
          />
          <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
            {shown.label}
          </span>
        </span>
        <span className="text-xl font-extrabold tabular-nums tracking-tight">
          {pct(shown.weight)}
        </span>
      </div>
    </div>
  );
}
