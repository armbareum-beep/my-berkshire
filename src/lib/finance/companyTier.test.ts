import { describe, it, expect } from "vitest";
import { companyTier } from "./companyTier";

describe("companyTier", () => {
  it("납입 0이면 최하 등급, 진행도 0", () => {
    const t = companyTier(0);
    expect(t.index).toBe(0);
    expect(t.label).toBe("신생 투자회사");
    expect(t.progress).toBe(0);
    expect(t.nextLo).toBe(10_000_000);
  });

  it("음수·NaN은 0으로 처리(방어)", () => {
    expect(companyTier(-5_000_000).index).toBe(0);
    expect(companyTier(Number.NaN).index).toBe(0);
  });

  it("구간 경계에서 다음 등급으로 승급", () => {
    expect(companyTier(9_999_999).index).toBe(0);
    expect(companyTier(10_000_000).index).toBe(1);
    expect(companyTier(50_000_000).index).toBe(2);
    expect(companyTier(100_000_000).index).toBe(3);
    expect(companyTier(500_000_000).index).toBe(4);
  });

  it("등급 내 진행도는 다음 하한까지 선형(0~1)", () => {
    // 1단계(1천만~5천만): 3천만이면 (3000-1000)/(5000-1000)=0.5
    const t = companyTier(30_000_000);
    expect(t.index).toBe(1);
    expect(t.progress).toBeCloseTo(0.5, 5);
  });

  it("최상위 등급은 진행도 1, nextLo null", () => {
    const t = companyTier(2_000_000_000);
    expect(t.index).toBe(TIERS_LAST);
    expect(t.nextLo).toBeNull();
    expect(t.progress).toBe(1);
  });

  it("total은 등급 수와 일치", () => {
    expect(companyTier(0).total).toBe(5);
  });
});

const TIERS_LAST = 4;
