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
  it("출금과 두 계좌의 내부이체를 선택 범위에 맞춰 처리", () => {
    const p = sample(); p.accounts.push({ ...p.accounts[0], id: "b", owner: "P02", broker: "B" });
    p.performance!.daily = [{ date: "2025-12-31", values: { a: 100, b: 100 } }, { date: "2026-01-01", values: { a: 50, b: 150 } }, { date: "2026-01-02", values: { a: 55, b: 165 } }];
    p.flows = [{ id: "out", account: "a", date: "2026-01-01", amount: 50, transfer: "t" }, { id: "in", account: "b", date: "2026-01-01", amount: -50, transfer: "t" }];
    expect(performanceComparison(p).rate).toBeCloseTo(.1, 10);
    expect(performanceComparison(p, "P01").rate).toBeCloseTo(.1, 10);
    expect(performanceComparison(p, "all", "b").rate).toBeCloseTo(.1, 10);
    expect(performanceComparison(p, "all", "all", "B").rate).toBeCloseTo(.1, 10);
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
