"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/format";
import { TypeTargetList, type TypeTargetRow } from "./TypeTargetList";

/** 두 각도에서 본 같은 하나의 진실. 서버에서 만들어 넘긴다. */
export interface LensRows {
  assetType: TypeTargetRow[];
  country: TypeTargetRow[];
}

const TABS = [
  {
    key: "assetType",
    label: "유형",
    heading: "증권 100%를 나눠요",
    note: "유형을 바꾸면 같은 나라 안에서 주식↔ETF가 맞바뀌어요 — 국가 비중은 그대로예요. 현금은 목표가 아니라, 안 채운 만큼 남는 결과예요.",
  },
  {
    key: "country",
    label: "국가",
    heading: "국가별로 나눠요",
    note: "국가를 바꾸면 같은 유형의 다른 나라에서 가져와요 — 유형 비중은 그대로예요.",
  },
  // 산업 탭은 뺐다 — 사용자 지적: *"ETF는 산업별이 다 미분류로 되어 있으니까."*
  // 산업 태그는 공시(DART/EDGAR)에서 개별 기업 단위로만 채워진다. ETF·코인·원자재는
  // 애초에 조회 대상이 아니라, 그 비중이 큰 사람에게 산업 탭은 "미분류 70%" 한 덩어리다.
  // 묶음으로 밀 수도 없다(`isUntaggedLabel` 이 미분류를 막는다) — 볼 수도 정할 수도 없는
  // 탭인 셈이라 자리만 차지했다.
  //
  // 산업으로 보는 건 **주식 안에서**는 여전히 된다(`/allocation/financial/주식?by=sector`).
  // 거기선 조회 대상이 전부 개별 기업이라 태그가 실제로 채워진다.
] as const;

/**
 * 목표 비중을 **두 각도로**(유형·국가) 정하는 1단계 패널.
 *
 * ## 왜 국가 탭이 생겼나
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
 *   종목 평면 목표비중 ─┴─ 국가 렌즈 ─┴─ 둘 다 여기서 민다 → 구성 종목이 비례로 따라간다
 *   (유일한 저장값)
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
 * 두 축을 따로 저장해서 푸는 길은 없다 — 같은 종목을 두 번 세는 것이라 서로 모순될 수
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
 * ## 현금은 목록에 없다
 *
 * 분모는 **배분 대상 증권**이다. 현금을 한 줄로 끼워 두면 분모가 커져 현금 비중이 실제보다
 * 부풀려 보이고, 무엇보다 엔진은 처음부터 증권만으로 나누고 있어 화면과 저장이 어긋났다.
 * 얼마를 현금으로 둘지는 **2단계(넣을 금액)** 가 정한다.
 *
 * 고정을 켜면 합이 안 변하므로, 합이 100% 가 아닐 때만 목록 아래에 `100%로 맞추기` 가
 * 나온다(`TypeTargetList:FillToFull`).
 *
 * 못 미는 줄은 **기타·미분류**뿐이다 — 구성이 유동적이라 밀면 엉뚱한 종목이 딸려간다.
 */
export function TargetLensPanel({
  rows,
  currency,
  misfiled = 0,
}: {
  rows: LensRows;
  currency: Currency;
  /**
   * 이름으로 보면 유형이 다른 종목 수(국채 ETF 등). 0 이면 아무것도 안 띄운다 —
   * 할 일이 없는데 문만 있으면 화면이 무거워진다.
   */
  misfiled?: number;
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

      {/* 유형이 틀린 채로 목표를 정하면 그 목표가 가리키는 묶음이 사용자가 생각한 것과
          달라진다("ETF 20%"에 국채가 섞여 있는 상태). 그래서 **목표를 정하는 자리에서**
          바로 갈 수 있어야 한다 — 사용자가 채권·원자재를 못 넣던 이유가 이거였다. */}
      {misfiled > 0 && (
        <Link
          href="/allocation/types"
          className="flex items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 transition active:scale-[0.99]"
        >
          <span className="min-w-0 flex-1 text-xs leading-relaxed">
            <b>{misfiled}개</b>는 이름으로 보면 다른 유형이에요 — 국채 ETF 를 채권으로
            옮기면 <b>채권 5%</b> 같은 목표를 정할 수 있어요.
          </span>
          <span className="shrink-0 text-sm font-semibold">정리하기 ›</span>
        </Link>
      )}

      {active.note && (
        <p className="px-2 text-xs leading-relaxed text-muted-foreground">
          {active.note}
        </p>
      )}
    </div>
  );
}
