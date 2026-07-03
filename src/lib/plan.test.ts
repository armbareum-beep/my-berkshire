import { describe, it, expect } from "vitest";
import { planCompletionDate, type RebalancePlan } from "./plan";
import type { InvestmentEvent } from "./finance/valuation";

/**
 * 계획 완수일 판정 — 033 US2(연혁 영구화). leg별 BUY 누적이 baseBought+shares에
 * 도달한 날짜를 찾고, 전 leg 도달 시에만 완수(최댓값 날짜)로 본다.
 */

const buy = (
  symbol: string,
  date: string,
  quantity: number,
): InvestmentEvent => ({
  type: "BUY",
  symbol,
  date,
  quantity,
  priceOrAmount: 1000,
  feeAndTax: 0,
});

describe("planCompletionDate", () => {
  it("완수: 모든 leg가 목표치 도달 → 가장 늦은 날짜 반환", () => {
    const plan: RebalancePlan = {
      createdAt: "2026-01-01",
      legs: [
        { symbol: "AAA", name: "가", shares: 5, baseBought: 10 },
        { symbol: "BBB", name: "나", shares: 3, baseBought: 0 },
      ],
    };
    const events: InvestmentEvent[] = [
      buy("AAA", "2025-12-01", 10), // baseBought 형성분(계획 이전)
      buy("AAA", "2026-01-05", 3), // 누적 13 (목표 15 미달)
      buy("BBB", "2026-01-03", 3), // 누적 3, 목표 3 도달 — 2026-01-03
      buy("AAA", "2026-01-10", 2), // 누적 15, 목표 15 도달 — 2026-01-10
    ];
    expect(planCompletionDate(plan, events)).toBe("2026-01-10");
  });

  it("미완수: 한 leg라도 목표 미도달이면 null", () => {
    const plan: RebalancePlan = {
      createdAt: "2026-01-01",
      legs: [
        { symbol: "AAA", name: "가", shares: 5, baseBought: 0 },
        { symbol: "BBB", name: "나", shares: 10, baseBought: 0 },
      ],
    };
    const events: InvestmentEvent[] = [
      buy("AAA", "2026-01-05", 5), // AAA 도달
      buy("BBB", "2026-01-05", 4), // BBB 미도달(목표 10)
    ];
    expect(planCompletionDate(plan, events)).toBeNull();
  });

  it("부분 체결: 일부만 누적되었을 뿐 아직 목표 미도달 → null", () => {
    const plan: RebalancePlan = {
      createdAt: "2026-01-01",
      legs: [{ symbol: "AAA", name: "가", shares: 10, baseBought: 0 }],
    };
    const events: InvestmentEvent[] = [
      buy("AAA", "2026-01-05", 4),
      buy("AAA", "2026-01-10", 3), // 누적 7, 목표 10 미달
    ];
    expect(planCompletionDate(plan, events)).toBeNull();
  });

  it("마지막 leg 도달일 확인: 단일 leg가 정확히 목표 도달한 이벤트 날짜를 반환", () => {
    const plan: RebalancePlan = {
      createdAt: "2026-01-01",
      legs: [{ symbol: "AAA", name: "가", shares: 10, baseBought: 0 }],
    };
    const events: InvestmentEvent[] = [
      buy("AAA", "2026-01-02", 4), // 누적 4
      buy("AAA", "2026-01-06", 4), // 누적 8
      buy("AAA", "2026-01-09", 2), // 누적 10, 목표 도달 — 이 날짜가 완수일
      buy("AAA", "2026-01-15", 1), // 이후 추가 매수는 완수일에 영향 없음
    ];
    expect(planCompletionDate(plan, events)).toBe("2026-01-09");
  });
});
