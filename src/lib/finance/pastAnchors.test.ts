import { describe, expect, it } from "vitest";
import { epsGrowthAnchor, multipleBand } from "./pastAnchors";

describe("epsGrowthAnchor — 과거 이익 성장률", () => {
  it("처음과 마지막 해로 CAGR 을 낸다", () => {
    // 2020: 1000 → 2024: 2000, 4년 → 2^(1/4) − 1 ≈ 18.92%
    const a = epsGrowthAnchor([
      { year: 2020, eps: 1000 },
      { year: 2022, eps: 1400 },
      { year: 2024, eps: 2000 },
    ])!;
    expect(a.cagr).toBeCloseTo(0.1892, 3);
    expect(a.fromYear).toBe(2020);
    expect(a.toYear).toBe(2024);
    expect(a.years).toBe(4);
  });

  it("순서가 뒤섞여 있어도 연도로 정렬한다", () => {
    const a = epsGrowthAnchor([
      { year: 2024, eps: 2000 },
      { year: 2020, eps: 1000 },
    ])!;
    expect(a.fromYear).toBe(2020);
    expect(a.cagr).toBeCloseTo(Math.pow(2, 1 / 4) - 1, 6);
  });

  it("이익이 줄었으면 음수 성장률", () => {
    const a = epsGrowthAnchor([
      { year: 2022, eps: 1000 },
      { year: 2024, eps: 810 },
    ])!;
    expect(a.cagr).toBeCloseTo(-0.1, 6);
  });

  it("적자 해가 끼면 그 해를 빼고 계산한다", () => {
    const a = epsGrowthAnchor([
      { year: 2020, eps: 1000 },
      { year: 2022, eps: -500 },
      { year: 2024, eps: 2000 },
    ])!;
    expect(a.fromYear).toBe(2020);
    expect(a.toYear).toBe(2024);
  });

  it("흑자 해가 하나뿐이면 null — 한 점으로는 성장률이 없다", () => {
    expect(
      epsGrowthAnchor([
        { year: 2023, eps: -100 },
        { year: 2024, eps: 500 },
      ]),
    ).toBeNull();
  });

  it("빈 배열·null 값·같은 해만 있으면 null", () => {
    expect(epsGrowthAnchor([])).toBeNull();
    expect(epsGrowthAnchor([{ year: 2024, eps: null }])).toBeNull();
    expect(
      epsGrowthAnchor([
        { year: 2024, eps: 100 },
        { year: 2024, eps: 200 },
      ]),
    ).toBeNull();
  });
});

describe("multipleBand — 배수 밴드", () => {
  it("평균·최저·최고·표본수를 낸다", () => {
    const b = multipleBand([10, 20, 30])!;
    expect(b.avg).toBeCloseTo(20);
    expect(b.min).toBe(10);
    expect(b.max).toBe(30);
    expect(b.count).toBe(3);
  });

  it("표본이 하나면 null — 한 해짜리 '평균'은 밴드가 아니다", () => {
    expect(multipleBand([15])).toBeNull();
    expect(multipleBand([])).toBeNull();
  });

  it("0·음수·NaN 은 버린다", () => {
    const b = multipleBand([10, 0, -5, Number.NaN, 20])!;
    expect(b.count).toBe(2);
    expect(b.avg).toBeCloseTo(15);
  });

  it("Map.values() 를 그대로 받는다", () => {
    const m = new Map([
      [2023, 12],
      [2024, 18],
    ]);
    expect(multipleBand(m.values())!.avg).toBeCloseTo(15);
  });
});
