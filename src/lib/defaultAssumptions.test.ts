import { describe, expect, it } from "vitest";
import {
  DEFAULT_GROWTH,
  defaultAssumptionFor,
  needsDefault,
} from "./defaultAssumptions";
import { computeExpectedReturn } from "./finance/expectedReturn";

describe("defaultAssumptionFor — 종료배수는 지금 PER", () => {
  it("현재 PER 를 그대로 종료배수로 쓴다", () => {
    const a = defaultAssumptionFor(70000, 5000)!;
    expect(a.terminalMultiple).toBeCloseTo(14);
    expect(a.expectedGrowth).toBe(DEFAULT_GROWTH);
  });

  it("성장률을 바꿔 넣을 수 있다", () => {
    expect(defaultAssumptionFor(70000, 5000, 0.05)!.expectedGrowth).toBe(0.05);
  });

  it("적자·0 이익은 못 만든다 — 음수 PER 는 '배수 유지'가 성립하지 않는다", () => {
    expect(defaultAssumptionFor(70000, 0)).toBeNull();
    expect(defaultAssumptionFor(70000, -100)).toBeNull();
  });

  it("가격을 모르면 못 만든다", () => {
    expect(defaultAssumptionFor(0, 5000)).toBeNull();
    expect(defaultAssumptionFor(NaN, 5000)).toBeNull();
  });
});

describe("기본값의 성질 — 기대수익률이 곧 성장률", () => {
  // 배수가 그대로면 식이 상쇄된다: (EPS×(1+g)^Y×PER) ÷ (EPS×PER) = (1+g)^Y
  it("전 종목이 성장률과 같은 기대 CAGR 을 갖는다", () => {
    for (const [price, eps] of [
      [70000, 5000],
      [250, 4],
      [1_200_000, 30_000],
    ]) {
      const a = defaultAssumptionFor(price, eps)!;
      const er = computeExpectedReturn(
        {
          currentMetric: eps,
          expectedGrowth: a.expectedGrowth,
          terminalMultiple: a.terminalMultiple,
          requiredReturn: 0.12,
        },
        price,
      );
      expect(er?.expectedCagr).toBeCloseTo(DEFAULT_GROWTH, 6);
    }
  });

  it("성장률을 고쳐야 순위가 갈린다 — 그게 이 기본값의 한계다", () => {
    const cheap = defaultAssumptionFor(70000, 5000)!; // PER 14
    const rich = defaultAssumptionFor(70000, 1000)!; // PER 70
    // 배수가 3배 넘게 달라도 기대수익률은 같다.
    expect(cheap.expectedGrowth).toBe(rich.expectedGrowth);
    expect(cheap.terminalMultiple).not.toBeCloseTo(rich.terminalMultiple);
  });
});

describe("needsDefault — 사람이 정한 값은 안 덮는다", () => {
  it("둘 다 비어 있을 때만 채운다", () => {
    expect(needsDefault({ expectedGrowth: null, terminalMultiple: null })).toBe(
      true,
    );
  });

  it("하나라도 있으면 건너뛴다 — 반쯤 채우면 내 값과 앱 값이 섞인다", () => {
    expect(needsDefault({ expectedGrowth: 0.12, terminalMultiple: null })).toBe(
      false,
    );
    expect(needsDefault({ expectedGrowth: null, terminalMultiple: 15 })).toBe(
      false,
    );
    expect(needsDefault({ expectedGrowth: 0.12, terminalMultiple: 15 })).toBe(
      false,
    );
  });
});
