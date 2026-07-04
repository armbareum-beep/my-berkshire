/**
 * 투자 규율 공용 수식 — 저비용(마찰비용/원금)·저레버리지(부채/자산).
 * style.ts(투자 스타일 진단)·ranking.ts(랭킹 채점) 양쪽이 공유.
 */
import type { InvestmentEvent } from "./valuation";
import { totalDeposits } from "./valuation";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** 마찰비용(수수료+세금) / 투자원금(설립자본+증자). 원금 0이면 null. */
export function computeDrag(
  events: InvestmentEvent[],
  initialValuation: number,
): number | null {
  const friction = events.reduce((s, e) => s + e.feeAndTax, 0);
  const investedPrincipal = initialValuation + totalDeposits(events);
  return investedPrincipal > 0 ? friction / investedPrincipal : null;
}

/** drag 2% 이상이면 0점, drag null(원금 없음)이면 만점(1). */
export function lowCostScore01(drag: number | null): number {
  return drag == null ? 1 : clamp01(1 - drag / 0.02);
}

/** 부채/자산. 부채 없거나 자산이 0/미상이면 0(비율 없음). */
export function debtToAssets(
  debtKrw: number,
  assetsKrw: number | null | undefined,
): number {
  return debtKrw > 0 && assetsKrw && assetsKrw > 0 ? debtKrw / assetsKrw : 0;
}

/** 부채비율 40% 이상이면 0점, 무차입(0)이면 만점(1). */
export function lowLeverageScore01(ratio: number): number {
  return clamp01(1 - ratio / 0.4);
}
