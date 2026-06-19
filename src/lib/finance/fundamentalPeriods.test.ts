import { describe, expect, it } from "vitest";
import type { Fundamentals } from "./dart";
import { composeTtm, type FundamentalPeriod } from "./fundamentalPeriods";

function data(overrides: Partial<Fundamentals> = {}): Fundamentals {
  return {
    year: 2025, fsDiv: "연결", revenue: 100, operatingIncome: 20, netIncome: 10,
    assets: 200, liabilities: 80, equity: 120, intangibles: 5, receivables: 10,
    inventory: 8, retainedEarnings: 50, ocf: 15, icf: -5, ffcf: -3,
    interestExpense: 2, capex: 4, dna: 3, fcf: 11, ownerEarnings: 9,
    roe: 10 / 120, debtRatio: 80 / 120, operatingMargin: 0.2, shares: 10,
    eps: 1, isFinancial: false, confidence: "high", ...overrides,
  };
}

function period(year: number, fiscalPeriod: "FY" | "Q1", values: Partial<Fundamentals>): FundamentalPeriod {
  return { fiscalYear: year, fiscalPeriod, periodEnd: fiscalPeriod === "FY" ? `${year}-12-31` : `${year}-03-31`, data: data(values) };
}

describe("composeTtm", () => {
  it("combines flows and uses the latest snapshot", () => {
    const result = composeTtm(
      period(2025, "FY", { revenue: 100, netIncome: 10, equity: 120 }),
      period(2026, "Q1", { revenue: 30, netIncome: 4, equity: 130 }),
      period(2025, "Q1", { revenue: 20, netIncome: 2, equity: 110 }),
    );
    expect(result?.revenue).toBe(110);
    expect(result?.netIncome).toBe(12);
    expect(result?.equity).toBe(130);
    expect(result?.roe).toBeCloseTo(12 / 130);
  });

  it("keeps an incomplete flow metric null", () => {
    const result = composeTtm(
      period(2025, "FY", {}),
      period(2026, "Q1", { ocf: null }),
      period(2025, "Q1", {}),
    );
    expect(result?.ocf).toBeNull();
    expect(result?.fcf).toBeNull();
  });

  it("falls back to annual shares when a quarterly filing omits them", () => {
    const result = composeTtm(
      period(2025, "FY", { shares: 10 }),
      period(2026, "Q1", { shares: null, netIncome: 4 }),
      period(2025, "Q1", { shares: null, netIncome: 2 }),
    );
    expect(result?.shares).toBe(10);
    expect(result?.eps).toBeCloseTo(1.2);
    expect(result?.equity).toBe(120);
  });

  it("rejects mismatched fiscal periods", () => {
    const current = period(2026, "Q1", {});
    expect(composeTtm(period(2025, "FY", {}), current, { ...current, fiscalPeriod: "H1" })).toBeNull();
  });
});
