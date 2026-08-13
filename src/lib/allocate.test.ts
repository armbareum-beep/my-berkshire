import { describe, expect, it } from "vitest";
import {
  flattenTargets,
  planAllocation,
  overweightHurdle,
  HARD_CAP_MULTIPLE,
  OVERWEIGHT_PREMIUM,
  SOFT_CAP_MULTIPLE,
  type AllocateTarget,
} from "./allocate";

/** 목표비중만 준 대상(캡은 기본 배수로 파생). */
function t(
  key: string,
  value: number,
  target: number,
  extra: Partial<AllocateTarget> = {},
): AllocateTarget {
  return { key, label: key, value, target, ...extra };
}

const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0);

describe("planAllocation — 기본 배분", () => {
  it("부족한 칸에만 넣고, 배분 합이 투자금을 넘지 않는다", () => {
    // A는 목표(50%)에 한참 미달, B는 목표(50%)를 이미 채움.
    const plan = planAllocation([t("A", 200, 0.5), t("B", 800, 0.5)], 200);

    const a = plan.legs.find((l) => l.key === "A")!;
    const b = plan.legs.find((l) => l.key === "B")!;
    expect(a.amount).toBeGreaterThan(0);
    expect(b.amount).toBe(0); // 이미 목표 초과 → 부족분 없음
    expect(sum(plan.legs.map((l) => l.amount)) + plan.remainingCash).toBeCloseTo(200);
  });

  it("목표를 초과해서 사지 않는다 — 부족분이 상한", () => {
    // A 부족분은 (1000+900)*0.5 - 100 = 850. 투자금 900 이면 850 만 쓰고 50 은 남는다.
    const plan = planAllocation([t("A", 100, 0.5), t("B", 900, 0.5)], 900);
    const a = plan.legs.find((l) => l.key === "A")!;

    expect(a.amount).toBeCloseTo(850);
    expect(plan.remainingCash).toBeCloseTo(50);
    // 목표비중을 넘겨 사지 않았는지
    expect(a.weightAfter).toBeLessThanOrEqual(a.targetWeight + 1e-9);
  });

  it("후보가 없으면 전액을 현금으로 남긴다 (PRD §8)", () => {
    // 둘 다 목표를 채운 상태 → 살 것이 없다. 억지로 투자하지 않는다.
    const plan = planAllocation([t("A", 500, 0.5), t("B", 500, 0.5)], 0);
    expect(plan.remainingCash).toBe(0);

    const plan2 = planAllocation([t("A", 500, 0), t("B", 500, 0)], 300);
    expect(sum(plan2.legs.map((l) => l.amount))).toBeCloseTo(0);
    expect(plan2.remainingCash).toBeCloseTo(300);
  });

  it("첫 투자(보유 0)에서도 목표비중대로 나눈다", () => {
    const plan = planAllocation([t("A", 0, 0.7), t("B", 0, 0.3)], 1000);
    const a = plan.legs.find((l) => l.key === "A")!;
    const b = plan.legs.find((l) => l.key === "B")!;

    expect(a.amount).toBeCloseTo(700);
    expect(b.amount).toBeCloseTo(300);
    expect(plan.remainingCash).toBeCloseTo(0);
  });
});

describe("planAllocation — Concentration Guard", () => {
  it("Hard Cap 이상이면 한 푼도 넣지 않는다", () => {
    // 목표 10% → hard cap 15%. 현재 20% 이므로 차단.
    const plan = planAllocation([t("A", 200, 0.1), t("B", 800, 0.9)], 100);
    const a = plan.legs.find((l) => l.key === "A")!;

    expect(a.status).toBe("BLOCKED");
    expect(a.amount).toBe(0);
  });

  it("soft cap 과 hard cap 이 서로 다르게 동작한다 (v1.0 정정 지점)", () => {
    // v1.0 스펙은 둘 다 '제외'라 hard_cap 이 죽은 파라미터였다.
    // soft 구간은 감액(계수 0.05)이라 0 은 아니어야 한다.
    const soft = planAllocation(
      // 목표 20% → soft 25%, hard 30%. 현재 26% = soft 구간.
      [t("A", 260, 0.2), t("B", 740, 0.8)],
      1000,
    );
    const aSoft = soft.legs.find((l) => l.key === "A")!;
    expect(aSoft.status).toBe("WAIT");
    expect(aSoft.amount).toBeGreaterThan(0); // 배제가 아니라 감액

    const hard = planAllocation([t("A", 310, 0.2), t("B", 690, 0.8)], 1000);
    const aHard = hard.legs.find((l) => l.key === "A")!;
    expect(aHard.status).toBe("BLOCKED");
    expect(aHard.amount).toBe(0); // 이쪽은 완전 배제
  });

  it("목표 초과~soft 구간은 우선순위만 낮춘다", () => {
    // 목표 20% → soft 25%. 현재 22% = 목표 초과이지만 soft 미만.
    const plan = planAllocation([t("A", 220, 0.2), t("B", 780, 0.8)], 500);
    const a = plan.legs.find((l) => l.key === "A")!;
    expect(a.status).toBe("TRIM_PRIORITY");
  });

  it("상승으로 커진 승자를 팔라고 하지 않는다 — buy-only", () => {
    // A가 hard cap 을 한참 넘었어도 음수 배분(매도)은 나오지 않는다.
    const plan = planAllocation([t("A", 900, 0.1), t("B", 100, 0.9)], 100);
    for (const leg of plan.legs) expect(leg.amount).toBeGreaterThanOrEqual(0);
  });

  it("캡 기본 배수는 두 문서가 합의한 값이다", () => {
    expect(SOFT_CAP_MULTIPLE).toBe(1.25);
    expect(HARD_CAP_MULTIPLE).toBe(1.5);
  });

  it("명시적 캡이 기본 배수를 덮어쓴다", () => {
    // 목표 10%, 현재 12%. 기본이면 soft(12.5%) 미만이라 TRIM_PRIORITY 인데
    // softCap 을 11% 로 낮추면 WAIT 가 되어야 한다.
    // 투자금을 크게 줘서 부족분이 살아있게 한다(부족분 0이면 FILLED 가 우선한다).
    const base = planAllocation([t("A", 120, 0.1), t("B", 880, 0.9)], 1000);
    expect(base.legs[0].status).toBe("TRIM_PRIORITY");

    const tight = planAllocation(
      [t("A", 120, 0.1, { softCap: 0.11 }), t("B", 880, 0.9)],
      1000,
    );
    expect(tight.legs[0].status).toBe("WAIT");
  });

  it("살 것이 없으면 캡 구간이어도 FILLED 로 알린다", () => {
    // 목표 10%, 현재 12% → 목표 초과 구간이지만 투자금이 작아 부족분이 없다.
    const plan = planAllocation([t("A", 120, 0.1), t("B", 880, 0.9)], 100);
    expect(plan.legs[0].status).toBe("FILLED");
    expect(plan.legs[0].amount).toBe(0);
  });
});

describe("planAllocation — 밸류에이션 훅", () => {
  it("attractiveness 미지정이면 순수 비중 기반으로 동작한다", () => {
    const without = planAllocation([t("A", 100, 0.5), t("B", 100, 0.5)], 100);
    const neutral = planAllocation(
      [t("A", 100, 0.5, { attractiveness: 1 }), t("B", 100, 0.5, { attractiveness: 1 })],
      100,
    );
    expect(without.legs.map((l) => l.amount)).toEqual(neutral.legs.map((l) => l.amount));
  });

  it("매력도가 높은 쪽에 더 많이 배분한다 (PRD §6 정렬 신호)", () => {
    const plan = planAllocation(
      [
        t("A", 100, 0.5, { attractiveness: 2 }),
        t("B", 100, 0.5, { attractiveness: 1 }),
      ],
      100,
    );
    const a = plan.legs.find((l) => l.key === "A")!;
    const b = plan.legs.find((l) => l.key === "B")!;
    expect(a.amount).toBeGreaterThan(b.amount);
  });

  it("매력도 0 은 후보에서 제외한다 — 기대수익률 미달", () => {
    const plan = planAllocation(
      [
        t("A", 100, 0.5, { attractiveness: 0 }),
        t("B", 100, 0.5, { attractiveness: 1 }),
      ],
      100,
    );
    expect(plan.legs.find((l) => l.key === "A")!.amount).toBe(0);
    expect(plan.legs.find((l) => l.key === "B")!.amount).toBeGreaterThan(0);
  });
});

describe("planAllocation — 밸류에이션이 비중 상한을 움직인다 (PRD §6.2)", () => {
  it("초과 허들을 넘기면 목표비중을 넘겨 Soft Cap 까지 산다", () => {
    // A: 목표 20% → soft 25%. 현재 22% 라 기존 규칙이면 부족분 0(= 못 산다).
    // 기대 CAGR 20% > 허들 15% → 상한이 25% 로 열려 부족분이 생긴다.
    const rows: AllocateTarget[] = [
      t("A", 220, 0.2, { expectedCagr: 0.2, requiredReturn: 0.12 }),
      t("B", 780, 0.8),
    ];
    const plan = planAllocation(rows, 100);
    const a = plan.legs.find((l) => l.key === "A")!;

    expect(a.status).toBe("STRETCH");
    expect(a.ceilingWeight).toBeCloseTo(0.25);
    expect(a.amount).toBeGreaterThan(0);
    expect(a.weightAfter).toBeGreaterThan(a.targetWeight);
    expect(a.weightAfter).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it("허들에 못 미치면 상한은 목표비중 그대로다", () => {
    // 기대 CAGR 14% < 허들 15% → 목표 초과분은 못 산다(기존 동작).
    const plan = planAllocation(
      [t("A", 220, 0.2, { expectedCagr: 0.14, requiredReturn: 0.12 }), t("B", 780, 0.8)],
      100,
    );
    const a = plan.legs.find((l) => l.key === "A")!;

    expect(a.ceilingWeight).toBeCloseTo(0.2);
    expect(a.amount).toBe(0);
    expect(a.status).toBe("FILLED");
  });

  it("Hard Cap 은 밸류에이션으로도 뚫리지 않는다", () => {
    // 목표 10% → hard 15%. 현재 20%, 기대 CAGR 40% 라도 차단.
    const plan = planAllocation(
      [t("A", 200, 0.1, { expectedCagr: 0.4, requiredReturn: 0.12 }), t("B", 800, 0.9)],
      100,
    );
    const a = plan.legs.find((l) => l.key === "A")!;

    expect(a.status).toBe("BLOCKED");
    expect(a.amount).toBe(0);
  });

  it("가정이 없는 종목은 상한이 목표비중이라 기존 동작이 그대로다", () => {
    const before = planAllocation([t("A", 220, 0.2), t("B", 780, 0.8)], 500);
    const after = planAllocation(
      [t("A", 220, 0.2, { expectedCagr: null }), t("B", 780, 0.8)],
      500,
    );
    expect(after.legs.map((l) => l.amount)).toEqual(before.legs.map((l) => l.amount));
    expect(after.legs[0].ceilingWeight).toBeCloseTo(0.2);
  });

  it("Soft Cap 구간은 밸류에이션이 좋아도 Soft Cap 을 넘지 못한다", () => {
    // 목표 20% → soft 25%. 현재 26% = soft 초과 구간.
    // 상한이 열려도 그 상한이 soft(25%)라 결과 비중은 캡 아래로 수렴한다.
    const plan = planAllocation(
      [t("A", 260, 0.2, { expectedCagr: 0.4, requiredReturn: 0.12 }), t("B", 740, 0.8)],
      100,
    );
    const a = plan.legs.find((l) => l.key === "A")!;
    const b = plan.legs.find((l) => l.key === "B")!;

    expect(a.status).toBe("WAIT"); // STRETCH 로 승격되지 않는다
    expect(a.weightAfter).toBeLessThanOrEqual(0.25 + 1e-9);
    expect(a.amount).toBeLessThan(b.amount); // 감액 — 우선순위가 크게 깎인다
  });

  it("초과 허들은 요구수익률 + 3%p, 직접 지정하면 그게 우선한다", () => {
    expect(OVERWEIGHT_PREMIUM).toBe(0.03);
    expect(overweightHurdle({ requiredReturn: 0.12 })).toBeCloseTo(0.15);
    expect(overweightHurdle({})).toBeCloseTo(0.15);
    expect(
      overweightHurdle({ requiredReturn: 0.12, overweightRequiredReturn: 0.25 }),
    ).toBeCloseTo(0.25);
  });
});

describe("flattenTargets — 2층 → 평면 환산 (스펙 §13.2)", () => {
  it("유형 목표 × 유형 내 목표를 곱해 평면화한다", () => {
    const flat = flattenTargets(
      [
        { symbol: "META", assetType: "주식" },
        { symbol: "PLTR", assetType: "주식" },
        { symbol: "VOO", assetType: "ETF" },
      ],
      { "assetType:주식": 0.6, "assetType:ETF": 0.4 },
      { META: 0.7, PLTR: 0.3, VOO: 1 },
    );

    expect(flat.META).toBeCloseTo(0.42);
    expect(flat.PLTR).toBeCloseTo(0.18);
    expect(flat.VOO).toBeCloseTo(0.4);
    expect(sum(Object.values(flat))).toBeCloseTo(1);
  });

  it("합이 1이 아니면 정규화한다", () => {
    // 유형 목표를 절반만 채워둔 기존 사용자.
    const flat = flattenTargets(
      [
        { symbol: "META", assetType: "주식" },
        { symbol: "VOO", assetType: "ETF" },
      ],
      { "assetType:주식": 0.3, "assetType:ETF": 0.2 },
      { META: 1, VOO: 1 },
    );
    expect(sum(Object.values(flat))).toBeCloseTo(1);
    expect(flat.META).toBeCloseTo(0.6);
    expect(flat.VOO).toBeCloseTo(0.4);
  });

  it("목표가 하나도 없으면 0으로 두고 나눗셈하지 않는다", () => {
    const flat = flattenTargets([{ symbol: "META", assetType: "주식" }], {}, {});
    expect(flat.META).toBe(0);
    expect(Number.isNaN(flat.META)).toBe(false);
  });
});
