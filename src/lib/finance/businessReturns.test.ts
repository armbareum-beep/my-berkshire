import { describe, it, expect } from "vitest";
import { computeBusinessReturns } from "./businessReturns";

describe("사업부별 누적수익률", () => {
  it("주식만 — 총합 = 주식", () => {
    const r = computeBusinessReturns({
      stockInvested: 10_000_000,
      stockGain: 2_000_000,
      manualCost: 0,
      manualGain: 0,
    });
    expect(r.divisions).toHaveLength(1);
    expect(r.divisions[0].key).toBe("stock");
    expect(r.divisions[0].ret).toBeCloseTo(0.2, 5);
    expect(r.total?.ret).toBeCloseTo(0.2, 5);
    expect(r.total?.estimated).toBe(false);
  });

  it("주식 + 부동산 — 합산 수익률은 가중 평균", () => {
    const r = computeBusinessReturns({
      stockInvested: 10_000_000,
      stockGain: 2_000_000, // +20%
      manualCost: 10_000_000,
      manualGain: 0, // 0%
    });
    expect(r.divisions).toHaveLength(2);
    expect(r.divisions[1].key).toBe("manual");
    expect(r.divisions[1].estimated).toBe(true);
    // (2,000,000 + 0) / 20,000,000 = 10%
    expect(r.total?.ret).toBeCloseTo(0.1, 5);
    expect(r.total?.estimated).toBe(true);
  });

  it("취득가 없는 수기자산(manualCost 0) → 부동산 사업부 생략", () => {
    const r = computeBusinessReturns({
      stockInvested: 5_000_000,
      stockGain: 500_000,
      manualCost: 0,
      manualGain: 0,
    });
    expect(r.divisions.map((d) => d.key)).toEqual(["stock"]);
  });

  it("시세 실패(stockGain null) → 총합 생략, 부동산만 표시", () => {
    const r = computeBusinessReturns({
      stockInvested: 10_000_000,
      stockGain: null,
      manualCost: 3_000_000,
      manualGain: 600_000,
    });
    expect(r.divisions.map((d) => d.key)).toEqual(["manual"]);
    expect(r.total).toBeNull();
  });

  it("아무 자본도 없으면 빈 결과", () => {
    const r = computeBusinessReturns({
      stockInvested: 0,
      stockGain: null,
      manualCost: 0,
      manualGain: 0,
    });
    expect(r.divisions).toHaveLength(0);
    expect(r.total).toBeNull();
  });
});
