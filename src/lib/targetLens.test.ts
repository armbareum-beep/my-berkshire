import { describe, expect, it } from "vitest";
import {
  buildLens,
  cashCurrency,
  cashKey,
  isCashKey,
  normalizeTargets,
  roomFor,
  scaleGroupLocked,
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

/** 미국 주식 2 + 한국 주식 1. 증권 합계 900. */
function base(over: Partial<LensInput> = {}): LensInput {
  return {
    holdings: [
      { symbol: "META", name: "Meta", value: 400 },
      { symbol: "NVDA", name: "Nvidia", value: 200 },
      { symbol: "005930", name: "삼성전자", value: 300 },
    ],
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

    expect(us.current).toBeCloseTo(600 / 900); // 분모는 증권만
    expect(us.target).toBeCloseTo(0.6);
    expect(kr.current).toBeCloseTo(300 / 900);
    expect(us.members).toHaveLength(2);
  });

  it("목표 − 현재를 갭으로 준다", () => {
    const groups = buildLens(
      base({ targets: t({ META: 0.5, NVDA: 0.2, "005930": 0.2 }) }),
      "country",
    );
    // 미국 목표 70% − 현재 (600/900)
    expect(groups.find((g) => g.label === "미국")!.gap).toBeCloseTo(0.7 - 600 / 900);
    // 한국 목표 20% − 현재 (300/900)
    expect(groups.find((g) => g.label === "한국")!.gap).toBeCloseTo(0.2 - 300 / 900);
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

  it("현금은 묶음으로 세우지 않는다 — 목표는 증권끼리의 100%다", () => {
    const groups = buildLens(
      base({ targets: t({ META: 0.4, NVDA: 0.2, "005930": 0.1 }) }),
      "country",
    );
    expect(groups.find((g) => g.label === "현금")).toBeUndefined();
    // 분모도 증권만 — 미국 600 / 증권 900
    expect(groups.find((g) => g.label === "미국")!.current).toBeCloseTo(600 / 900);
  });

  it("통화 현금 키는 종목 묶음에 끼지 않는다", () => {
    const groups = buildLens(
      base({ targets: t({ META: 0.4, "CASH:USD": 0.3 }) }),
      "country",
    );
    expect(groups.flatMap((g) => g.members).map((m) => m.symbol)).not.toContain(
      "CASH:USD",
    );
  });

  it("미분류·기타는 맨 아래에 둔다", () => {
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
    expect(groups.at(-1)!.label).toBe("기타");
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
    expect(semi.current).toBeCloseTo(500 / 900); // 분모는 증권만
    expect(semi.target).toBeCloseTo(0.5);
  });

  it("자산이 하나도 없어도 NaN 을 만들지 않는다", () => {
    const groups = buildLens(
      { holdings: [], meta: {}, targets: {} },
      "country",
    );
    expect(groups.every((g) => Number.isFinite(g.current))).toBe(true);
  });
});

describe("withinBasis — 묶음 안에서 보기", () => {
  it("그룹을 100% 로 다시 정규화한다", () => {
    const us = buildLens(base(), "country").find((g) => g.label === "미국")!;
    const within = withinBasis(us);

    // 저장값 META 40% · NVDA 20% → 미국 안에서 2:1
    expect(within.find((m) => m.symbol === "META")!.current).toBeCloseTo(2 / 3);
    expect(within.find((m) => m.symbol === "NVDA")!.current).toBeCloseTo(1 / 3);
    expect(within.reduce((s, m) => s + m.current, 0)).toBeCloseTo(1);
  });

  it("원본 비중은 건드리지 않는다", () => {
    const us = buildLens(base(), "country").find((g) => g.label === "미국")!;
    withinBasis(us);
    expect(us.members.find((m) => m.symbol === "META")!.current).toBeCloseTo(
      400 / 900,
    );
  });

  it("그룹 합이 0이면 0을 준다 — NaN 금지", () => {
    const empty = buildLens(
      base({ holdings: [], targets: {} }),
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

describe("통화 현금 목표 키", () => {
  it("예약 키로 왕복한다", () => {
    expect(cashKey("usd")).toBe("CASH:USD");
    expect(isCashKey("CASH:USD")).toBe(true);
    expect(cashCurrency("CASH:JPY")).toBe("JPY");
  });

  it("종목 심볼과 섞이지 않는다", () => {
    expect(isCashKey("META")).toBe(false);
    expect(isCashKey("005930")).toBe(false);
    expect(cashCurrency("META")).toBeNull();
  });

  it("통화 목표도 같은 평면 맵에서 비례 스케일된다", () => {
    // "현금 20%" 를 맞추면 달러·원화가 비율 그대로 움직인다.
    const next = scaleGroupTarget(
      t({ "CASH:KRW": 0.06, "CASH:USD": 0.04, META: 0.5 }),
      [
        { symbol: "CASH:KRW", value: 600 },
        { symbol: "CASH:USD", value: 400 },
      ],
      0.2,
    );
    expect(next["CASH:KRW"].target).toBeCloseTo(0.12);
    expect(next["CASH:USD"].target).toBeCloseTo(0.08);
    expect(next.META.target).toBeCloseTo(0.5);
  });
});

describe("roomFor — 여기에 더 넣을 수 있는 최대", () => {
  it("자기 자신은 빼고 센다 — 같은 값으로 다시 저장하는 걸 막지 않는다", () => {
    const map = t({ META: 0.2, NVDA: 0.3, "005930": 0.1 });
    expect(roomFor(map, ["NVDA"])).toBeCloseTo(0.7);
    // 지금 값(30%)이 여유(70%) 안에 있으므로 재저장이 막히지 않는다.
    expect(map.NVDA.target).toBeLessThanOrEqual(roomFor(map, ["NVDA"]));
  });

  it("아직 목표가 없는 종목이면 남은 전부가 여유다", () => {
    expect(roomFor(t({ META: 0.4 }), ["NVDA"])).toBeCloseTo(0.6);
  });

  it("묶음은 구성원 전부를 빼고 센다 — 통째로 갈아끼우기 때문", () => {
    const map = t({ META: 0.2, NVDA: 0.3, "005930": 0.1 });
    expect(roomFor(map, ["META", "NVDA"])).toBeCloseTo(0.9);
  });

  it("이미 꽉 찼으면 0 — 음수로 내려가지 않는다", () => {
    expect(roomFor(t({ META: 0.7, NVDA: 0.3 }), ["삼성"])).toBe(0);
    expect(roomFor(t({ META: 1.2 }), ["NVDA"])).toBe(0);
  });

  it("빈 맵이면 100% 전부가 여유다", () => {
    expect(roomFor({}, ["META"])).toBeCloseTo(1);
  });
});

describe("scaleGroupLocked — 다른 축은 그대로 둔다", () => {
  // 미국 = META(주식 30%) + SPY(ETF 20%) · 한국 = 삼성(주식 15%) + KODEX(ETF 10%)
  // 주식 합 45% · ETF 합 30% · 현금 25%
  const us = [
    { symbol: "META", value: 300, stratum: "주식" },
    { symbol: "SPY", value: 200, stratum: "ETF" },
  ];
  const kr = [
    { symbol: "005930", value: 150, stratum: "주식" },
    { symbol: "KODEX", value: 100, stratum: "ETF" },
  ];
  const start = t({ META: 0.3, SPY: 0.2, "005930": 0.15, KODEX: 0.1 });

  it("올린 만큼을 같은 유형의 다른 나라에서 가져온다", () => {
    const { targets: next, shortfall } = scaleGroupLocked(start, us, kr, 0.6);

    // 미국은 요청대로 60%
    expect(next.META.target + next.SPY.target).toBeCloseTo(0.6);
    // 유형 합은 그대로 — 이게 "고정"이다
    expect(next.META.target + next["005930"].target).toBeCloseTo(0.45);
    expect(next.SPY.target + next.KODEX.target).toBeCloseTo(0.3);
    // 현금(= 1 − 합)도 그대로
    expect(sumTargets(next)).toBeCloseTo(0.75);
    expect(shortfall).toBeCloseTo(0);
  });

  it("묶음 안의 유형 구성 비율을 유지한다", () => {
    const { targets: next } = scaleGroupLocked(start, us, kr, 0.6);
    // 미국 안에서 주식:ETF = 30:20 = 3:2 였다 → 36:24
    expect(next.META.target).toBeCloseTo(0.36);
    expect(next.SPY.target).toBeCloseTo(0.24);
  });

  it("줄이면 반대로 돌려준다", () => {
    const { targets: next, shortfall } = scaleGroupLocked(start, us, kr, 0.4);
    expect(next.META.target + next.SPY.target).toBeCloseTo(0.4);
    expect(next.META.target + next["005930"].target).toBeCloseTo(0.45);
    expect(sumTargets(next)).toBeCloseTo(0.75);
    expect(shortfall).toBeCloseTo(0);
  });

  it("상계할 곳이 없으면 요청대로 옮기되 깨진 양을 돌려준다", () => {
    // 한국에 ETF 가 없다 → ETF 칸에서 가져올 데가 없다.
    const krStocksOnly = [{ symbol: "005930", value: 150, stratum: "주식" }];
    const { targets: next, shortfall } = scaleGroupLocked(
      t({ META: 0.3, SPY: 0.2, "005930": 0.15 }),
      us,
      krStocksOnly,
      0.6,
    );
    // 요청은 지킨다 — 조용히 덜 옮기지 않는다
    expect(next.META.target + next.SPY.target).toBeCloseTo(0.6);
    // 주식 칸은 상계됐고(META +6, 삼성 −6), ETF 칸 4%p 가 현금에서 왔다
    expect(next["005930"].target).toBeCloseTo(0.09);
    expect(shortfall).toBeCloseTo(0.04);
    expect(sumTargets(next)).toBeCloseTo(0.69);
  });

  it("가져올 목표가 모자라면 있는 만큼만 상계한다", () => {
    // 한국 주식이 2% 뿐인데 6%p 를 가져와야 한다.
    const { targets: next, shortfall } = scaleGroupLocked(
      t({ META: 0.3, SPY: 0.2, "005930": 0.02, KODEX: 0.1 }),
      us,
      kr,
      0.6,
    );
    expect(next["005930"]).toBeUndefined(); // 0 이 되면 키를 지운다
    expect(shortfall).toBeCloseTo(0.04); // 6 − 2 = 4%p 는 현금에서
    expect(next.META.target + next.SPY.target).toBeCloseTo(0.6);
  });

  it("0 으로 내리면 구성 종목을 지우고 같은 유형에 돌려준다", () => {
    const { targets: next } = scaleGroupLocked(start, us, kr, 0);
    expect(next.META).toBeUndefined();
    expect(next.SPY).toBeUndefined();
    expect(next["005930"].target).toBeCloseTo(0.45);
    expect(next.KODEX.target).toBeCloseTo(0.3);
  });

  it("아무 변화가 없으면 원본 그대로", () => {
    expect(scaleGroupLocked(start, us, kr, 0.5).targets).toEqual(start);
    expect(scaleGroupLocked(start, [], kr, 0.5).targets).toEqual(start);
    expect(scaleGroupLocked(start, us, kr, Number.NaN).targets).toEqual(start);
  });

  it("목표가 없던 묶음은 평가액 비율로 스트라텀을 나눈다", () => {
    const { targets: next } = scaleGroupLocked(
      t({ "005930": 0.3, KODEX: 0.2 }),
      us,
      kr,
      0.25,
    );
    // 미국 평가액 300:200 = 3:2 → 15% : 10%
    expect(next.META.target).toBeCloseTo(0.15);
    expect(next.SPY.target).toBeCloseTo(0.1);
    // 유형 합 보존: 주식 30% · ETF 20%
    expect(next.META.target + next["005930"].target).toBeCloseTo(0.3);
    expect(next.SPY.target + next.KODEX.target).toBeCloseTo(0.2);
  });
});

describe("normalizeTargets — 합을 100%로", () => {
  it("종목 전체를 비례로 늘려 합을 1로 만든다", () => {
    const next = normalizeTargets(t({ META: 0.4, NVDA: 0.2, KO: 0.1 }));
    expect(sumTargets(next)).toBeCloseTo(1);
    // 4:2:1 비율 보존 — 세 축의 상대 모양이 전부 그대로다
    expect(next.META.target / next.NVDA.target).toBeCloseTo(2);
    expect(next.NVDA.target / next.KO.target).toBeCloseTo(2);
  });

  it("넘친 합도 1로 내린다", () => {
    const next = normalizeTargets(t({ META: 0.8, NVDA: 0.6 }));
    expect(sumTargets(next)).toBeCloseTo(1);
  });

  it("통화 현금 목표는 건드리지 않는다 — 분모가 다르다", () => {
    const next = normalizeTargets(t({ META: 0.5, "CASH:USD": 0.3 }));
    expect(next["CASH:USD"].target).toBeCloseTo(0.3);
    expect(next.META.target).toBeCloseTo(1);
    expect(sumTargets(next)).toBeCloseTo(1);
  });

  it("종목이 없으면 그대로 둔다", () => {
    const only = t({ "CASH:USD": 0.3 });
    expect(normalizeTargets(only)).toEqual(only);
  });
});

describe("sumTargets — 증권만 센다", () => {
  it("통화 현금 키는 빼고 더한다", () => {
    expect(sumTargets(t({ META: 0.4, "CASH:USD": 0.3 }))).toBeCloseTo(0.4);
  });

  it("roomFor 도 증권 기준이다", () => {
    // 통화에 30% 를 배정해 뒀어도 증권 여유는 60% 다.
    expect(roomFor(t({ META: 0.4, "CASH:USD": 0.3 }), ["NVDA"])).toBeCloseTo(0.6);
  });
});
