import { describe, expect, it } from "vitest";
import { computeRankingScore, RANKING_WEIGHTS, assetBucketLabel } from "./ranking";
import type { InvestmentEvent, PriceMap } from "./finance/valuation";
import type { ReturnResult } from "./finance/returns";
import type { BenchmarkResult } from "./finance/benchmark";
import { todayKST } from "./date";

function daysAgo(days: number) {
  return new Date(Date.parse(`${todayKST()}T00:00:00Z`) - days * 86400000)
    .toISOString()
    .slice(0, 10);
}

const today = todayKST();
const foundedAt = daysAgo(400);
const prices: PriceMap = { A: 1_000 };

const baseEvents: InvestmentEvent[] = [
  {
    type: "BUY",
    symbol: "A",
    quantity: 100,
    priceOrAmount: 1_000,
    feeAndTax: 0,
    date: daysAgo(300),
  },
];

const benchmark = {
  status: "unavailable",
  label: "KOSPI",
  benchmarkXirr: null,
  benchmarkCumulative: null,
  benchmarkTerminal: null,
} as unknown as BenchmarkResult;

function baseResult(currentValuation: number | null): ReturnResult {
  return {
    status: currentValuation == null ? "price_unavailable" : "xirr",
    xirr: currentValuation == null ? null : 0.1,
    cumulativeReturn: null,
    cagr: null,
    currentValuation,
    days: 300,
    missingSymbols: currentValuation == null ? ["A"] : [],
  };
}

describe("computeRankingScore — 저비용(drag)", () => {
  it("drag 0% → lowCost 만점, insufficient=false", () => {
    const score = computeRankingScore(
      baseEvents,
      prices,
      foundedAt,
      baseResult(1_000_000),
      benchmark,
      today,
      { initialValuation: 1_000_000, debtKrw: 0 },
    );
    expect(score.lowCost).toBe(100);
    expect(score.costInsufficient).toBe(false);
  });

  it("drag 2% 경계 → lowCost 0점", () => {
    const events: InvestmentEvent[] = [
      ...baseEvents,
      {
        type: "SELL",
        symbol: "A",
        quantity: 10,
        priceOrAmount: 1_000,
        feeAndTax: 20_000, // 원금 1,000,000의 2%
        date: daysAgo(200),
      },
    ];
    const score = computeRankingScore(
      events,
      prices,
      foundedAt,
      baseResult(1_000_000),
      benchmark,
      today,
      { initialValuation: 1_000_000, debtKrw: 0 },
    );
    expect(score.lowCost).toBe(0);
    expect(score.costInsufficient).toBe(false);
  });

  it("투자원금 0(설립자본·입금 모두 없음) → insufficient(50점)", () => {
    const score = computeRankingScore(
      baseEvents,
      prices,
      foundedAt,
      baseResult(1_000_000),
      benchmark,
      today,
      { initialValuation: 0, debtKrw: 0 },
    );
    expect(score.lowCost).toBe(50);
    expect(score.costInsufficient).toBe(true);
  });
});

describe("computeRankingScore — 저레버리지(부채/자산)", () => {
  it("무차입(debtKrw=0) → lowLeverage 만점, insufficient=false", () => {
    const score = computeRankingScore(
      baseEvents,
      prices,
      foundedAt,
      baseResult(1_000_000),
      benchmark,
      today,
      { initialValuation: 1_000_000, debtKrw: 0 },
    );
    expect(score.lowLeverage).toBe(100);
    expect(score.leverageInsufficient).toBe(false);
  });

  it("부채/자산 40% 경계 → lowLeverage 0점", () => {
    const score = computeRankingScore(
      baseEvents,
      prices,
      foundedAt,
      baseResult(1_000_000),
      benchmark,
      today,
      { initialValuation: 1_000_000, debtKrw: 400_000 },
    );
    expect(score.lowLeverage).toBe(0);
    expect(score.leverageInsufficient).toBe(false);
  });

  it("시세 실패(currentValuation null) + 부채 있음 → insufficient(50점)", () => {
    const score = computeRankingScore(
      baseEvents,
      prices,
      foundedAt,
      baseResult(null),
      benchmark,
      today,
      { initialValuation: 1_000_000, debtKrw: 100_000 },
    );
    expect(score.lowLeverage).toBe(50);
    expect(score.leverageInsufficient).toBe(true);
  });

  it("시세 실패라도 부채가 없으면(무차입) insufficient 아님", () => {
    const score = computeRankingScore(
      baseEvents,
      prices,
      foundedAt,
      baseResult(null),
      benchmark,
      today,
      { initialValuation: 1_000_000, debtKrw: 0 },
    );
    expect(score.lowLeverage).toBe(100);
    expect(score.leverageInsufficient).toBe(false);
  });
});

describe("RANKING_WEIGHTS", () => {
  it("7개 지표 가중치 합 = 100%", () => {
    const sum = Object.values(RANKING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
  });
});

describe("assetBucketLabel — 자산 구간 경계값", () => {
  it("null(시세 실패) → null", () => {
    expect(assetBucketLabel(null)).toBeNull();
  });

  it("1천만 미만", () => {
    expect(assetBucketLabel(0)).toBe("1천만 미만");
    expect(assetBucketLabel(9_999_999)).toBe("1천만 미만");
  });

  it("1천만 정확한 경계 → 하한 포함(1천만~5천만)", () => {
    expect(assetBucketLabel(10_000_000)).toBe("1천만~5천만");
  });

  it("1억 정확한 경계 → 하한 포함(1억~3억)", () => {
    expect(assetBucketLabel(100_000_000)).toBe("1억~3억");
    expect(assetBucketLabel(99_999_999)).toBe("5천만~1억");
  });

  it("30억 정확한 경계 → 하한 포함(30억 이상)", () => {
    expect(assetBucketLabel(3_000_000_000)).toBe("30억 이상");
    expect(assetBucketLabel(2_999_999_999)).toBe("10억~30억");
  });
});
