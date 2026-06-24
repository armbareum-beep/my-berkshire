import { describe, it, expect } from "vitest";
import { computeBusinessReturns } from "./businessReturns";

const re = (cost: number, gain: number) => ({
  key: "REAL_ESTATE",
  label: "부동산 사업부",
  cost,
  gain,
});

describe("사업부별 누적수익률", () => {
  it("주식만 — 총합 = 주식", () => {
    const r = computeBusinessReturns({
      stockInvested: 10_000_000,
      stockGain: 2_000_000,
      manualDivisions: [],
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
      manualDivisions: [re(10_000_000, 0)], // 0%
    });
    expect(r.divisions).toHaveLength(2);
    expect(r.divisions[1].key).toBe("REAL_ESTATE");
    expect(r.divisions[1].estimated).toBe(true);
    // (2,000,000 + 0) / 20,000,000 = 10%
    expect(r.total?.ret).toBeCloseTo(0.1, 5);
    expect(r.total?.estimated).toBe(true);
  });

  it("여러 수기 사업부 — 각각 행으로 + 합산", () => {
    const r = computeBusinessReturns({
      stockInvested: 10_000_000,
      stockGain: 0,
      manualDivisions: [
        re(10_000_000, 1_000_000),
        { key: "PHYSICAL", label: "대체 사업부", cost: 10_000_000, gain: 0 },
      ],
    });
    expect(r.divisions.map((d) => d.key)).toEqual([
      "stock",
      "REAL_ESTATE",
      "PHYSICAL",
    ]);
    // (0 + 1,000,000 + 0) / 30,000,000
    expect(r.total?.ret).toBeCloseTo(1_000_000 / 30_000_000, 6);
  });

  it("취득가 없는 수기 사업부(cost 0) → 제외", () => {
    const r = computeBusinessReturns({
      stockInvested: 5_000_000,
      stockGain: 500_000,
      manualDivisions: [re(0, 0)],
    });
    expect(r.divisions.map((d) => d.key)).toEqual(["stock"]);
  });

  it("시세 실패(stockGain null) → 총합 생략, 수기 사업부만", () => {
    const r = computeBusinessReturns({
      stockInvested: 10_000_000,
      stockGain: null,
      manualDivisions: [re(3_000_000, 600_000)],
    });
    expect(r.divisions.map((d) => d.key)).toEqual(["REAL_ESTATE"]);
    expect(r.total).toBeNull();
  });

  it("아무 자본도 없으면 빈 결과", () => {
    const r = computeBusinessReturns({
      stockInvested: 0,
      stockGain: null,
      manualDivisions: [],
    });
    expect(r.divisions).toHaveLength(0);
    expect(r.total).toBeNull();
  });
});
