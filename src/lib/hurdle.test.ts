import { describe, expect, it } from "vitest";
import { effectiveHurdle, houseHurdle, levelOf, HURDLE_LEVELS } from "./hurdle";
import { DEFAULT_REQUIRED_RETURN } from "./finance/expectedReturn";

describe("houseHurdle — 전사 기본 요구수익률", () => {
  it("안 정했으면 코드 기본값(12%)", () => {
    expect(houseHurdle(null)).toBe(DEFAULT_REQUIRED_RETURN);
    expect(houseHurdle(undefined)).toBe(DEFAULT_REQUIRED_RETURN);
  });

  it("정했으면 그 값", () => {
    expect(houseHurdle(0.15)).toBe(0.15);
  });

  it("범위를 벗어난 값은 기본값으로 — 0·음수·1 초과", () => {
    expect(houseHurdle(0)).toBe(DEFAULT_REQUIRED_RETURN);
    expect(houseHurdle(-0.1)).toBe(DEFAULT_REQUIRED_RETURN);
    expect(houseHurdle(1.5)).toBe(DEFAULT_REQUIRED_RETURN);
    expect(houseHurdle(Number.NaN)).toBe(DEFAULT_REQUIRED_RETURN);
  });
});

describe("effectiveHurdle — 종목별이 전사 기본값을 이긴다", () => {
  it("종목별 값이 있으면 그게 우선", () => {
    // "이 기업만은 20% 아니면 안 산다"가 전사 기본값에 덮이면 안 된다.
    expect(effectiveHurdle(0.2, 0.15)).toBe(0.2);
  });

  it("종목별이 없으면 전사 기본값", () => {
    expect(effectiveHurdle(null, 0.15)).toBe(0.15);
  });

  it("둘 다 없으면 코드 기본값", () => {
    expect(effectiveHurdle(null, null)).toBe(DEFAULT_REQUIRED_RETURN);
  });

  it("종목별 값이 비정상이면 전사 기본값으로 내려간다", () => {
    expect(effectiveHurdle(0, 0.15)).toBe(0.15);
    expect(effectiveHurdle(2, 0.15)).toBe(0.15);
  });
});

describe("HURDLE_LEVELS — 난이도 프리셋", () => {
  it("표준은 PRD 기본값과 같다", () => {
    expect(levelOf(DEFAULT_REQUIRED_RETURN)?.key).toBe("standard");
  });

  it("난이도가 올라갈수록 요구수익률이 높다", () => {
    const rates = HURDLE_LEVELS.map((l) => l.rate);
    expect(rates).toEqual([...rates].sort((a, b) => a - b));
  });

  it("프리셋 밖의 값은 '직접 입력'이라 매칭되지 않는다", () => {
    expect(levelOf(0.135)).toBeNull();
  });
});
