/**
 * 배분 순위 — PRD v0.3 §6.1·§11.
 *
 * 순서는 두 겹이다.
 *   1. **살 수 있는 것이 먼저** — 한도에 걸린 종목을 위에 두면 "오늘의 1순위"가 거짓말이 된다
 *   2. 그 안에서 기대수익률 높은 순, 가정이 없으면 목표 미달이 큰 순
 *
 * 화면(`components/allocate/AllocateRail.tsx` 2·3단계)은 이 결과를 그리기만 한다.
 */
import { planAllocation, type AllocateLeg, type AllocateStatus } from "./allocate";
import { valuationApplies } from "./finance/expectedReturn";
import type { AllocateRow } from "./allocateData";

export interface RankedRow {
  row: AllocateRow;
  leg: AllocateLeg;
}

/**
 * 개별주와 ETF·기타를 갈라서 준다.
 *
 * ## 왜 나누고, 왜 번호를 따로 매기나
 *
 * 둘은 **정렬 기준이 다르다** — 주식은 기대수익률, ETF 는 목표 미달. 기대수익률 모형은
 * 개별기업에만 성립하기 때문이다(`valuationApplies`).
 *
 * 그래서 **한 줄로 세울 수 없다.** 예전엔 한 목록에 담고 "가정 있는 게 먼저"로 처리했는데,
 * 그건 근거가 아니라 편의였다 — 목표에 20%p 모자란 ETF 가 허들을 겨우 넘긴 주식보다 뒤로
 * 갈 이유가 없다. 번호를 이어붙이는 것도 같은 거짓말이라, **각 묶음이 1번부터** 센다.
 *
 * 배분 계산 자체는 전부 함께 돌린다(`planAllocation`) — 나누는 건 **보여주는 방식**뿐이다.
 */
export interface RankedGroups {
  /** 기대수익률 순. */
  stocks: RankedRow[];
  /** ETF·코인·원자재 — 목표 미달 순. */
  others: RankedRow[];
}

/** 목표까지 얼마나 모자란가(%p, 소수). 음수면 이미 넘긴 것. */
export function targetGap(r: RankedRow): number {
  return r.leg.targetWeight - r.leg.currentWeight;
}

export function groupRanked(ranked: RankedRow[]): RankedGroups {
  const stocks: RankedRow[] = [];
  const others: RankedRow[] = [];
  for (const r of ranked) {
    (valuationApplies(r.row.assetType) ? stocks : others).push(r);
  }
  // `rankRows` 의 전역 정렬은 주식 기준이다. ETF 묶음은 자기 기준으로 다시 세운다 —
  // 기대수익률이 없는 것들끼리는 목표 미달이 큰 쪽이 먼저다.
  others.sort((a, b) => {
    const byStatus = rank(a.leg.status) - rank(b.leg.status);
    return byStatus !== 0 ? byStatus : targetGap(b) - targetGap(a);
  });
  return { stocks, others };
}

/**
 * 상태 등급(낮을수록 위).
 *
 * `FILLED`("다 샀다")를 `BLOCKED`("사면 안 된다")보다 위에 둔다 — 둘은 다른 말이고,
 * 한도 초과가 목록 맨 아래에 모여야 "왜 안 사는지"가 한눈에 보인다.
 */
function rank(status: AllocateStatus): number {
  switch (status) {
    case "BUY":
    case "STRETCH":
      return 0;
    case "TRIM_PRIORITY":
      return 1;
    case "WAIT":
      return 2;
    case "FILLED":
      return 3;
    case "BLOCKED":
      return 4;
  }
}

/**
 * 순위 계산. 배분 금액이 아니라 **상태와 매력도**로 줄을 세운다 —
 * 금액은 배분 레일(`/allocate`)의 1단계에서 정해지므로 여기서는 아직 없다.
 */
export function rankRows(rows: AllocateRow[]): RankedRow[] {
  // 투자금 0 으로 돌려 상태만 얻는다(캡·목표 판정은 투자금과 무관하게 성립).
  const plan = planAllocation(rows, 0);
  const legOf = new Map(plan.legs.map((l) => [l.key, l]));

  return rows
    .map((row) => ({ row, leg: legOf.get(row.key)! }))
    .filter((r) => r.leg)
    .sort((a, b) => {
      const byStatus = rank(a.leg.status) - rank(b.leg.status);
      if (byStatus !== 0) return byStatus;
      // 기대수익률이 있는 쪽이 먼저 — 모르는 것을 0% 로 취급하지 않는다.
      const ea = a.row.expectedCagr;
      const eb = b.row.expectedCagr;
      if (ea != null && eb != null) return eb - ea;
      if (ea != null) return -1;
      if (eb != null) return 1;
      // 둘 다 가정이 없으면 목표 미달이 큰 순.
      const gapA = a.leg.targetWeight - a.leg.currentWeight;
      const gapB = b.leg.targetWeight - b.leg.currentWeight;
      return gapB - gapA;
    });
}
