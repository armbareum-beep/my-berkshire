import { describe, it, expect } from "vitest";
import {
  monthsBetween,
  divisionFinancingCost,
  type FinancingReconciliation,
} from "./financing";
import type { Liability } from "./liabilities";

const loan = (over: Partial<Liability> = {}): Liability => ({
  id: "l1",
  name: "담보대출",
  kind: "MORTGAGE",
  principal: 100_000_000,
  interestRate: 0.03,
  startedAt: null,
  manualAssetId: null,
  ...over,
});

const rec = (
  over: Partial<FinancingReconciliation> = {},
): FinancingReconciliation => ({
  id: "r1",
  division: "REAL_ESTATE",
  date: "2025-02-01",
  kind: "interest_actual",
  amount: 300_000,
  note: null,
  ...over,
});

describe("monthsBetween", () => {
  it("정확히 한 달 = 1", () => {
    expect(monthsBetween("2025-01-01", "2025-02-01")).toBe(1);
  });
  it("같은 날 = 0", () => {
    expect(monthsBetween("2025-01-01", "2025-01-01")).toBe(0);
  });
  it("역전(to<from) = 0", () => {
    expect(monthsBetween("2025-02-01", "2025-01-01")).toBe(0);
  });
  it("보름 ≈ 15/31 일할", () => {
    expect(monthsBetween("2025-01-01", "2025-01-16")).toBeCloseTo(15 / 31, 4);
  });
  it("한 달 반 ≈ 1.5", () => {
    // 2025-01-01 → 2025-02-15: 완전 1개월 + 14/28
    expect(monthsBetween("2025-01-01", "2025-02-15")).toBeCloseTo(1 + 14 / 28, 4);
  });
});

describe("divisionFinancingCost", () => {
  const base = {
    accrualStartFallback: "2025-01-01",
    asOf: "2025-02-01",
  };

  it("대출 0개면 전부 0", () => {
    const f = divisionFinancingCost({ liabilities: [], reconciliations: [], ...base });
    expect(f.totalInterest).toBe(0);
    expect(f.estimatedInterest).toBe(0);
    expect(f.capitalAdded).toBe(0);
    expect(f.weightedAvgRate).toBeNull();
    expect(f.monthlyEstimate).toBe(0);
    expect(f.debt).toBe(0);
  });

  it("debt = 담보대출 잔액 합(이율·기점 무관)", () => {
    const f = divisionFinancingCost({
      liabilities: [loan(), loan({ id: "l2", principal: 50_000_000, interestRate: 0 })],
      reconciliations: [],
      ...base,
    });
    expect(f.debt).toBe(150_000_000); // 1억 + 5천(이율 0이어도 잔액은 합산)
  });

  it("1억@3% 1개월 → 추정 25만", () => {
    const f = divisionFinancingCost({
      liabilities: [loan()],
      reconciliations: [],
      ...base,
    });
    expect(f.estimatedInterest).toBeCloseTo(250_000, 2);
    expect(f.totalInterest).toBeCloseTo(250_000, 2);
    expect(f.monthlyEstimate).toBeCloseTo(250_000, 2);
    expect(f.weightedAvgRate).toBeCloseTo(0.03, 6);
  });

  it("1억@3% + 5천@4% → 가중평균 3.33%, 월 ≈ 41.7만(416,667)", () => {
    const f = divisionFinancingCost({
      liabilities: [loan(), loan({ id: "l2", principal: 50_000_000, interestRate: 0.04 })],
      reconciliations: [],
      ...base,
    });
    expect(f.weightedAvgRate).toBeCloseTo(5_000_000 / 150_000_000, 6);
    expect(f.monthlyEstimate).toBeCloseTo(416_666.67, 1);
  });

  it("startedAt 기점 — 차입 전이면 추정 0", () => {
    const f = divisionFinancingCost({
      liabilities: [loan({ startedAt: "2025-01-15" })],
      reconciliations: [],
      accrualStartFallback: "2020-01-01",
      asOf: "2025-01-10", // 차입(1/15) 전
    });
    expect(f.estimatedInterest).toBe(0);
  });

  it("asOf < 기점이면 추정 0", () => {
    const f = divisionFinancingCost({
      liabilities: [loan()],
      reconciliations: [],
      accrualStartFallback: "2025-01-01",
      asOf: "2024-12-01",
    });
    expect(f.estimatedInterest).toBe(0);
  });

  it("interest_actual 보정 후 — 보정일 이전 confirmed, 이후만 추정(VI-4)", () => {
    const f = divisionFinancingCost({
      liabilities: [loan()], // 1억@3% → 월 25만
      reconciliations: [rec({ date: "2025-02-01", amount: 300_000 })],
      accrualStartFallback: "2025-01-01",
      asOf: "2025-03-01", // 보정(2/1) 이후 1개월
    });
    expect(f.confirmedInterest).toBe(300_000);
    expect(f.estimatedInterest).toBeCloseTo(250_000, 2); // 2/1~3/1 한 달만
    expect(f.totalInterest).toBeCloseTo(550_000, 2);
  });

  it("capital 보정 — capitalAdded 반영, 추정엔 영향 없음", () => {
    const f = divisionFinancingCost({
      liabilities: [loan()],
      reconciliations: [rec({ kind: "capital", amount: 10_000_000, date: "2025-01-20" })],
      ...base,
    });
    expect(f.capitalAdded).toBe(10_000_000);
    expect(f.estimatedInterest).toBeCloseTo(250_000, 2); // 1/1~2/1 그대로
  });

  it("이율 0 대출은 이자 기여 0", () => {
    const f = divisionFinancingCost({
      liabilities: [loan({ interestRate: 0 })],
      reconciliations: [],
      ...base,
    });
    expect(f.estimatedInterest).toBe(0);
  });

  it("연결 물건 취득일이 기점(startedAt null) — 폴백보다 우선", () => {
    const f = divisionFinancingCost({
      liabilities: [loan({ startedAt: null, manualAssetId: "re1" })],
      reconciliations: [],
      accrualStartFallback: "2020-01-01", // 사업부 폴백(더 이름)
      assetAcquiredById: { re1: "2025-01-01" }, // 연결 물건 취득일
      asOf: "2025-02-01",
    });
    // 연결 물건 취득일(1/1)~2/1 = 1개월 → 25만 (폴백 2020 무시)
    expect(f.estimatedInterest).toBeCloseTo(250_000, 2);
  });

  it("차입일(startedAt)이 있으면 연결 물건일보다 우선", () => {
    const f = divisionFinancingCost({
      liabilities: [loan({ startedAt: "2025-01-01", manualAssetId: "re1" })],
      reconciliations: [],
      accrualStartFallback: "2020-01-01",
      assetAcquiredById: { re1: "2010-01-01" },
      asOf: "2025-02-01",
    });
    expect(f.estimatedInterest).toBeCloseTo(250_000, 2);
  });
});
