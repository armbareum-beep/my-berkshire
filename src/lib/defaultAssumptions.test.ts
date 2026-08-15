import { describe, expect, it } from "vitest";
import {
  DEFAULT_GROWTH,
  GROWTH_CAP,
  defaultAssumptionFor,
  historicalGrowth,
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

describe("historicalGrowth — 사장님 실제 종목으로", () => {
  const p = (start: number, ...eps: number[]) =>
    eps.map((e, i) => ({ year: start + i, eps: e }));

  it("정상 종목은 그대로 쓴다 — 삼성전자", () => {
    const r = historicalGrowth(p(2020, 4370, 6574, 9168, 2424, 5660, 7595));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.growth).toBeCloseTo(0.117, 2);
      expect(r.value.clamped).toBe(false);
      expect(r.value.span).toBe(5);
    }
  });

  it("BGF리테일 · NICE평가정보도 한 자릿수로 나온다", () => {
    const bgf = historicalGrowth(p(2020, 7103, 8547, 11203, 11337, 11301, 11303));
    const nice = historicalGrowth(p(2020, 789, 915, 884, 948, 1299, 1319));
    expect(bgf.ok && bgf.value.growth).toBeCloseTo(0.097, 2);
    expect(nice.ok && nice.value.growth).toBeCloseTo(0.108, 2);
  });

  it("적자 연도가 끼면 안 쓴다 — SK하이닉스 2023년 −13,242원", () => {
    // 끝점만 보면 +54.5% 다. 두 점 CAGR 이 사이클을 지우는 정확한 사례.
    const r = historicalGrowth(p(2020, 6952, 13965, 3242, -13242, 28719, 61165));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("loss");
  });

  it("시작 연도가 적자여도 안 쓴다 — 백산 2020년 −665원", () => {
    const r = historicalGrowth(p(2020, -665, 792, 1935, 1835, 2851, 1640));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("loss");
  });

  it("일회성으로 튄 해가 있어도 끝점이 멀쩡하면 쓴다 — NAVER 2021년 라인 합병", () => {
    // 이건 자르기가 막는다: 원래 +17.9% → 15%.
    const r = historicalGrowth(p(2020, 5730, 110367, 5069, 6721, 12914, 13058));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.raw).toBeCloseTo(0.179, 2);
      expect(r.value.growth).toBe(GROWTH_CAP);
      expect(r.value.clamped).toBe(true);
    }
  });

  it("높게 튄 값은 자르고 원래 값을 남긴다 — 휴젤 +31.2%", () => {
    const r = historicalGrowth(p(2020, 3353, 4744, 4856, 8512, 12616, 13040));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.raw).toBeGreaterThan(0.3);
      expect(r.value.growth).toBe(GROWTH_CAP);
      expect(r.value.clamped).toBe(true);
    }
  });

  it("역성장은 0%로 자르지 않고 아예 안 쓴다 — 0%는 관측이 아니라 판단이다", () => {
    const r = historicalGrowth(p(2020, 5000, 4500, 4000, 3500));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("negative");
  });

  it("연도가 모자라면 안 쓴다 — 한 해 차이는 그냥 작년 증감률이다", () => {
    expect(historicalGrowth(p(2025, 3300)).ok).toBe(false);
    expect(historicalGrowth(p(2024, 1000, 1200)).ok).toBe(false);
    const short = historicalGrowth(p(2024, 1000, 1200));
    if (!short.ok) expect(short.reason).toBe("short");
  });

  it("최근 구간만 본다 — 오래된 해는 창 밖으로 밀린다", () => {
    const long = p(2015, 100, 200, 400, 800, 1600, 3200, 3400, 3600, 3800, 4000, 4200);
    const r = historicalGrowth(long, 6);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.fromYear).toBe(2020);
      expect(r.value.toYear).toBe(2025);
    }
  });
});
