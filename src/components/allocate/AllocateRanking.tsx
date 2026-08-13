"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { pct } from "@/lib/format";
import { valuationApplies } from "@/lib/finance/expectedReturn";
import { groupRanked, targetGap, type RankedRow } from "@/lib/allocateRanking";
import { STATUS_META } from "./statusMeta";

/**
 * 자본배분 순위 — PRD v0.3 §6.1·§11.
 *
 * 이 화면은 **보기만 한다.** 금액 입력·계산·설정은 전부 다른 화면으로 갔다
 * (`docs/design-strategy-v1.md` §4 "한 화면 한 가지 일").
 *
 * ## 개별주와 ETF 를 옆으로 넘긴다
 *
 * 둘은 **정렬 기준이 다르다** — 주식은 기대수익률, ETF 는 목표 미달. 한 층에 이어 붙이면
 * 스크롤이 길어지고 지금 어느 기준으로 보는 중인지 흐려진다. **한 번에 한 기준만** 보이게
 * 옆으로 넘긴다.
 *
 * 두 가지를 지킨다.
 *   · 각 장이 **자기 정렬 기준을 라벨로 밝힌다** ("기대수익률 순" / "목표 미달 순")
 *   · 번호는 **장마다 1번부터** — 이어붙이면 "ETF 10번이 주식 9번보다 후순위"라는 뜻이
 *     되는데, 기준이 다르니 그런 비교는 성립하지 않는다
 *
 * 구현은 **CSS scroll-snap** 이다 — 라이브러리를 더하지 않고 모바일 관성 스크롤이 그대로
 * 산다(§5 "과한 연출 금지"). JS 는 두 가지만 한다: 지금 몇 번째 장인지 표시, 탭을 누르면
 * 그 장으로 이동. 스와이프를 모르는 사람도 탭으로 갈 수 있어야 한다.
 *
 * 순위 계산은 `src/lib/allocateRanking.ts` 가 한다.
 */
export function AllocateRanking({ ranked }: { ranked: RankedRow[] }) {
  const { stocks, others } = groupRanked(ranked);

  const pages = [
    {
      key: "stocks",
      label: "주식",
      rows: stocks,
      basis: "기대수익률 순",
      note: null as string | null,
    },
    {
      key: "others",
      label: "ETF · 기타",
      rows: others,
      basis: "목표 미달 순",
      note: "기대수익률 모형을 쓸 수 없어 목표비중으로만 판단해요",
    },
  ].filter((p) => p.rows.length > 0);

  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  if (pages.length === 0) return null;

  // 한 장뿐이면 넘길 것이 없다 — 탭도 가로 스크롤도 만들지 않는다.
  if (pages.length === 1) {
    return (
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold">살 곳 순위</p>
          <p className="text-[11px] text-muted-foreground">{pages[0].basis}</p>
        </div>
        {pages[0].note && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {pages[0].note}
          </p>
        )}
        <RankList rows={pages[0].rows} />
      </section>
    );
  }

  function goTo(i: number) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">살 곳 순위</p>
        <div className="flex gap-1 rounded-lg bg-secondary p-0.5">
          {pages.map((p, i) => (
            <button
              key={p.key}
              type="button"
              onClick={() => goTo(i)}
              aria-current={active === i}
              className={
                "rounded-md px-2.5 py-1 text-[11px] font-semibold transition " +
                (active === i
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground")
              }
            >
              {p.label} {p.rows.length}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth <= 0) return;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== active) setActive(i);
        }}
        className="-mx-1 flex snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((p) => (
          <div key={p.key} className="w-full shrink-0 snap-start px-1">
            <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
              {p.basis}
            </p>
            {p.note && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {p.note}
              </p>
            )}
            {/* 번호는 장마다 1번부터 — 기준이 다른 둘을 이어 세면 비교 가능한 척이 된다. */}
            <RankList rows={p.rows} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** 순위 목록 한 덩어리. 번호는 이 묶음 안에서 1번부터 센다. */
function RankList({ rows }: { rows: RankedRow[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-0.5">
      {rows.map((ranked, i) => {
        const { row, leg } = ranked;
        const meta = STATUS_META[leg.status];
        const buyable = leg.status === "BUY" || leg.status === "STRETCH";
        return (
          <li key={row.key}>
            <Link
              href={`/stocks/${row.symbol}`}
              className={
                "flex items-center gap-3 rounded-xl px-2 py-2.5 transition active:scale-[0.99] " +
                (buyable ? "" : "opacity-60")
              }
            >
              <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <SymbolAvatar symbol={row.symbol} name={row.label} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{row.label}</p>
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  {pct(leg.currentWeight)} → 목표 {pct(leg.targetWeight)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {row.expectedCagr != null ? (
                  <p className="text-sm font-bold tabular-nums">
                    {pct(row.expectedCagr)}
                  </p>
                ) : valuationApplies(row.assetType) ? (
                  // 주식인데 비어 있으면 "넣어야 하는데 안 넣은" 것이다.
                  <p className="text-xs text-muted-foreground">가정 없음</p>
                ) : (
                  // ETF·기타는 이 묶음의 정렬 근거(목표 미달)를 그대로 보여준다.
                  // 빈칸으로 두면 왜 이 순서인지 알 수 없다.
                  <p className="text-sm font-bold tabular-nums">
                    {gapLabel(targetGap(ranked))}
                  </p>
                )}
                <span
                  className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold ${meta.tone}`}
                >
                  {meta.label}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** 목표 미달을 %p 로. 이미 넘겼으면 부호를 붙여 "초과"임을 드러낸다. */
function gapLabel(gap: number): string {
  if (Math.abs(gap) < 0.0001) return "목표 도달";
  return `${gap > 0 ? "−" : "+"}${pct(Math.abs(gap))}`;
}
