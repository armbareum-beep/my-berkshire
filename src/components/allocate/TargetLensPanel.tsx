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
    heading: "국가별로 나눠요",
    note: "국가를 바꾸면 그 나라 종목들이 비례로 움직여요 — 미국 ETF도 같이 커지므로 유형 비중이 따라 바뀝니다.",
  },
  {
    key: "sector",
    label: "산업",
    heading: "산업별로 나눠요",
    note: "산업을 바꾸면 그 산업 종목들이 비례로 움직여요. 산업 태그는 공시에서 채우고, 아직 못 채운 건 미분류로 묶여요.",
  },
] as const;

/**
 * 목표 비중을 **세 각도로** 정하는 1단계 패널.
 *
 * ## 왜 국가·산업 탭이 생겼나
 *
 * 사용자 지적: *"국가별, 산업별 비중 구하는 건 왜 없어?"* 국가·산업 비중은 주식 안으로
 * 들어가야만(`/allocation/financial/주식?by=country`) 보였다. 그런데 그건 **주식 안에서의**
 * 국가 비중이라 "내 자산의 몇 %가 미국인가"에는 답하지 못한다 — 미국 ETF 가 빠지기
 * 때문이다. 전체를 가로질러 묶는 자리가 없었던 것이다.
 *
 * ## 세 축 모두 **여기서 바로 고친다**
 *
 * 처음엔 국가·산업을 읽기 전용으로 냈다. *"국가별 산업별은 왜 바로 바꿀 수 없냐니까?"* —
 * 잘못 읽은 것이다. 사람이 하는 판단은 *"미국을 60%까지 올리자"* 이지 *"미국이 55%가
 * 되도록 META 와 NVDA 를 각각 얼마로 맞추자"* 가 아니다. 그걸 종목 단위로 환산하는 건
 * **코드가 할 일**이고, 실제로 `scaleGroupTarget` 이 이미 그 일을 한다.
 *
 * ```text
 *                      ┌─ 유형 렌즈 ─┐
 *   종목 평면 목표비중 ─┼─ 국가 렌즈 ─┼─ 셋 다 여기서 민다 → 구성 종목이 비례로 따라간다
 *   (유일한 저장값)     └─ 산업 렌즈 ─┘
 * ```
 *
 * ## 축이 서로를 움직인다 — 숨기지 않는다
 *
 * 저장되는 값은 종목 목표 하나뿐이라(#70), 미국을 60% 로 밀면 미국 ETF 목표도 같이 커져
 * **유형 비중이 따라 바뀐다.** 이건 버그가 아니라 렌즈 모형의 성질이다 — 축이 셋이어도
 * 진실은 하나라서, 한 축을 밀면 나머지 축에서 본 그림도 바뀐다.
 *
 * 그래서 두 가지를 한다. 탭마다 그 사실을 한 줄로 밝히고(`TABS.note`), 저장은 **한 번에
 * 되돌릴 수 있게** 한다(`restoreTargets`) — 여러 종목이 동시에 움직이므로 하나씩 되돌리게
 * 하면 안 된다.
 *
 * 못 미는 줄은 둘뿐이다 — **현금**(목표를 안 채운 나머지라 정의상 결과값)과
 * **기타·미분류**(구성이 유동적이라 밀면 엉뚱한 종목이 딸려간다).
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

      {/* 저장이 어느 축으로 가는지는 지금 열린 탭이 정한다 — 하드코딩하면 국가 줄을
          고쳤는데 유형 묶음이 바뀐다. */}
      <TypeTargetList
        rows={rows[tab]}
        currency={currency}
        heading={active.heading}
        lens={tab}
      />

      {active.note && (
        <p className="px-2 text-xs leading-relaxed text-muted-foreground">
          {active.note}
        </p>
      )}
    </div>
  );
}
