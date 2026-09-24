import { describe, expect, it } from "vitest";
import { annualPerformance } from "./annual";
import { performanceComparison } from "./comparison";
import { emptyPortfolio, validatePortfolio } from "./model";

function sample() {
  const p = emptyPortfolio(); p.asOf = "2026-01-02";
  p.accounts = [{ id: "a", owner: "P01", broker: "A", name: "연금", type: "연금", mask: "", cash: 220, complete: true, div: 0, interest: 0, realized: 0 }];
  p.performance = {
    start: "2025-12-31", end: "2026-01-02", method: "daily-eod-estimate",
    daily: [
      { date: "2025-12-31", values: { a: 100 } },
      { date: "2026-01-01", values: { a: 200 } },
      { date: "2026-01-02", values: { a: 220 } },
    ],
    benchmarks: [], note: "일별 평가 추정",
  };
  p.flows = [{ id: "deposit", account: "a", date: "2026-01-01", amount: -100 }];
  return p;
}

describe("연도별 TWR", () => {
  it("운용성과 카드와 같은 기간에는 같은 TWR을 표시", () => {
    const p = validatePortfolio(sample());
    const annual = annualPerformance(p)[0];
    const comparison = performanceComparison(p);
    expect(annual.rate).toBeCloseTo(.1, 10);
    expect(annual.rate).toBeCloseTo(comparison.rate!, 10);
    expect(annual.start).toBe("2025-12-31");
    expect(annual.end).toBe("2026-01-02");
    expect(annual.partial).toBe(true);
  });

  it("입금 자체를 수익이나 투자손익으로 집계하지 않음", () => {
    const y = annualPerformance(sample())[0];
    expect(y.opening).toBe(100);
    expect(y.closing).toBe(220);
    expect(y.net).toBe(100);
    expect(y.profit).toBe(20);
    expect(y.rate).toBeCloseTo(.1, 10);
  });

  it("가족 전체의 내부이체는 상계하고 선택 범위에서는 외부 입출금으로 처리", () => {
    const p = sample();
    p.accounts.push({ ...p.accounts[0], id: "b", owner: "P02", broker: "B", cash: 165 });
    p.performance!.daily = [
      { date: "2025-12-31", values: { a: 100, b: 100 } },
      { date: "2026-01-01", values: { a: 50, b: 150 } },
      { date: "2026-01-02", values: { a: 55, b: 165 } },
    ];
    p.flows = [
      { id: "out", account: "a", date: "2026-01-01", amount: 50, transfer: "t" },
      { id: "in", account: "b", date: "2026-01-01", amount: -50, transfer: "t" },
    ];
    expect(annualPerformance(p)[0].net).toBe(0);
    expect(annualPerformance(p)[0].rate).toBeCloseTo(.1, 10);
    expect(annualPerformance(p, "all", "a")[0].net).toBe(-50);
    expect(annualPerformance(p, "P02")[0].net).toBe(50);
    expect(annualPerformance(p, "all", "all", "B")[0].net).toBe(50);
  });

  it("독립 CMA·외화예금은 연도별 TWR에서도 제외", () => {
    const p = sample();
    p.accounts.push({ ...p.accounts[0], id: "cma", type: "CMA", name: "CMA" });
    p.performance!.daily = p.performance!.daily!.map(d => ({ ...d, values: { ...d.values, cma: 100 } }));
    expect(annualPerformance(p)[0].rate).toBeCloseTo(.1, 10);
    const cma = annualPerformance(p, "all", "cma")[0];
    expect(cma.rate).toBeNull();
    expect(cma.missing.join(" ")).toMatch(/CMA/);
  });

  it("불완전 이력과 없는 일별 자료를 0%로 표시하지 않음", () => {
    const p = sample(); p.accounts[0].complete = false;
    expect(annualPerformance(p)[0].rate).toBeNull();
    expect(annualPerformance(p)[0].profit).toBeNull();
    p.performance!.daily = undefined;
    expect(annualPerformance(p)).toEqual([]);
  });
});
