import { describe, expect, it } from "vitest";
import {
  attractivenessFromCagr,
  buyStatus,
  computeExpectedReturn,
  DEFAULT_HOLDING_YEARS,
  DEFAULT_REQUIRED_RETURN,
} from "./expectedReturn";

describe("computeExpectedReturn — 기본 공식", () => {
  it("PRD §4 식을 그대로 계산한다", () => {
    // EPS 10, 성장 10%, 5년, 종료 PER 20, 요구수익률 12%
    const r = computeExpectedReturn({
      currentMetric: 10,
      expectedGrowth: 0.1,
      terminalMultiple: 20,
      holdingYears: 5,
      requiredReturn: 0.12,
    })!;

    // 미래이익 = 10 × 1.1^5 = 16.1051 → 미래가격 = × 20 = 322.102
    expect(r.futurePrice).toBeCloseTo(322.102, 3);
    // 매수가 = 322.102 / 1.12^5
    expect(r.buyPrice).toBeCloseTo(322.102 / Math.pow(1.12, 5), 3);
  });

  it("현재가가 매수가와 같으면 기대 CAGR = 요구수익률", () => {
    const base = {
      currentMetric: 10,
      expectedGrowth: 0.1,
      terminalMultiple: 20,
      holdingYears: 5,
      requiredReturn: 0.12,
    };
    const r0 = computeExpectedReturn(base)!;
    const r = computeExpectedReturn(base, r0.buyPrice)!;

    expect(r.expectedCagr).toBeCloseTo(0.12, 9);
    expect(r.buyable).toBe(true); // 경계값은 매수 가능
  });

  it("현재가가 싸면 기대 CAGR이 요구수익률을 넘고 BUYABLE", () => {
    const r = computeExpectedReturn(
      { currentMetric: 10, expectedGrowth: 0.1, terminalMultiple: 20 },
      100,
    )!;
    expect(r.expectedCagr!).toBeGreaterThan(DEFAULT_REQUIRED_RETURN);
    expect(r.buyable).toBe(true);
    expect(buyStatus(r)).toBe("BUYABLE");
  });

  it("현재가가 비싸면 WAIT", () => {
    const r = computeExpectedReturn(
      { currentMetric: 10, expectedGrowth: 0.1, terminalMultiple: 20 },
      1000,
    )!;
    expect(r.expectedCagr!).toBeLessThan(DEFAULT_REQUIRED_RETURN);
    expect(r.buyable).toBe(false);
    expect(buyStatus(r)).toBe("WAIT");
  });

  it("기본값은 5년 · 12%", () => {
    const r = computeExpectedReturn({
      currentMetric: 10,
      expectedGrowth: 0,
      terminalMultiple: 15,
    })!;
    expect(r.holdingYears).toBe(DEFAULT_HOLDING_YEARS);
    expect(r.requiredReturn).toBe(DEFAULT_REQUIRED_RETURN);
  });

  it("현재가를 모르면 매수가는 나오고 CAGR만 null", () => {
    const r = computeExpectedReturn({
      currentMetric: 10,
      expectedGrowth: 0.1,
      terminalMultiple: 20,
    })!;
    expect(r.buyPrice).toBeGreaterThan(0);
    expect(r.expectedCagr).toBeNull();
    expect(r.buyable).toBeNull();
    expect(buyStatus(r)).toBe("UNAVAILABLE");
  });
});

describe("computeExpectedReturn — 적용 불가 (가짜 정밀 금지)", () => {
  it("적자면 계산하지 않는다", () => {
    expect(
      computeExpectedReturn({
        currentMetric: -3,
        expectedGrowth: 0.1,
        terminalMultiple: 20,
      }),
    ).toBeNull();
  });

  it("이익력 0도 계산하지 않는다", () => {
    expect(
      computeExpectedReturn({
        currentMetric: 0,
        expectedGrowth: 0.1,
        terminalMultiple: 20,
      }),
    ).toBeNull();
  });

  it("종료배수가 0 이하면 계산하지 않는다", () => {
    expect(
      computeExpectedReturn({
        currentMetric: 10,
        expectedGrowth: 0.1,
        terminalMultiple: 0,
      }),
    ).toBeNull();
  });

  it("보유기간이 0 이하면 계산하지 않는다", () => {
    expect(
      computeExpectedReturn({
        currentMetric: 10,
        expectedGrowth: 0.1,
        terminalMultiple: 20,
        holdingYears: 0,
      }),
    ).toBeNull();
  });

  it("성장률 −100% 이하는 계산하지 않는다", () => {
    expect(
      computeExpectedReturn({
        currentMetric: 10,
        expectedGrowth: -1,
        terminalMultiple: 20,
      }),
    ).toBeNull();
  });

  it("현재가가 0이면 CAGR은 null (나눗셈 폭발 방지)", () => {
    const r = computeExpectedReturn(
      { currentMetric: 10, expectedGrowth: 0.1, terminalMultiple: 20 },
      0,
    )!;
    expect(r.expectedCagr).toBeNull();
  });
});

describe("computeExpectedReturn — 실적이 바뀌면 매수가가 따라 오른다 (PRD §10)", () => {
  it("EPS가 오르면 매수가도 오른다", () => {
    const before = computeExpectedReturn({
      currentMetric: 1.17,
      expectedGrowth: 0.35,
      terminalMultiple: 50,
    })!;
    const after = computeExpectedReturn({
      currentMetric: 1.35,
      expectedGrowth: 0.35,
      terminalMultiple: 50,
    })!;
    expect(after.buyPrice).toBeGreaterThan(before.buyPrice);
  });

  it("실적 상승만으로 대기 → 매수가능 으로 바뀐다 (PRD §10 PLTR 예시)", () => {
    // PRD 가정 그대로: Expected EPS CAGR 35% · Terminal PER 50 · Required Return 12%
    // 현재가 $158 은 그대로 두고 TTM EPS 만 1.17 → 1.35 로 오른다.
    const assume = { expectedGrowth: 0.35, terminalMultiple: 50 };
    const before = computeExpectedReturn({ ...assume, currentMetric: 1.17 }, 158)!;
    const after = computeExpectedReturn({ ...assume, currentMetric: 1.35 }, 158)!;

    // 매수가가 현재가를 타고 넘는다(PRD 는 $149 → $172 로 예시).
    expect(before.buyPrice).toBeLessThan(158);
    expect(after.buyPrice).toBeGreaterThan(158);
    expect(before.buyable).toBe(false);
    expect(after.buyable).toBe(true);

    // "가격이 내려오거나, 기업가치가 가격을 따라잡으면 산다"(PRD §4)
    expect(after.expectedCagr!).toBeGreaterThan(before.expectedCagr!);
  });
});

describe("attractivenessFromCagr — allocate 연결", () => {
  it("가정이 없으면 중립 1.0 (비중 기반 배분 유지)", () => {
    expect(attractivenessFromCagr(null)).toBe(1);
  });

  it("요구수익률 미달이면 0 — 후보 제외", () => {
    expect(attractivenessFromCagr(0.08, 0.12)).toBe(0);
  });

  it("요구수익률과 같으면 1.0", () => {
    expect(attractivenessFromCagr(0.12, 0.12)).toBeCloseTo(1);
  });

  it("초과 스프레드에 비례해 커진다", () => {
    // +5%p → 1 + 0.05 × 10 = 1.5
    expect(attractivenessFromCagr(0.17, 0.12)).toBeCloseTo(1.5);
    // 더 높은 쪽이 항상 더 크다
    expect(attractivenessFromCagr(0.2, 0.12)).toBeGreaterThan(
      attractivenessFromCagr(0.17, 0.12),
    );
  });

  it("요구수익률이 달라도 같은 스프레드면 같은 계수 (비율식이 아님)", () => {
    // 비율(cagr/required)로 만들면 요구수익률 낮은 쪽이 유리해져 비교가 왜곡된다.
    expect(attractivenessFromCagr(0.15, 0.1)).toBeCloseTo(
      attractivenessFromCagr(0.25, 0.2),
    );
  });

  it("음수 CAGR도 0으로 떨어진다", () => {
    expect(attractivenessFromCagr(-0.1, 0.12)).toBe(0);
  });
});
