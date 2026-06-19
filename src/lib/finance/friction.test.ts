import { describe, expect, it } from "vitest";
import { computeFrictionAnalysis, type FrictionEvent } from "./friction";

const events: FrictionEvent[] = [
  { type: "DEPOSIT", date: "2025-07-01", feeAndTax: 0, priceOrAmount: 100_000, accountId: "a", accountName: "일반" },
  { type: "BUY", date: "2025-07-02", feeAndTax: 1_000, priceOrAmount: 10_000, quantity: 50, accountId: "a", accountName: "일반" },
  { type: "SELL", date: "2026-01-02", feeAndTax: 2_000, priceOrAmount: 10_000, quantity: 20, accountId: "a", accountName: "일반" },
  { type: "DIVIDEND", date: "2026-03-02", feeAndTax: 300, priceOrAmount: 2_000, accountId: "b", accountName: "ISA" },
];

describe("computeFrictionAnalysis", () => {
  const result = computeFrictionAnalysis({
    events,
    initialValuation: 1_000_000,
    foundedAt: "2025-06-19",
    today: "2026-06-19",
    terHoldings: [
      { symbol: "ETF", name: "ETF", value: 600_000, ter: 0.001, firstBuyDate: "2025-06-19" },
    ],
  });

  it("실제 기록 비용과 계좌·유형별 비용을 합산한다", () => {
    expect(result.recordedTotal).toBe(3_300);
    expect(result.byAccount).toEqual([
      { id: "a", name: "일반", value: 3_000 },
      { id: "b", name: "ISA", value: 300 },
    ]);
    expect(result.byType.map((row) => row.value)).toEqual([2_000, 1_000, 300]);
  });

  it("매도대금 기준 회전율을 운용기간으로 연환산한다", () => {
    expect(result.turnover.sellGross).toBe(200_000);
    expect(result.turnover.ratio).toBeCloseTo(200_000 / 1_100_000);
    expect(result.turnover.annualized).toBeCloseTo(200_000 / 1_100_000);
  });

  it("현재 평가액 기준 TER 연간·누적 추정액을 분리한다", () => {
    expect(result.ter.annualTotal).toBe(600);
    expect(result.ter.cumulativeTotal).toBe(600);
  });

  it("기록이 쌓인 연도마다 1~12월과 연간 합계를 만든다", () => {
    expect(result.yearly.map((row) => row.year)).toEqual([2025, 2026]);
    expect(result.yearly[0].monthly).toHaveLength(12);
    expect(result.yearly[0].total).toBe(1_000);
    expect(result.yearly[1].total).toBe(2_300);
  });
});
