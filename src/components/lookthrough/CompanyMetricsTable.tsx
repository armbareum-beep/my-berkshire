"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { moneyShort, pct, type Currency } from "@/lib/format";
import type { LookThroughLeg } from "@/lib/finance/lookThrough";

/**
 * 내 지분 실적 — 내가 소유한 사업체(한국·미국 주식)를 한 표에서 비교.
 * 기여(내 몫 순이익·비중) + 밸류에이션(PER/PBR/ROE/순이익률)을 합쳐 한 화면에.
 * 가로 슬라이드 없이 480px 폭에 맞도록 table-fixed 로 열 너비 고정 — 한눈에 비교.
 * 엑셀 조건부 서식식 틴트: 각 지표 열에서 우수한 칸일수록 토스블루 배경이 진해짐
 * (PER·PBR=낮을수록, ROE·순이익률=높을수록 우수). 색은 단일 액센트만(디자인 토큰 원칙).
 * 헤더 클릭 정렬(같은 키 재클릭 시 방향 토글) + 이름 검색. 비율은 통화 무관, 내 몫·보유만 환율 변환.
 * 정렬·필터·틴트는 서버에서 받은 legs 만 클라이언트에서 처리(추가 요청 없음).
 */

// "mine"(내 몫 순이익=기여)는 기본 정렬값 — 헤더 열은 아니지만 초기 순서로 사용.
type SortKey = "name" | "mine" | "per" | "pbr" | "roe" | "netMargin" | "value";
type MetricKey = "per" | "pbr" | "roe" | "netMargin";
type Dir = "asc" | "desc";

const mult = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toFixed(1)}배`;
const pctOrDash = (n: number | null | undefined) => (n == null ? "—" : pct(n));

type Col = {
  key: SortKey;
  label: string;
  w: string;
  metric?: MetricKey;
  better?: "low" | "high"; // 우수 방향
  fmt: (n: number | null | undefined) => string;
};

const COLS: Col[] = [
  { key: "name", label: "사업부", w: "w-[32%]", fmt: () => "" },
  { key: "per", label: "PER", w: "w-[14%]", metric: "per", better: "low", fmt: mult },
  { key: "pbr", label: "PBR", w: "w-[13%]", metric: "pbr", better: "low", fmt: mult },
  { key: "roe", label: "ROE", w: "w-[14%]", metric: "roe", better: "high", fmt: pctOrDash },
  { key: "netMargin", label: "순이익", w: "w-[14%]", metric: "netMargin", better: "high", fmt: pctOrDash },
  { key: "value", label: "보유", w: "w-[13%]", fmt: () => "" },
];

const METRIC_COLS = COLS.filter((c): c is Col & { metric: MetricKey; better: "low" | "high" } => !!c.metric);

/** 숫자 정렬값(없으면 null → 항상 뒤로). */
function numOf(leg: LookThroughLeg, key: SortKey): number | null {
  switch (key) {
    case "mine":
      return leg.netIncomeMine ?? null;
    case "per":
      return leg.per ?? null;
    case "pbr":
      return leg.pbr ?? null;
    case "roe":
      return leg.roe ?? null;
    case "netMargin":
      return leg.netMargin ?? null;
    default:
      return leg.value; // value
  }
}

function makeCmp(key: SortKey, dir: Dir) {
  return (a: LookThroughLeg, b: LookThroughLeg) => {
    if (key === "name") {
      return dir === "asc"
        ? a.name.localeCompare(b.name, "ko")
        : b.name.localeCompare(a.name, "ko");
    }
    const av = numOf(a, key);
    const bv = numOf(b, key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // 널은 항상 뒤로
    if (bv == null) return -1;
    return dir === "asc" ? av - bv : bv - av;
  };
}

/**
 * 열별 우수도 점수(0~1) — 순위 기반 정규화. 이상치 한 종목이 그라데이션을 독식하지 않게
 * 값이 아닌 순위로 균등 분배. 최우수=1.0, 최하=0. 비-null 2개 이상일 때만(1개는 비교 무의미).
 */
function scoreMap(legs: LookThroughLeg[], metric: MetricKey, better: "low" | "high") {
  const vals = legs
    .map((l) => ({ sym: l.symbol, v: numOf(l, metric) }))
    .filter((x): x is { sym: string; v: number } => x.v != null);
  const m = new Map<string, number>();
  const n = vals.length;
  if (n < 2) return m;
  const sorted = [...vals].sort((a, b) => a.v - b.v); // 오름차순(낮은 값 먼저)
  sorted.forEach((x, i) => {
    const frac = i / (n - 1); // 0(최저값) ~ 1(최고값)
    m.set(x.sym, better === "high" ? frac : 1 - frac);
  });
  return m;
}

export function CompanyMetricsTable({
  legs,
  factor,
  currency,
  summary,
}: {
  legs: LookThroughLeg[];
  factor: number;
  currency: Currency;
  /** 연결(가중) 비율 — leg만으론 못 구하는 값(자본·매출 합 필요). 페이지가 lt 에서 전달. */
  summary: Record<MetricKey, number | null>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("mine"); // 기본=기여순
  const [dir, setDir] = useState<Dir>("desc");
  const [query, setQuery] = useState("");

  // 정렬 키 누르면: 같은 키 → 방향 토글, 다른 키 → 그 키로(이름은 오름차순, 나머진 내림차순 기본).
  function pick(k: SortKey) {
    if (k === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setDir(k === "name" ? "asc" : "desc");
    }
  }

  const totalMine = legs.reduce((s, l) => s + (l.netIncomeMine ?? 0), 0);
  const totalValue = legs.reduce((s, l) => s + l.value, 0);
  const m = (v: number) => moneyShort(v * factor, currency);

  // 열별 틴트 점수 — legs 기준(정렬·검색과 무관하게 전체 모집단에서 산출).
  const scores = useMemo(() => {
    const out = {} as Record<MetricKey, Map<string, number>>;
    for (const c of METRIC_COLS) out[c.metric] = scoreMap(legs, c.metric, c.better);
    return out;
  }, [legs]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...legs]
      .filter((l) => (q ? l.name.toLowerCase().includes(q) : true))
      .sort(makeCmp(sortKey, dir));
  }, [legs, query, sortKey, dir]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        inputMode="search"
        placeholder="사업부 이름 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <table className="w-full table-fixed border-collapse text-xs tabular-nums">
        <colgroup>
          {COLS.map((c) => (
            <col key={c.key} className={c.w} />
          ))}
        </colgroup>
        <thead>
          <tr className="text-muted-foreground">
            {COLS.map((c, i) => {
              const active = c.key === sortKey;
              const left = i === 0;
              return (
                <th
                  key={c.key}
                  className={
                    (left ? "pr-2 text-left" : "pl-1 text-right") +
                    " py-1.5 font-medium"
                  }
                >
                  <button
                    type="button"
                    onClick={() => pick(c.key)}
                    className={
                      "max-w-full truncate transition " +
                      (active ? "font-semibold text-foreground" : "")
                    }
                  >
                    {c.label}
                    {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const mine = l.netIncomeMine ?? 0;
            const share = totalMine > 0 ? mine / totalMine : 0;
            return (
              <tr key={l.symbol} className="border-t border-border/60 align-top">
                {/* 사업부 — 이름(긴 것 2줄) + 기여 보조 줄(내 몫·비중) */}
                <th scope="row" className="py-2.5 pr-2 text-left font-medium">
                  <span className="line-clamp-2 break-keep">{l.name}</span>
                  <span className="block truncate text-[10px] font-normal text-muted-foreground">
                    내 몫 {m(mine)} · {pct(share)}
                  </span>
                </th>
                {/* 지표 열 — 우수할수록 토스블루 틴트가 진해짐 */}
                {METRIC_COLS.map((c) => {
                  const score = scores[c.metric].get(l.symbol);
                  const best = score === 1;
                  const bg =
                    score != null && score > 0
                      ? `color-mix(in srgb, var(--primary) ${Math.round(score * 16)}%, transparent)`
                      : undefined;
                  return (
                    <td
                      key={c.key}
                      className={
                        "py-2.5 pl-1 text-right text-foreground " +
                        (best ? "font-semibold" : "")
                      }
                      style={bg ? { backgroundColor: bg } : undefined}
                    >
                      {c.fmt(numOf(l, c.key))}
                    </td>
                  );
                })}
                {/* 보유 — 품질 지표 아님, 틴트 없이 보조색 */}
                <td className="py-2.5 pl-1 text-right text-muted-foreground">
                  {m(l.value)}
                </td>
              </tr>
            );
          })}
        </tbody>
        {legs.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <th scope="row" className="py-2.5 pr-2 text-left">
                <span className="block">연결 합계</span>
                <span className="block truncate text-[10px] font-normal text-muted-foreground">
                  내 몫 {m(totalMine)}
                </span>
              </th>
              {METRIC_COLS.map((c) => (
                <td key={c.key} className="py-2.5 pl-1 text-right text-foreground">
                  {c.fmt(summary[c.metric])}
                </td>
              ))}
              <td className="py-2.5 pl-1 text-right text-muted-foreground">
                {m(totalValue)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          검색 결과가 없어요.
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          칸 배경이 진할수록 그 지표에서 우수해요 · PER·PBR은 낮을수록, ROE·순이익률은
          높을수록 좋아요.
        </p>
      )}
    </div>
  );
}
