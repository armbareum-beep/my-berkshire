"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/format";
import { TypeTargetList, type TypeTargetRow } from "./TypeTargetList";

/** 세 각도에서 본 같은 하나의 진실. 서버에서 만들어 넘긴다. */
export interface LensRows {
  assetType: TypeTargetRow[];
  country: TypeTargetRow[];
  sector: TypeTargetRow[];
}

const TABS = [
  {
    key: "assetType",
    label: "유형",
    heading: "투자자산 100%를 나눠요",
    note: null,
  },
  {
    key: "country",
    label: "국가",
    heading: "국가별로는 이렇게 갈려 있어요",
    note: "국가 비중은 따로 정하지 않아요 — 종목 비중을 바꾸면 따라옵니다. 줄을 누르면 그 나라 종목으로 갑니다.",
  },
  {
    key: "sector",
    label: "산업",
    heading: "산업별로는 이렇게 갈려 있어요",
    note: "산업 태그는 공시에서 채웁니다. 아직 못 채운 종목은 미분류로 묶여요.",
  },
] as const;

/**
 * 목표 비중을 **세 각도로** 보는 1단계 패널.
 *
 * ## 왜 국가·산업 탭이 생겼나
 *
 * 사용자 지적: *"국가별, 산업별 비중 구하는 건 왜 없어?"* 맞다. 국가·산업 비중은 주식
 * 안으로 들어가야만(`/allocation/financial/주식?by=country`) 보였다. 그런데 그건 **주식
 * 안에서의** 국가 비중이라 "내 자산의 몇 %가 미국인가"에는 답하지 못한다 — 미국 ETF 가
 * 빠지기 때문이다. 전체를 가로질러 묶어 보는 자리가 없었던 것이다.
 *
 * ## 왜 여기선 국가·산업을 **못 고치나**
 *
 * 바로 앞 커밋에서 *"비중 바꾸는 곳이 너무 많다"* 는 지적을 받고 조절 자리를 둘로 줄였다.
 * 여기에 국가 입력칸을 또 놓으면 그걸 되돌리는 셈이다. 그리고 그건 취향 문제가 아니다 —
 * 저장되는 값은 **종목 목표 하나뿐**이고 유형·국가·산업은 그걸 묶어 보는 렌즈다(#70).
 * 렌즈를 직접 밀면 구성 종목이 비례로 끌려가므로, 유형 45% 와 국가 60% 를 각각 정하는
 * 순간 서로를 덮어쓴다.
 *
 * ```text
 *                      ┌─ 유형 렌즈 ─ 여기서 정한다 (입력칸)
 *   종목 평면 목표비중 ─┼─ 국가 렌즈 ─ 결과로 본다  (읽기 전용 → 줄을 눌러 종목으로)
 *   (유일한 저장값)     └─ 산업 렌즈 ─ 결과로 본다
 * ```
 *
 * 그래서 국가·산업 줄은 **읽고, 눌러서 들어간다.** 고치는 건 그 안의 종목 줄에서 한다.
 */
export function TargetLensPanel({
  rows,
  currency,
}: {
  rows: LensRows;
  currency: Currency;
}) {
  const [tab, setTab] = useState<keyof LensRows>("assetType");
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="flex flex-col gap-3">
      <nav className="flex gap-1 rounded-xl bg-secondary p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-center text-sm font-semibold transition",
              tab === t.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <TypeTargetList
        rows={rows[tab]}
        currency={currency}
        heading={active.heading}
      />

      {active.note && (
        <p className="px-2 text-xs leading-relaxed text-muted-foreground">
          {active.note}
        </p>
      )}
    </div>
  );
}
