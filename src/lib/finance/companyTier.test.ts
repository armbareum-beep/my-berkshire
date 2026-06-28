import { describe, it, expect } from "vitest";
import { companyTier } from "./companyTier";

describe("companyTier", () => {
  it("자본·기간 모두 0이면 최하 등급", () => {
    const t = companyTier(0, 0);
    expect(t.index).toBe(0);
    expect(t.label).toBe("신생 투자회사");
    expect(t.capitalProgress).toBe(0);
    expect(t.monthsProgress).toBe(0);
    expect(t.nextLo).toBe(10_000_000);
    expect(t.nextMinMonths).toBe(6);
  });

  it("음수·NaN은 0으로 처리(방어)", () => {
    expect(companyTier(-5_000_000, 0).index).toBe(0);
    expect(companyTier(Number.NaN, 0).index).toBe(0);
    expect(companyTier(0, -3).index).toBe(0);
  });

  it("자본만 충족하면 승급 안 됨 (AND 게이트)", () => {
    // 1천만 이상이지만 기간 6개월 미달
    expect(companyTier(10_000_000, 5).index).toBe(0);
    expect(companyTier(50_000_000, 11).index).toBe(1); // 자본은 3단계지만 기간이 1단계 충족
  });

  it("기간만 충족하면 승급 안 됨 (AND 게이트)", () => {
    expect(companyTier(9_999_999, 100).index).toBe(0);
  });

  it("자본·기간 둘 다 충족하면 승급", () => {
    expect(companyTier(10_000_000, 6).index).toBe(1);
    expect(companyTier(50_000_000, 12).index).toBe(2);
    expect(companyTier(100_000_000, 24).index).toBe(3);
    expect(companyTier(500_000_000, 36).index).toBe(4);
    expect(companyTier(5_000_000_000, 60).index).toBe(5);
  });

  it("등급 내 자본 진행도는 다음 하한까지 선형(0~1)", () => {
    // 1단계(1천만~5천만, 6개월~12개월): 자본 3천만이면 (3000-1000)/(5000-1000)=0.5
    const t = companyTier(30_000_000, 9);
    expect(t.index).toBe(1);
    expect(t.capitalProgress).toBeCloseTo(0.5, 5);
  });

  it("등급 내 기간 진행도는 다음 하한까지 선형(0~1)", () => {
    // 1단계(6개월~12개월): 9개월이면 (9-6)/(12-6)=0.5
    const t = companyTier(30_000_000, 9);
    expect(t.monthsProgress).toBeCloseTo(0.5, 5);
  });

  it("최상위 등급은 진행도 1, next null", () => {
    const t = companyTier(5_000_000_000, 60);
    expect(t.index).toBe(TIERS_LAST);
    expect(t.nextLo).toBeNull();
    expect(t.nextMinMonths).toBeNull();
    expect(t.capitalProgress).toBe(1);
    expect(t.monthsProgress).toBe(1);
  });

  it("total은 등급 수와 일치", () => {
    expect(companyTier(0, 0).total).toBe(6);
  });
});

const TIERS_LAST = 5;
