import { describe, expect, it } from "vitest";
import { computeStyle, gradeRank } from "./style";
import type { Portfolio } from "./portfolio";
import type { DashboardData } from "./dashboard";
import { todayKST } from "./date";

function daysAgo(days: number) {
  return new Date(Date.parse(`${todayKST()}T00:00:00Z`) - days * 86400000)
    .toISOString()
    .slice(0, 10);
}

const portfolio = {
  holding: {
    founded_at: daysAgo(500),
    initial_valuation: 1_000_000,
  },
  events: [
    {
      type: "BUY",
      symbol: "TECHETF",
      quantity: 100,
      priceOrAmount: 8_000,
      feeAndTax: 1_000,
      date: daysAgo(400),
    },
    {
      type: "DIVIDEND",
      symbol: "TECHETF",
      priceOrAmount: 30_000,
      feeAndTax: 4_500,
      date: daysAgo(100),
    },
  ],
  result: { currentValuation: 1_100_000 },
} as unknown as Portfolio;

const dashboard = {
  allocation: [
    {
      symbol: "TECHETF",
      name: "Tech ETF",
      quantity: 100,
      price: 9_000,
      value: 900_000,
      weight: 0.9,
      avgCost: 8_000,
      changeRate: 0.125,
    },
  ],
  cashWeight: 0.18,
  drag: 0.001,
} as unknown as DashboardData;

describe("computeStyle multi-axis", () => {
  const style = computeStyle(portfolio, dashboard, 0, null, {
    TECHETF: {
      name: "Tech ETF",
      country: "미국",
      assetType: "ETF",
      currency: "USD",
      sector: "정보기술",
    },
  });

  it("행동 기반 7축을 모두 계산한다", () => {
    expect(style.dimensions.map((dimension) => dimension.key)).toEqual([
      "longTerm",
      "concentration",
      "income",
      "defensive",
      "global",
      "index",
      "innovation",
    ]);
    expect(style.dimensions).toHaveLength(7);
  });

  it("ETF·해외·혁신 섹터 메타데이터를 비중 점수에 반영한다", () => {
    const score = Object.fromEntries(
      style.dimensions.map((dimension) => [dimension.key, dimension.score]),
    );
    expect(score.index).toBe(1);
    expect(score.global).toBe(1);
    expect(score.innovation).toBe(1);
  });

  it("주 성향 하나와 중복 없는 보조 성향 두 개를 선정한다", () => {
    expect(style.primaryStyle).not.toBeNull();
    expect(style.secondaryStyles).toHaveLength(2);
    expect(
      new Set([
        style.primaryStyle?.key,
        ...style.secondaryStyles.map((item) => item.key),
      ]).size,
    ).toBe(3);
  });

  it("강한 두 축이 선별 조합에 해당하면 희소 조합 칭호를 부여한다", () => {
    expect(style.compositeStyle?.label).toBe("벤처 캐피탈리스트");
    expect(style.label).toBe("벤처 캐피탈리스트");
    expect(style.primaryStyle?.key).toBe("concentration");
  });

  it("섹터 분류가 부족하면 혁신 축을 0점으로 단정하지 않는다", () => {
    const withoutSector = computeStyle(portfolio, dashboard, 0, null, {
      TECHETF: {
        name: "Tech ETF",
        country: "미국",
        assetType: "ETF",
        currency: "USD",
        sector: null,
      },
    });
    const innovation = withoutSector.dimensions.find(
      (dimension) => dimension.key === "innovation",
    );
    expect(innovation?.available).toBe(false);
    expect(innovation?.display).toBe("분석 대기");
    expect(withoutSector.confidence?.score).toBeLessThan(style.confidence!.score);
  });
});

describe("gradeRank", () => {
  it("gradeOf 라벨 서열을 실제 문자열 기준으로 매긴다", () => {
    expect(gradeRank("과매매 주의")).toBe(0);
    expect(gradeRank("성장하는 투자가")).toBe(1);
    expect(gradeRank("규율 있는 장기투자가")).toBe(2);
    expect(gradeRank("자본배분의 달인")).toBe(3);
  });

  it("알 수 없는 라벨은 -1(비교 불가)", () => {
    expect(gradeRank("존재하지 않는 등급")).toBe(-1);
  });
});
