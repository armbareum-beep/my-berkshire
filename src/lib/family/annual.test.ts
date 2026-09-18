import { describe, expect, it } from "vitest";
import { annualPerformance } from "./annual";
import { emptyPortfolio, validatePortfolio } from "./model";

function sample() {
  const p = emptyPortfolio(); p.asOf = "2025-12-31";
  p.accounts = [{ id: "a", owner: "P01", broker: "A", name: "연금", type: "연금", mask: "", cash: 110, complete: true, div: 0, interest: 0, realized: 0, inceptionDate: "2024-01-01" }];
  p.valuations = [{ account: "a", date: "2024-12-31", value: 100, estimated: false }];
  return p;
}
describe("연도별 금액가중 수익률", () => {
  it("지난해 말 자산으로 한 해의 성과를 계산", () => {
    const y = annualPerformance(sample())[0];
    expect(y.rate).toBeCloseTo(.1, 8); expect(y.profit).toBe(10); expect(y.partial).toBe(false);
  });
  it("중간 납입금을 이익으로 집계하지 않고 투자일수를 반영", () => {
    const p = sample(), days = (Date.parse(p.asOf) - Date.parse("2025-07-01")) / 86400000;
    p.flows = [{ id: "deposit", account: "a", date: "2025-07-01", amount: -100 }];
    p.accounts[0].cash = 110 + 100 * Math.pow(1.1, days / 365);
    const y = annualPerformance(p)[0]; expect(y.rate).toBeCloseTo(.1, 8); expect(y.net).toBe(100); expect(y.profit).toBeCloseTo(p.accounts[0].cash - 200, 8);
  });
  it("진행 중인 해와 윤년을 실제 기간 수익률로 표시", () => {
    const p = sample(); p.asOf = "2025-06-30";
    const y = annualPerformance(p)[0]; expect(y.rate).toBeCloseTo(.1, 8); expect(y.annualized).toBeGreaterThan(.2); expect(y.partial).toBe(true);
    p.asOf = "2024-12-31"; p.accounts[0].inceptionDate = "2023-01-01"; p.valuations![0].date = "2023-12-31";
    expect(annualPerformance(p)[0].rate).toBeCloseTo(.1, 8);
  });
  it("첫해는 실제 첫 투자일을 시작으로 사용", () => {
    const p = sample(); p.accounts[0].inceptionDate = "2025-07-01"; p.valuations = [];
    p.flows = [{ id: "deposit", account: "a", date: "2025-07-01", amount: -100 }];
    const y = annualPerformance(p)[0]; expect(y.start).toBe("2025-07-01"); expect(y.opening).toBe(0); expect(y.rate).toBeCloseTo(.1, 8);
  });
  it("가족 전체는 내부이체를 상계하고 계좌·계좌주·증권사는 선택 범위만 계산", () => {
    const p = sample(); p.accounts[0].cash = 55;
    p.accounts.push({ ...p.accounts[0], id: "b", owner: "P02", broker: "B" });
    p.valuations!.push({ account: "b", date: "2024-12-31", value: 0, estimated: false });
    p.flows = [{ id: "out", account: "a", date: "2025-07-01", amount: 50, transfer: "t" }, { id: "in", account: "b", date: "2025-07-01", amount: -50, transfer: "t" }];
    const y = annualPerformance(p)[0]; expect(y.net).toBe(0); expect(y.rate).toBeCloseTo(.1, 8);
    expect(annualPerformance(p, "all", "a")[0].net).toBe(-50);
    expect(annualPerformance(p, "P02")[0].net).toBe(50);
    expect(annualPerformance(p, "all", "all", "B")[0].net).toBe(50);
    expect(annualPerformance(p, "P03")).toEqual([]);
  });
  it("없는 연말 자료와 불완전 이력은 0%로 오인하지 않음", () => {
    const p = sample(); p.valuations = [];
    expect(annualPerformance(p)[0].opening).toBeNull(); expect(annualPerformance(p)[0].rate).toBeNull();
    const q = sample(); q.accounts[0].complete = false;
    expect(annualPerformance(q)[0].rate).toBeNull(); expect(annualPerformance(q)[0].profit).toBeNull();
    q.accounts[0].complete = true; q.accounts[0].inceptionDate = undefined;
    q.flows = [{ id: "f", account: "a", date: "2024-07-01", amount: -100 }];
    expect(annualPerformance(q)[1].rate).toBeNull();
  });
  it("전액 손실은 -100%, 자료 중복과 미래 평가자료는 거부", () => {
    const p = sample(); p.accounts[0].cash = 0;
    expect(annualPerformance(p)[0].rate).toBe(-1);
    p.valuations!.push(p.valuations![0]); expect(() => validatePortfolio(p)).toThrow(/중복/);
    p.valuations = [{ account: "a", date: "2026-12-31", value: 100, estimated: true }]; expect(() => validatePortfolio(p)).toThrow(/날짜/);
  });
});
