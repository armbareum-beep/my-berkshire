import { describe, it, expect } from "vitest";
import { isComparable, latestComparableDeal, normalizeComplexName } from "./match";
import type { RtmsDeal } from "./parse";

function deal(over: Partial<RtmsDeal>): RtmsDeal {
  return {
    name: "래미안원베일리",
    area: 84.98,
    amountKrw: 1_000_000_000,
    date: "2026-06-01",
    floor: 10,
    dong: "반포동",
    jibun: "1",
    ...over,
  };
}

describe("normalizeComplexName", () => {
  it("공백·대소문자를 무시한다", () => {
    expect(normalizeComplexName("래미안 원베일리")).toBe(normalizeComplexName("래미안원베일리"));
    expect(normalizeComplexName("The Sharp")).toBe(normalizeComplexName("thesharp"));
  });
});

describe("isComparable", () => {
  it("동일 단지 + 면적 ±10% 경계를 포함한다", () => {
    expect(isComparable(deal({ area: 84.98 * 1.1 }), "래미안 원베일리", 84.98)).toBe(true);
    expect(isComparable(deal({ area: 84.98 * 0.9 }), "래미안 원베일리", 84.98)).toBe(true);
    expect(isComparable(deal({ area: 84.98 * 1.11 }), "래미안 원베일리", 84.98)).toBe(false);
  });

  it("다른 단지는 면적이 같아도 제외한다", () => {
    expect(isComparable(deal({ name: "아크로리버파크" }), "래미안원베일리", 84.98)).toBe(false);
  });
});

describe("latestComparableDeal", () => {
  it("조건 만족 거래 중 계약일 최신 1건을 고른다", () => {
    const deals = [
      deal({ date: "2026-06-03", amountKrw: 1 }),
      deal({ date: "2026-06-21", amountKrw: 2 }),
      deal({ date: "2026-06-10", amountKrw: 3 }),
      deal({ date: "2026-06-25", amountKrw: 4, name: "다른단지" }),
    ];
    expect(latestComparableDeal(deals, "래미안원베일리", 84.98)?.amountKrw).toBe(2);
  });

  it("매칭 없으면 null", () => {
    expect(latestComparableDeal([deal({ area: 59.9 })], "래미안원베일리", 84.98)).toBeNull();
  });
});
