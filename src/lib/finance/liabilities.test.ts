import { describe, it, expect } from "vitest";
import {
  mortgageLiabilities,
  weightedAvgRate,
  annualInterest,
  type Liability,
} from "./liabilities";

const loan = (over: Partial<Liability> = {}): Liability => ({
  id: "l1",
  name: "대출",
  kind: "MORTGAGE",
  principal: 100_000_000,
  interestRate: 0.03,
  startedAt: null,
  manualAssetId: null,
  ...over,
});

describe("mortgageLiabilities", () => {
  it("MORTGAGE 만 통과", () => {
    const items = [
      loan({ id: "m", kind: "MORTGAGE" }),
      loan({ id: "g", kind: "MARGIN" }),
      loan({ id: "c", kind: "CREDIT" }),
    ];
    expect(mortgageLiabilities(items).map((l) => l.id)).toEqual(["m"]);
  });
});

describe("weightedAvgRate", () => {
  it("단일 대출이면 그 이율", () => {
    expect(weightedAvgRate([loan({ interestRate: 0.035 })])).toBeCloseTo(0.035, 6);
  });
  it("잔액 가중평균: 1억@3% + 5천@4% = 3.33%", () => {
    const avg = weightedAvgRate([
      loan({ principal: 100_000_000, interestRate: 0.03 }),
      loan({ id: "l2", principal: 50_000_000, interestRate: 0.04 }),
    ]);
    expect(avg).toBeCloseTo(5_000_000 / 150_000_000, 6);
  });
  it("이율 0 대출은 평균을 낮춘다(분모엔 포함)", () => {
    const avg = weightedAvgRate([
      loan({ principal: 100_000_000, interestRate: 0.03 }),
      loan({ id: "l2", principal: 100_000_000, interestRate: 0 }),
    ]);
    expect(avg).toBeCloseTo(0.015, 6);
  });
  it("총잔액 0이면 null", () => {
    expect(weightedAvgRate([])).toBeNull();
    expect(weightedAvgRate([loan({ principal: 0 })])).toBeNull();
  });
});

describe("annualInterest", () => {
  it("Σ 잔액×이율", () => {
    expect(
      annualInterest([
        loan({ principal: 100_000_000, interestRate: 0.03 }),
        loan({ id: "l2", principal: 50_000_000, interestRate: 0.04 }),
      ]),
    ).toBe(5_000_000);
  });
});
