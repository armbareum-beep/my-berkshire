import { describe, expect, it } from "vitest";
import {
  businessCandidates,
  computeReturnWithoutBusinesses,
} from "./businessContribution";
import type { InvestmentEvent } from "./valuation";

const holding = { foundedAt: "2025-01-01", initialValuation: 10_000 };
const events: InvestmentEvent[] = [
  { type: "BUY", symbol: "A", quantity: 50, priceOrAmount: 100, feeAndTax: 10, date: "2025-01-01" },
  { type: "BUY", symbol: "B", quantity: 50, priceOrAmount: 100, feeAndTax: 10, date: "2025-01-01" },
  { type: "DIVIDEND", symbol: "A", priceOrAmount: 100, feeAndTax: 15, date: "2025-07-01" },
  { type: "DEPOSIT", priceOrAmount: 1_000, feeAndTax: 0, date: "2025-07-01" },
];

describe("businessCandidates", () => {
  it("외부 현금흐름을 제외하고 사업부 이벤트를 집계한다", () => {
    expect(businessCandidates(events, { A: "알파", B: "베타" })).toEqual([
      { symbol: "A", name: "알파", eventCount: 2 },
      { symbol: "B", name: "베타", eventCount: 1 },
    ]);
  });
});

describe("computeReturnWithoutBusinesses", () => {
  it("제외한 사업부 인수대금은 현금으로 남고 배당·비용도 함께 제거된다", () => {
    const result = computeReturnWithoutBusinesses(
      holding,
      events,
      { A: 120, B: 80 },
      "2026-01-01",
      ["A"],
    );
    // A 이벤트가 없었다면: 초기현금 10,000 - B매수 5,000 - 비용10 + 증자1,000
    // + B평가액 4,000 = 9,990
    expect(result.currentValuation).toBe(9_990);
    expect(result.xirr).not.toBeNull();
  });

  it("여러 사업부를 동시에 제외할 수 있다", () => {
    const result = computeReturnWithoutBusinesses(
      holding,
      events,
      { A: 120, B: 80 },
      "2026-01-01",
      ["A", "B"],
    );
    expect(result.currentValuation).toBe(11_000);
  });

  it("오른 사업부를 제외하면 수익률이 낮아지고 내린 사업부를 제외하면 높아진다", () => {
    const baseline = computeReturnWithoutBusinesses(
      holding,
      events,
      { A: 120, B: 80 },
      "2026-01-01",
      [],
    );
    const withoutWinner = computeReturnWithoutBusinesses(
      holding,
      events,
      { A: 120, B: 80 },
      "2026-01-01",
      ["A"],
    );
    const withoutLoser = computeReturnWithoutBusinesses(
      holding,
      events,
      { A: 120, B: 80 },
      "2026-01-01",
      ["B"],
    );
    expect(withoutWinner.xirr!).toBeLessThan(baseline.xirr!);
    expect(withoutLoser.xirr!).toBeGreaterThan(baseline.xirr!);
  });

  it("종목 코드가 잘못 붙은 외부 현금흐름도 제거하지 않는다", () => {
    const malformed: InvestmentEvent[] = [
      ...events,
      { type: "WITHDRAWAL", symbol: "A", priceOrAmount: 500, feeAndTax: 0, date: "2025-10-01" },
    ];
    const result = computeReturnWithoutBusinesses(
      holding,
      malformed,
      { A: 120, B: 80 },
      "2026-01-01",
      ["A"],
    );
    expect(result.currentValuation).toBe(9_490);
  });
});
