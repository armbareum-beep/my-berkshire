import { describe, expect, it } from "vitest";
import { emptyPortfolio, validatePortfolio } from "./model";
import { performanceComparison } from "./comparison";

function sample() {
  const p = emptyPortfolio(); p.asOf = "2026-01-02";
  p.accounts = [{ id: "a", owner: "P01", broker: "A", name: "계좌", type: "일반", mask: "", cash: 220, complete: true, div: 0, interest: 0, realized: 0 }];
  p.performance = { start: "2025-12-31", end: "2026-01-02", method: "daily-eod-estimate", daily: [{ date: "2025-12-31", values: { a: 100 } }, { date: "2026-01-01", values: { a: 200 } }, { date: "2026-01-02", values: { a: 220 } }], benchmarks: [{ id: "index", name: "비교 ETF", return: .08 }], note: "추정" };
  p.flows = [{ id: "in", account: "a", date: "2026-01-01", amount: -100 }];
  return p;
}
describe("운용성과 비교", () => {
  it("입금 자체를 이익으로 계산하지 않으며 연환산하지 않음", () => {
    expect(performanceComparison(validatePortfolio(sample())).rate).toBeCloseTo(.1, 10);
  });
  it("세후 배당·이자를 중복 과세하지 않고 제외 수익률을 계산", () => {
    const p = sample(); p.performance!.income = [{ account: "a", date: "2026-01-02", dividend: 10, interest: 0 }]; p.performance!.incomeAccounts = ["a"];
    const result = performanceComparison(validatePortfolio(p));
    expect(result.rate).toBeCloseTo(.1, 10);
    expect(result.exIncomeRate).toBeCloseTo(.05, 10);
    expect(result.incomeContribution).toBeCloseTo(.05, 10);
  });
  it("선택 계좌 일부의 소득내역만 확인됐으면 제외 수익률을 표시하지 않음", () => {
    const p = sample(); p.accounts.push({ ...p.accounts[0], id: "b", owner: "P02", broker: "B" });
    p.performance!.daily = p.performance!.daily!.map(d => ({ ...d, values: { ...d.values, b: d.values.a } }));
    p.performance!.income = [{ account: "a", date: "2026-01-02", dividend: 10, interest: 0 }]; p.performance!.incomeAccounts = ["a"];
    expect(performanceComparison(validatePortfolio(p)).exIncomeRate).toBeNull();
    expect(performanceComparison(p, "P01").exIncomeRate).toBeCloseTo(.05, 10);
  });
  it("소득 차감 계산만 실패해도 총수익 TWR은 유지", () => {
    const p = sample(); p.performance!.income = [{ account: "a", date: "2026-01-02", dividend: 300, interest: 0 }]; p.performance!.incomeAccounts = ["a"];
    const result = performanceComparison(validatePortfolio(p));
    expect(result.rate).toBeCloseTo(.1, 10);
    expect(result.exIncomeRate).toBeNull();
    expect(result.exIncomeReason).toMatch(/잔고/);
  });
  it("세전 금액에서 세금을 뺀 값이 세후 합계와 맞아야 함", () => {
    const p = sample(); Object.assign(p.accounts[0], { div: 10, divGross: 12, divTax: 2 });
    expect(validatePortfolio(p).accounts[0].div).toBe(10);
    p.accounts[0].divTax = 0;
    expect(() => validatePortfolio(p)).toThrow(/세후/);
  });
  it("출금과 두 계좌의 내부이체를 선택 범위에 맞춰 처리", () => {
    const p = sample(); p.accounts.push({ ...p.accounts[0], id: "b", owner: "P02", broker: "B" });
    p.performance!.daily = [{ date: "2025-12-31", values: { a: 100, b: 100 } }, { date: "2026-01-01", values: { a: 50, b: 150 } }, { date: "2026-01-02", values: { a: 55, b: 165 } }];
    p.flows = [{ id: "out", account: "a", date: "2026-01-01", amount: 50, transfer: "t" }, { id: "in", account: "b", date: "2026-01-01", amount: -50, transfer: "t" }];
    expect(performanceComparison(p).rate).toBeCloseTo(.1, 10);
    expect(performanceComparison(p, "P01").rate).toBeCloseTo(.1, 10);
    expect(performanceComparison(p, "all", "b").rate).toBeCloseTo(.1, 10);
    expect(performanceComparison(p, "all", "all", "B").rate).toBeCloseTo(.1, 10);
  });
  it("독립 CMA는 제외하고 CMA에서 투자계좌로 옮긴 돈은 외부 입금으로 처리", () => {
    const p = sample();
    p.accounts.push({ ...p.accounts[0], id: "cma", name: "CMA", type: "CMA" });
    p.performance!.daily = [
      { date: "2025-12-31", values: { a: 100, cma: 100 } },
      { date: "2026-01-01", values: { a: 150, cma: 50 } },
      { date: "2026-01-02", values: { a: 165, cma: 50 } },
    ];
    p.flows = [
      { id: "cma-out", account: "cma", date: "2026-01-01", amount: 50, transfer: "t" },
      { id: "investment-in", account: "a", date: "2026-01-01", amount: -50, transfer: "t" },
    ];
    expect(performanceComparison(p).rate).toBeCloseTo(.1, 10);
    expect(performanceComparison(p, "all", "cma").rate).toBeNull();
    expect(performanceComparison(p, "all", "cma").reason).toMatch(/CMA/);
  });
  it("일별 평가자료가 없는 외화 계좌는 비교에서 제외", () => {
    const p = sample();
    p.accounts.push({ ...p.accounts[0], id: "yen", name: "엔화", type: "외화예금" });
    const alone = performanceComparison(p).rate;
    expect(alone).not.toBeNull();
    expect(performanceComparison(p, "all", "yen").reason).toMatch(/외화/);
  });
  it("누락된 평가자료와 0원 구간을 임의의 0%로 표시하지 않음", () => {
    const p = sample(); p.performance!.daily![1].values = {};
    expect(performanceComparison(p).rate).toBeNull();
    p.performance!.daily = undefined;
    expect(performanceComparison(validatePortfolio(p)).rate).toBeNull();
    const q = sample(); q.performance!.daily![0].values.a = 0;
    expect(performanceComparison(q).rate).toBeNull();
  });
  it("일별 자료의 날짜 누락과 미래 기준일 거부", () => {
    const p = sample(); p.performance!.daily!.splice(1, 1);
    expect(() => validatePortfolio(p)).toThrow(/날짜/);
    const q = sample(); q.performance!.end = "2026-01-03";
    expect(() => validatePortfolio(q)).toThrow(/기간/);
  });
});
