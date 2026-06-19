import { describe, it, expect } from "vitest";
import { computeFundamentalFlags } from "./fundamentalFlags";
import type { Fundamentals } from "./dart";

/** 최소 필드만 채운 펀더멘털(나머지 null). 연도별 비교 로직 테스트용. */
function f(p: Partial<Fundamentals> & { year: number }): Fundamentals {
  return {
    fsDiv: "연결",
    revenue: null,
    operatingIncome: null,
    netIncome: null,
    assets: null,
    liabilities: null,
    equity: null,
    intangibles: null,
    receivables: null,
    inventory: null,
    retainedEarnings: null,
    ocf: null,
    icf: null,
    ffcf: null,
    interestExpense: null,
    capex: null,
    dna: null,
    fcf: null,
    ownerEarnings: null,
    roe: null,
    debtRatio: null,
    operatingMargin: null,
    shares: null,
    eps: null,
    isFinancial: false,
    confidence: "high",
    ...p,
  };
}

const ids = (s: Fundamentals[]) => computeFundamentalFlags(s).map((x) => x.id);

describe("펀더멘털 플래그 (§11)", () => {
  it("F1: 순이익↑·영업현금↓ → earnings-quality", () => {
    const s = [
      f({ year: 2024, netIncome: 120, ocf: 80 }),
      f({ year: 2023, netIncome: 100, ocf: 100 }),
    ];
    expect(ids(s)).toContain("earnings-quality");
  });

  it("F1: 순이익·현금 같이 늘면 신호 없음", () => {
    const s = [
      f({ year: 2024, netIncome: 120, ocf: 130 }),
      f({ year: 2023, netIncome: 100, ocf: 100 }),
    ];
    expect(ids(s)).not.toContain("earnings-quality");
  });

  it("F3: 매출채권이 매출보다 급증 → receivables-surge", () => {
    const s = [
      f({ year: 2024, revenue: 105, receivables: 150 }),
      f({ year: 2023, revenue: 100, receivables: 100 }),
    ];
    expect(ids(s)).toContain("receivables-surge");
  });

  it("F4: 재고가 매출보다 급증 → inventory-surge", () => {
    const s = [
      f({ year: 2024, revenue: 102, inventory: 140 }),
      f({ year: 2023, revenue: 100, inventory: 100 }),
    ];
    expect(ids(s)).toContain("inventory-surge");
  });

  it("F2: 순이익 ≫ 영업이익 → net-above-operating", () => {
    const s = [f({ year: 2024, operatingIncome: 100, netIncome: 200 })];
    expect(ids(s)).toContain("net-above-operating");
  });

  it("F5: 이자보상배율 < 1 → interest-coverage", () => {
    const s = [f({ year: 2024, operatingIncome: 50, interestExpense: 80 })];
    expect(ids(s)).toContain("interest-coverage");
  });

  it("F5: 영업이익이 이자보다 크면 신호 없음", () => {
    const s = [f({ year: 2024, operatingIncome: 200, interestExpense: 80 })];
    expect(ids(s)).not.toContain("interest-coverage");
  });

  it("금융업은 전부 건너뜀", () => {
    const s = [
      f({ year: 2024, isFinancial: true, operatingIncome: 50, interestExpense: 80 }),
    ];
    expect(ids(s)).toEqual([]);
  });

  it("직전 연도 없으면 YoY 규칙은 생략(단년 규칙만)", () => {
    const s = [f({ year: 2024, operatingIncome: 100, netIncome: 200, ocf: 10 })];
    // 단년 F2 는 잡히고, YoY 인 F1/F3/F4 는 안 잡힘.
    expect(ids(s)).toEqual(["net-above-operating"]);
  });

  it("정상 기업은 신호 없음(빈 배열)", () => {
    const s = [
      f({ year: 2024, revenue: 110, operatingIncome: 100, netIncome: 90, ocf: 120, receivables: 105, inventory: 108, interestExpense: 5 }),
      f({ year: 2023, revenue: 100, operatingIncome: 90, netIncome: 80, ocf: 100, receivables: 100, inventory: 100, interestExpense: 5 }),
    ];
    expect(ids(s)).toEqual([]);
  });
});
