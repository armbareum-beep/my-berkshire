"use client";

import { useState } from "react";
import { pct } from "@/lib/format";

const PALETTE = [
  "#3B82F6",
  "#8B5CF6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#06B6D4",
  "#F97316",
  "#6366F1",
];

export interface ChartSlice {
  name: string;
  weight: number;
}

export interface ChartDatasets {
  etfShare: ChartSlice[];
  sector: ChartSlice[];
  region: ChartSlice[];
  assetType: ChartSlice[];
}

type TabKey = keyof ChartDatasets;

const TABS: { key: TabKey; label: string }[] = [
  { key: "etfShare", label: "ETF" },
  { key: "sector", label: "섹터" },
  { key: "region", label: "지역" },
  { key: "assetType", label: "자산" },
];

// ── SVG helpers ──────────────────────────────────────────────
function polarXY(cx: number, cy: number, r: number, a: number) {
  return { x: cx + r * Math.cos(a - Math.PI / 2), y: cy + r * Math.sin(a - Math.PI / 2) };
}

function arcPath(cx: number, cy: number, or_: number, ir: number, a0: number, a1: number) {
  const o1 = polarXY(cx, cy, or_, a0);
  const o2 = polarXY(cx, cy, or_, a1);
  const i1 = polarXY(cx, cy, ir, a1);
  const i2 = polarXY(cx, cy, ir, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${or_} ${or_} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${ir} ${ir} 0 ${large} 0 ${i2.x} ${i2.y}`,
    "Z",
  ].join(" ");
}

function groupSmall(slices: ChartSlice[], threshold = 0.03): ChartSlice[] {
  const main = slices.filter((s) => s.weight >= threshold);
  const rest = slices.filter((s) => s.weight < threshold);
  if (!rest.length) return main;
  return [...main, { name: "기타", weight: rest.reduce((s, o) => s + o.weight, 0) }];
}

// ── Component ─────────────────────────────────────────────────
export function EtfDonutChart({ datasets }: { datasets: ChartDatasets }) {
  const [tab, setTab] = useState<TabKey>("etfShare");
  const [active, setActive] = useState<number | null>(null);

  const rawSlices = datasets[tab];
  const slices = groupSmall(rawSlices).map((s, i) => ({
    ...s,
    color: PALETTE[i % PALETTE.length],
  }));

  const GAP = 0.015;
  const CX = 100, CY = 100, OR = 80, IR = 54;
  // 시작각 = 앞선 조각들의 누적 비중(재할당 없이 순수 계산 — 조각 수가 적어 O(n²) 무방).
  const starts = slices.map((_, i) =>
    slices.slice(0, i).reduce((sum, p) => sum + p.weight * 2 * Math.PI, 0),
  );
  const segments = slices.map((s, i) => {
    const span = Math.max(s.weight * 2 * Math.PI - GAP, 0.001);
    const a0 = starts[i] + GAP / 2;
    const a1 = a0 + span;
    return { ...s, path: arcPath(CX, CY, OR, IR, a0, a1), index: i };
  });

  const activeSlice = active !== null ? slices[active] ?? null : null;
  const tabLabel = TABS.find((t) => t.key === tab)?.label ?? "";

  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      {/* Tab row */}
      <div className="mb-5 flex gap-1 rounded-xl bg-secondary p-1">
        {TABS.map(({ key, label }) => {
          const empty = datasets[key].length === 0;
          return (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                setActive(null);
              }}
              disabled={empty}
              className={[
                "flex-1 rounded-lg py-1.5 text-xs font-medium transition",
                tab === key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground disabled:opacity-30",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>

      {slices.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">데이터 없음</p>
      ) : (
        <>
          {/* Donut */}
          <div className="mx-auto w-44">
            <svg viewBox="0 0 200 200" className="w-full text-foreground">
              {segments.map((seg) => (
                <path
                  key={seg.index}
                  d={seg.path}
                  fill={seg.color}
                  opacity={active === null || active === seg.index ? 1 : 0.35}
                  className="cursor-pointer transition-opacity duration-150"
                  onClick={() => setActive(active === seg.index ? null : seg.index)}
                />
              ))}
              {activeSlice ? (
                <>
                  <text
                    x="100"
                    y="93"
                    textAnchor="middle"
                    fontSize="10"
                    fill="currentColor"
                    opacity={0.6}
                  >
                    {activeSlice.name.length > 9
                      ? activeSlice.name.slice(0, 9) + "…"
                      : activeSlice.name}
                  </text>
                  <text
                    x="100"
                    y="113"
                    textAnchor="middle"
                    fontSize="18"
                    fontWeight="700"
                    fill="currentColor"
                  >
                    {pct(activeSlice.weight)}
                  </text>
                </>
              ) : (
                <text
                  x="100"
                  y="107"
                  textAnchor="middle"
                  fontSize="12"
                  fill="currentColor"
                  opacity={0.45}
                >
                  {tabLabel}
                </text>
              )}
            </svg>
          </div>

          {/* Legend */}
          <ul className="mt-4 space-y-2.5">
            {slices.map((s, i) => (
              <li
                key={i}
                className="flex cursor-pointer items-center justify-between"
                onClick={() => setActive(active === i ? null : i)}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span
                    className={`truncate text-sm ${active === i ? "font-semibold" : "text-foreground"}`}
                  >
                    {s.name}
                  </span>
                </div>
                <span className="ml-2 shrink-0 text-sm tabular-nums text-muted-foreground">
                  {pct(s.weight)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
