import { describe, expect, it } from "vitest";
import {
  buildLens,
  scaleGroupTarget,
  sumTargets,
  withinBasis,
  type LensInput,
} from "./targetLens";
import type { SecurityRecord } from "./securities";
import type { FlatTargets } from "./targetWeights";

function sec(
  symbol: string,
  over: Partial<SecurityRecord> = {},
): SecurityRecord {
  return {
    symbol,
    name: symbol,
    country: "미국",
    assetType: "주식",
    sector: "반도체",
    currency: "USD",
    ...over,
  } as SecurityRecord;
}

const t = (map: Record<string, number>): FlatTargets =>
  Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { target: v }]));

/** 미국 주식 2 + 한국 주식 1 + 현금. 전체 1000. */
function base(over: Partial<LensInput> = {}): LensInput {
  return {
    holdings: [
      { symbol: "META", name: "Meta", value: 400 },
      { symbol: "NVDA", name: "Nvidia", value: 200 },
      { symbol: "005930", name: "삼성전자", value: 300 },
    ],
    cash: 100,
    meta: {
      META: sec("META"),
      NVDA: sec("NVDA"),
      "005930": sec("005930", { country: "한국", currency: "KRW" }),
    },
    targets: t({ META: 0.4, NVDA: 0.2, "005930": 0.3 }),
    ...over,
  };
}

describe("buildLens — 묶어서 보기", () => {
  it("국가 렌즈로 현재·목표를 합산한다", () => {
    const groups = buildLens(base(), "country");
    const us = groups.find((g) => g.label === "미국")!;
    const kr = groups.find((g) => g.label === "한국")!;

    expect(us.current).toBeCloseTo(0.6); // (400+200)/1000
    expect(us.target).toBeCloseTo(0.6);
    expect(kr.current).toBeCloseTo(0.3);
    expect(us.members).toHaveLength(2);
  });

  it("목표 − 현재를 갭으로 준다", () => {
    const groups = buildLens(
      base({ targets: t({ META: 0.5, NVDA: 0.2, "005930": 0.2 }) }),
      "country",
    );
    // 미국 목표 70% − 현재 60% = +10%p
    expect(groups.find((g) => g.label === "미국")!.gap).toBeCloseTo(0.1);
    // 한국 목표 20% − 현재 30% = −10%p
    expect(groups.find((g) => g.label === "한국")!.gap).toBeCloseTo(-0.1);
  });

  it("보유하지 않은 목표 종목도 묶음에 넣는다", () => {
    const groups = buildLens(
      base({
        targets: t({ META: 0.4, NVDA: 0.2, "005930": 0.2, TSM: 0.1 }),
        meta: { ...base().meta, TSM: sec("TSM", { country: "대만" }) },
      }),
      "country",
    );
    const tw = groups.find((g) => g.label === "대만")!;
    expect(tw.target).toBeCloseTo(0.1);
    expect(tw.current).toBe(0);
    expect(tw.members[0].held).toBe(false);
  });

  it("현금 목표는 목표 합의 나머지다", () => {
    // 목표 합 70% → 현금 목표 30%
    const groups = buildLens(
      base({ targets: t({ META: 0.4, NVDA: 0.2, "005930": 0.1 }) }),
      "country",
    );
    const cash = groups.find((g) => g.label === "현금")!;
    expect(cash.target).toBeCloseTo(0.3);
    expect(cash.current).toBeCloseTo(0.1); // 실제 현금 100/1000
  });

  it("현금은 맨 아래, 미분류·기타는 그 위에 둔다", () => {
    const groups = buildLens(
      base({
        holdings: [
          ...base().holdings,
          { symbol: "GLD", name: "금", value: 100 },
        ],
        meta: { ...base().meta, GLD: sec("GLD", { country: "기타" }) },
      }),
      "country",
    );
    expect(groups.at(-1)!.label).toBe("현금");
    expect(groups.at(-2)!.label).toBe("기타");
  });

  it("산업 렌즈도 같은 진실을 다르게 묶는다", () => {
    const groups = buildLens(
      base({
        meta: {
          META: sec("META", { sector: "소프트웨어" }),
          NVDA: sec("NVDA", { sector: "반도체" }),
          "005930": sec("005930", { country: "한국", sector: "반도체" }),
        },
      }),
      "sector",
    );
    const semi = groups.find((g) => g.label === "반도체")!;
    expect(semi.current).toBeCloseTo(0.5); // (200+300)/1000
    expect(semi.target).toBeCloseTo(0.5);
  });

  it("자산이 하나도 없어도 NaN 을 만들지 않는다", () => {
    const groups = buildLens(
      { holdings: [], cash: 0, meta: {}, targets: {} },
      "country",
    );
    expect(groups.every((g) => Number.isFinite(g.current))).toBe(true);
  });
});

describe("withinBasis — 묶음 안에서 보기", () => {
  it("그룹을 100% 로 다시 정규화한다", () => {
    const us = buildLens(base(), "country").find((g) => g.label === "미국")!;
    const within = withinBasis(us);

    // 전체 대비 META 40% · NVDA 20% → 미국 안에서 2:1
    expect(within.find((m) => m.symbol === "META")!.current).toBeCloseTo(2 / 3);
    expect(within.find((m) => m.symbol === "NVDA")!.current).toBeCloseTo(1 / 3);
    expect(within.reduce((s, m) => s + m.current, 0)).toBeCloseTo(1);
  });

  it("저장값(전체 대비)은 건드리지 않는다", () => {
    const us = buildLens(base(), "country").find((g) => g.label === "미국")!;
    withinBasis(us);
    expect(us.members.find((m) => m.symbol === "META")!.current).toBeCloseTo(0.4);
  });

  it("그룹 합이 0이면 0을 준다 — NaN 금지", () => {
    const empty = buildLens(
      base({ holdings: [], cash: 0, targets: {} }),
      "country",
    );
    for (const g of empty) {
      expect(withinBasis(g).every((m) => Number.isFinite(m.current))).toBe(true);
    }
  });
});

describe("scaleGroupTarget — 묶음을 움직여 진실을 다시 쓴다", () => {
  const us = [
    { symbol: "META", value: 400 },
    { symbol: "NVDA", value: 200 },
  ];

  it("구성 종목을 비례로 늘려 합을 맞춘다", () => {
    const next = scaleGroupTarget(t({ META: 0.2, NVDA: 0.1, KO: 0.3 }), us, 0.6);

    expect(next.META.target).toBeCloseTo(0.4);
    expect(next.NVDA.target).toBeCloseTo(0.2);
    // 묶음 밖은 손대지 않는다.
    expect(next.KO.target).toBeCloseTo(0.3);
  });

  it("종목 사이의 상대 비율을 보존한다", () => {
    const before = t({ META: 0.2, NVDA: 0.1 });
    const after = scaleGroupTarget(before, us, 0.9);
    expect(after.META.target / after.NVDA.target).toBeCloseTo(
      before.META.target / before.NVDA.target,
    );
  });

  it("줄이는 방향도 같다", () => {
    const next = scaleGroupTarget(t({ META: 0.4, NVDA: 0.2 }), us, 0.15);
    expect(next.META.target + next.NVDA.target).toBeCloseTo(0.15);
  });

  it("0 이면 구성 종목 목표를 지운다", () => {
    const next = scaleGroupTarget(t({ META: 0.4, NVDA: 0.2, KO: 0.1 }), us, 0);
    expect(next.META).toBeUndefined();
    expect(next.NVDA).toBeUndefined();
    expect(next.KO.target).toBeCloseTo(0.1);
  });

  it("목표가 하나도 없던 묶음은 현재 평가액 비율로 나눈다", () => {
    const next = scaleGroupTarget({}, us, 0.6);
    // 400:200 = 2:1 → 40% : 20%
    expect(next.META.target).toBeCloseTo(0.4);
    expect(next.NVDA.target).toBeCloseTo(0.2);
  });

  it("평가액도 전부 0이면 균등 분배한다", () => {
    const unheld = [
      { symbol: "A", value: 0 },
      { symbol: "B", value: 0 },
    ];
    const next = scaleGroupTarget({}, unheld, 0.5);
    expect(next.A.target).toBeCloseTo(0.25);
    expect(next.B.target).toBeCloseTo(0.25);
  });

  it("목표가 없던 종목을 비례 스케일에 끌어들이지 않는다", () => {
    // META 만 목표가 있다 — NVDA 는 사용자가 일부러 안 정한 것이다.
    const next = scaleGroupTarget(t({ META: 0.2 }), us, 0.4);
    expect(next.META.target).toBeCloseTo(0.4);
    expect(next.NVDA).toBeUndefined();
  });

  it("1을 넘겨 요청해도 100% 를 넘지 않는다", () => {
    const next = scaleGroupTarget(t({ META: 0.2, NVDA: 0.1 }), us, 5);
    expect(sumTargets(next)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("빈 묶음이나 잘못된 값은 원본을 그대로 둔다", () => {
    const before = t({ META: 0.2 });
    expect(scaleGroupTarget(before, [], 0.5)).toEqual(before);
    expect(scaleGroupTarget(before, us, Number.NaN)).toEqual(before);
    expect(scaleGroupTarget(before, us, -1)).toEqual(before);
  });
});
