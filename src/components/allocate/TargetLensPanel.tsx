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
    note: "유형을 바꾸면 같은 나라 안에서 주식↔ETF가 맞바뀌어요 — 국가 비중과 현금은 그대로예요.",
  },
  {
    key: "country",
    label: "국가",
    heading: "국가별로 나눠요",
    note: "국가를 바꾸면 같은 유형의 다른 나라에서 가져와요 — 유형 비중과 현금은 그대로예요.",
  },
  {
    key: "sector",
    label: "산업",
    heading: "산업별로 나눠요",
    note: "산업을 바꾸면 같은 유형의 다른 산업에서 가져와요. 산업 태그는 공시에서 채우고, 아직 못 채운 건 미분류로 묶여요.",
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
 * ## 축은 서로를 움직이지 않는다 — "축 고정"
 *
 * 처음엔 늘어난 몫을 현금에서 가져왔다. 그러면 미국을 밀 때 미국 ETF 목표도 같이 커져
 * **유형 비중이 따라 움직였다.** 사용자 지적: *"유형 국가 산업이 모두 연동되어 있어?
 * 연동 안 되게 하는 건 어때?"*
 *
 * 이제 **고정 축의 같은 칸에 있는 다른 종목**에서 가져온다(`lib/targetLens.ts:scaleGroupLocked`).
 *
 * ```text
 *   미국 50% → 60%
 *     주식 칸: META 30→36  ⇄  삼성 15→9      (주식 합 45% 그대로)
 *     ETF  칸: SPY  20→24  ⇄  KODEX 10→6     (ETF  합 30% 그대로)
 * ```
 *
 * 세 축을 따로 저장해서 푸는 길은 없다 — 같은 종목을 세 번 세는 것이라 서로 모순될 수
 * 있고(미국 보유가 전부 주식인데 "주식 45% · 미국 60%"), 그러면 엔진이 하나만 따르고
 * 나머지는 장식이 된다. **저장은 여전히 종목 목표 하나뿐이고, 바뀐 건 "부족분을 어디서
 * 가져오는가"뿐이다.**
 *
 * 상계할 곳이 없으면(한국에 ETF 가 없는 경우) 요청대로 옮기되 **깨진 만큼을 토스트로
 * 말한다.** 조용히 덜 옮기면 요청한 60% 가 안 되고, 조용히 다 가져가면 고정이 깨진 걸
 * 모른다.
 *
 * 저장은 **한 번에 되돌릴 수 있게** 한다(`restoreTargets`) — 여러 종목이 동시에 움직이므로
 * 하나씩 되돌리게 하면 안 된다.
 *
 * ## 현금이 편집 가능해진 이유
 *
 * 고정을 켜면 어느 묶음을 밀어도 현금이 안 움직인다. 그게 고정의 정의인데, 그러면 **현금
 * 수준을 바꿀 길이 사라진다** — 예전엔 다른 줄을 밀어 간접으로 조절했기 때문이다. 그래서
 * 현금 줄을 열었다. 밀면 종목 전체가 같은 비율로 움직여 세 축의 상대 모양이 전부 보존된다.
 *
 * 못 미는 줄은 **기타·미분류**뿐이다 — 구성이 유동적이라 밀면 엉뚱한 종목이 딸려간다.
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
