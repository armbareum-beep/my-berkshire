import { describe, expect, it } from "vitest";
import {
  buildPublicMilestones,
  parsePublicMilestones,
} from "./rankingMilestones";
import type { InvestmentEvent } from "./finance/valuation";
import type { DrawdownEpisode } from "./finance/drawdown";

const today = "2026-07-04";

const events: InvestmentEvent[] = [
  {
    type: "BUY",
    symbol: "TECHETF",
    quantity: 10,
    priceOrAmount: 8_000,
    feeAndTax: 0,
    date: "2026-01-05",
  },
  {
    type: "DIVIDEND",
    symbol: "TECHETF",
    priceOrAmount: 30_000,
    feeAndTax: 0,
    date: "2026-03-10",
  },
  // 계획 1(완수): B 10주 목표 → 2026-02-01에 10주 도달
  {
    type: "BUY",
    symbol: "B",
    quantity: 10,
    priceOrAmount: 5_000,
    feeAndTax: 0,
    date: "2026-02-01",
  },
  // 계획 2(미완수): C 100주 목표인데 5주만 매수
  {
    type: "BUY",
    symbol: "C",
    quantity: 5,
    priceOrAmount: 1_000,
    feeAndTax: 0,
    date: "2026-02-15",
  },
];

const archivedPlans = [
  {
    createdAt: "2026-01-01",
    legs: [{ symbol: "B", name: "종목B", shares: 10, baseBought: 0 }],
  },
  {
    createdAt: "2026-01-01",
    legs: [{ symbol: "C", name: "종목C", shares: 100, baseBought: 0 }],
  },
];

const drawdownEpisodes: DrawdownEpisode[] = [
  {
    peakDate: "2025-09-01",
    startDate: "2025-09-15",
    troughDate: "2025-10-01",
    depth: -0.23,
    bucket: 20,
    recoveryDate: "2025-11-03",
    passed: true,
  },
  {
    peakDate: "2025-12-01",
    startDate: "2025-12-10",
    troughDate: "2025-12-20",
    depth: -0.31,
    bucket: 30,
    recoveryDate: null,
    passed: false, // 미회복 — 연혁 대상 아님
  },
];

describe("buildPublicMilestones", () => {
  const result = buildPublicMilestones({
    holding: { archived_plans: archivedPlans, first_listed_at: null },
    events,
    drawdownEpisodes,
    today,
  });

  it("완수된 계획만 카운트한다(미완수 제외)", () => {
    expect(result.plans_completed).toBe(1);
    expect(result.plan_completed_dates).toEqual(["2026-02-01"]);
  });

  it("passed=true 드로다운만 포함한다", () => {
    expect(result.drawdowns_passed).toEqual([
      { bucket: 20, recovered_at: "2025-11-03" },
    ]);
  });

  it("첫 매수·첫 해외 인수·첫 배당 날짜를 채운다", () => {
    expect(result.first_buy_at).toBe("2026-01-05");
    expect(result.first_dividend_at).toBe("2026-03-10");
    // TECHETF는 6자리 국내코드가 아니라 해외(기타) 취급 → 첫 매수와 동일 날짜
    expect(result.first_overseas_at).toBe("2026-01-05");
  });

  it("결과에 금액·종목명 필드가 없다(비공개 불변식)", () => {
    const keys = Object.keys(result).sort();
    expect(keys).toEqual(
      [
        "v",
        "plans_completed",
        "plan_completed_dates",
        "drawdowns_passed",
        "first_buy_at",
        "first_overseas_at",
        "first_dividend_at",
        "listed_at",
      ].sort(),
    );
    const serialized = JSON.stringify(result);
    // 종목명·기업명 라벨이 어떤 형태로도 유입되지 않음
    expect(serialized).not.toContain("TECHETF");
    expect(serialized).not.toContain("종목B");
    expect(serialized).not.toContain("종목C");
    // 금액(quantity*price 등) 리터럴이 유입되지 않음
    expect(serialized).not.toContain("8000");
    expect(serialized).not.toContain("30000");
    expect(serialized).not.toContain("5000");
  });

  it("archived_plans 가 배열이 아니면 방어적으로 빈 계획 취급", () => {
    const r = buildPublicMilestones({
      holding: { archived_plans: null, first_listed_at: null },
      events,
      drawdownEpisodes: [],
      today,
    });
    expect(r.plans_completed).toBe(0);
    expect(r.plan_completed_dates).toEqual([]);
    expect(r.drawdowns_passed).toEqual([]);
  });

  it("first_listed_at 이 있으면 listed_at 에 그대로 담는다", () => {
    const r = buildPublicMilestones({
      holding: { archived_plans: archivedPlans, first_listed_at: "2026-05-01" },
      events,
      drawdownEpisodes,
      today,
    });
    expect(r.listed_at).toBe("2026-05-01");
  });

  it("first_listed_at 이 없으면(null) listed_at 도 null이다", () => {
    expect(result.listed_at).toBeNull();
  });
});

describe("parsePublicMilestones", () => {
  it("정상 v1 payload를 그대로 파싱한다(listed_at 포함)", () => {
    const raw = {
      v: 1,
      plans_completed: 1,
      plan_completed_dates: ["2026-02-01"],
      drawdowns_passed: [{ bucket: 20, recovered_at: "2025-11-03" }],
      first_buy_at: "2026-01-05",
      first_overseas_at: null,
      first_dividend_at: "2026-03-10",
      listed_at: "2026-04-01",
    };
    expect(parsePublicMilestones(raw)).toEqual(raw);
  });

  it("listed_at 필드가 없는 036 이전 구버전 jsonb는 null로 채운다(하위호환, additive)", () => {
    const legacy = {
      v: 1,
      plans_completed: 1,
      plan_completed_dates: ["2026-02-01"],
      drawdowns_passed: [{ bucket: 20, recovered_at: "2025-11-03" }],
      first_buy_at: "2026-01-05",
      first_overseas_at: null,
      first_dividend_at: "2026-03-10",
      // listed_at 필드 자체가 없음(036 이전 저장분)
    };
    const parsed = parsePublicMilestones(legacy);
    expect(parsed?.listed_at).toBeNull();
    expect(parsed).toEqual({ ...legacy, listed_at: null });
  });

  it("null·비객체·버전 불일치는 null 반환", () => {
    expect(parsePublicMilestones(null)).toBeNull();
    expect(parsePublicMilestones("aa")).toBeNull();
    expect(parsePublicMilestones({ v: 2 })).toBeNull();
    expect(parsePublicMilestones({ v: 1 })).toBeNull(); // 필수 필드 없음
  });
});
