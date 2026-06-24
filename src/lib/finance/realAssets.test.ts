import { describe, it, expect } from "vitest";
import {
  effectiveCost,
  unrealizedGain,
  saleGain,
  rentNet,
  computeRealEstateDivision,
  computeDivisions,
  realEstateFinancingCost,
  financingByAsset,
  type ManualAsset,
  type ManualAssetIncome,
} from "./realAssets";
import type { DivisionFinancingCost } from "./financing";
import type { Liability } from "./liabilities";

/** 테스트용 금융비용 — 함수는 totalInterest·capitalAdded 만 읽는다. */
const fin = (over: Partial<DivisionFinancingCost> = {}): DivisionFinancingCost => ({
  confirmedInterest: 0,
  estimatedInterest: 0,
  totalInterest: 0,
  capitalAdded: 0,
  weightedAvgRate: null,
  monthlyEstimate: 0,
  ...over,
});

const asset = (over: Partial<ManualAsset> = {}): ManualAsset => ({
  id: "a1",
  name: "아파트",
  kind: "REAL_ESTATE",
  currentValue: 1_800_000_000,
  acquiredPrice: 1_250_000_000,
  acquiredAt: "2020-01-01",
  note: null,
  acquisitionCost: null,
  valuationSource: null,
  valuedAt: null,
  salePrice: null,
  saleAt: null,
  saleCost: null,
  ...over,
});

const income = (over: Partial<ManualAssetIncome> = {}): ManualAssetIncome => ({
  id: "i1",
  assetId: "a1",
  date: "2025-01-01",
  amount: 5_000_000,
  cost: 0,
  ...over,
});

describe("부동산 사업부 — 자산 단위", () => {
  it("평가차익(미실현): 12.5억→18억 = +5.5억", () => {
    expect(unrealizedGain(asset())).toBe(550_000_000);
  });

  it("취득 부대비용은 실질취득가에 가산 → 미실현 줄어듦", () => {
    const a = asset({ acquisitionCost: 50_000_000 }); // 실질취득 13억
    expect(effectiveCost(a)).toBe(1_300_000_000);
    expect(unrealizedGain(a)).toBe(500_000_000); // 18 − 13
  });

  it("매도차익(net) = 매도가 − 실질취득가 − 매도비용, 매도 시 미실현 0", () => {
    const a = asset({
      acquisitionCost: 50_000_000,
      salePrice: 1_800_000_000,
      saleAt: "2026-01-01",
      saleCost: 50_000_000,
    });
    expect(saleGain(a)).toBe(450_000_000); // 18 − 13 − 0.5
    expect(unrealizedGain(a)).toBe(0); // 매도되어 미실현 제외
  });

  it("임대수익 net = Σ(amount − cost)", () => {
    const incomes = [
      income({ id: "i1", amount: 5_000_000, cost: 500_000 }),
      income({ id: "i2", amount: 5_000_000, cost: 500_000 }),
    ];
    expect(rentNet("a1", incomes)).toBe(9_000_000);
  });

  it("취득가 없으면 effectiveCost null(수익률 스코프 밖)", () => {
    expect(effectiveCost(asset({ acquiredPrice: null }))).toBeNull();
  });
});

describe("부동산 사업부 — 합산", () => {
  it("보유 미실현만", () => {
    const d = computeRealEstateDivision([asset()], []);
    expect(d.cost).toBe(1_250_000_000);
    expect(d.unrealized).toBe(550_000_000);
    expect(d.realized).toBe(0);
    expect(d.ret).toBeCloseTo(0.44, 4);
  });

  it("임대 + 매도차익 = 실현, 종합은 분모 실질취득가", () => {
    const a = asset({
      acquisitionCost: 50_000_000, // 실질취득 13억
      salePrice: 1_800_000_000,
      saleAt: "2026-01-01",
      saleCost: 0,
    });
    const incomes = [income({ amount: 60_000_000, cost: 0 })];
    const d = computeRealEstateDivision([a], incomes);
    expect(d.cost).toBe(1_300_000_000);
    expect(d.unrealized).toBe(0); // 매도됨
    expect(d.realized).toBe(500_000_000 + 60_000_000); // 매도차익 5억 + 임대 6천
    expect(d.ret).toBeCloseTo(560_000_000 / 1_300_000_000, 6);
  });

  it("취득가 없는 자산은 합산에서 제외", () => {
    const d = computeRealEstateDivision(
      [asset(), asset({ id: "a2", acquiredPrice: null })],
      [],
    );
    expect(d.cost).toBe(1_250_000_000); // a2 제외
  });

  it("자본 없으면 빈 결과(ret null)", () => {
    const d = computeRealEstateDivision([], []);
    expect(d.cost).toBe(0);
    expect(d.ret).toBeNull();
  });
});

describe("부동산 사업부 — 금융비용(이자/자본) 반영 (spec 012)", () => {
  it("financing 미주입 = 0 주입 → 동일(회귀 안전)", () => {
    const a = [asset()];
    const without = computeRealEstateDivision(a, []);
    const withZero = computeRealEstateDivision(a, [], fin());
    expect(withZero.cost).toBe(without.cost);
    expect(withZero.realized).toBe(without.realized);
    expect(withZero.gain).toBe(without.gain);
    expect(withZero.ret).toBe(without.ret);
  });

  it("이자 차감 → 실현에서 빠지고 수익률 하락", () => {
    // 12.5억 취득, 18억 평가 → 미실현 5.5억. 이자 1천만 차감.
    const d = computeRealEstateDivision([asset()], [], fin({ totalInterest: 10_000_000 }));
    expect(d.realized).toBe(-10_000_000);
    expect(d.unrealized).toBe(550_000_000);
    expect(d.gain).toBe(540_000_000);
    expect(d.ret).toBeCloseTo(540_000_000 / 1_250_000_000, 6);
  });

  it("자본 투입 → 원가(분모)만 증가, 실현 불변", () => {
    const d = computeRealEstateDivision([asset()], [], fin({ capitalAdded: 50_000_000 }));
    expect(d.cost).toBe(1_300_000_000); // 12.5억 + 0.5억
    expect(d.realized).toBe(0);
    expect(d.gain).toBe(550_000_000);
    expect(d.ret).toBeCloseTo(550_000_000 / 1_300_000_000, 6);
  });

  it("공실(임대 0 + 이자만) → 실현 음수", () => {
    const d = computeRealEstateDivision([asset()], [], fin({ totalInterest: 5_000_000 }));
    expect(d.realized).toBe(-5_000_000);
  });

  it("computeDivisions: financing 은 REAL_ESTATE 사업부에만 적용", () => {
    const divs = computeDivisions(
      [
        asset({ id: "re", kind: "REAL_ESTATE" }),
        asset({ id: "biz", kind: "UNLISTED", acquiredPrice: 5_000_000, currentValue: 5_000_000 }),
      ],
      [],
      fin({ totalInterest: 1_000_000 }),
    );
    const re = divs.find((d) => d.key === "REAL_ESTATE")!;
    const biz = divs.find((d) => d.key === "BUSINESS")!;
    expect(re.totals.realized).toBe(-1_000_000); // 이자 차감
    expect(biz.totals.realized).toBe(0); // 비상장엔 영향 없음
  });
});

describe("realEstateFinancingCost — 조립 헬퍼", () => {
  const mortgage = (over: Partial<Liability> = {}): Liability => ({
    id: "m1",
    name: "담보대출",
    kind: "MORTGAGE",
    principal: 100_000_000,
    interestRate: 0.03,
    startedAt: null,
    manualAssetId: null,
    ...over,
  });

  it("담보대출만 짝짓고, 폴백 기점 = 부동산 가장 이른 취득일", () => {
    const f = realEstateFinancingCost({
      liabilities: [mortgage({ startedAt: null }), mortgage({ id: "g", kind: "MARGIN" })],
      reconciliations: [],
      assets: [asset({ acquiredAt: "2025-01-01" })],
      today: "2025-02-01",
    });
    // 담보 1건만(1억@3%) 1개월 → 25만. 마진은 부동산 짝짓기에서 제외.
    expect(f.estimatedInterest).toBeCloseTo(250_000, 2);
  });

  it("담보대출 없으면 전부 0", () => {
    const f = realEstateFinancingCost({
      liabilities: [mortgage({ kind: "CREDIT" })],
      reconciliations: [],
      assets: [asset()],
      today: "2025-02-01",
    });
    expect(f.totalInterest).toBe(0);
  });
});

describe("financingByAsset — 물건별 월 추정 이자(연결 대출)", () => {
  const mortgage = (over: Partial<Liability> = {}): Liability => ({
    id: "m1",
    name: "담보대출",
    kind: "MORTGAGE",
    principal: 100_000_000,
    interestRate: 0.03,
    startedAt: null,
    manualAssetId: null,
    ...over,
  });

  const reAsset = asset({ id: "re1", acquiredAt: "2025-01-01" });

  it("연결된 담보대출만 그 물건에 이름·월/누적 이자로 귀속", () => {
    const map = financingByAsset(
      [
        mortgage({ id: "m1", name: "신한 담보", manualAssetId: "re1" }), // 1억@3% → 월 25만
        mortgage({ id: "m2", manualAssetId: null }), // 미연결 → 제외
        mortgage({ id: "m3", kind: "MARGIN", manualAssetId: "re1" }), // 마진 → 제외
      ],
      [reAsset],
      "2025-02-01",
    );
    expect(Object.keys(map)).toEqual(["re1"]);
    expect(map["re1"]).toHaveLength(1);
    expect(map["re1"][0].liability.name).toBe("신한 담보");
    expect(map["re1"][0].liability.id).toBe("m1");
    expect(map["re1"][0].monthly).toBeCloseTo(250_000, 2);
    // 기점=물건 취득일(1/1)~2/1 = 1개월 → 누적 25만
    expect(map["re1"][0].cumulative).toBeCloseTo(250_000, 2);
  });

  it("한 물건에 대출 여러 개면 목록으로", () => {
    const map = financingByAsset(
      [
        mortgage({ id: "m1", manualAssetId: "re1", principal: 100_000_000, interestRate: 0.03 }),
        mortgage({ id: "m2", manualAssetId: "re1", principal: 50_000_000, interestRate: 0.04 }),
      ],
      [reAsset],
      "2025-02-01",
    );
    expect(map["re1"]).toHaveLength(2);
    const total = map["re1"].reduce((s, l) => s + l.monthly, 0);
    expect(total).toBeCloseTo((3_000_000 + 2_000_000) / 12, 2);
  });
});

describe("사업부 그룹 (computeDivisions)", () => {
  it("종류를 사업부로 묶고, 자산 있는 사업부만 반환", () => {
    const divs = computeDivisions(
      [
        asset({ id: "re", kind: "REAL_ESTATE" }),
        asset({ id: "art", kind: "COLLECTIBLE", acquiredPrice: 10_000_000, currentValue: 12_000_000 }),
        asset({ id: "biz", kind: "UNLISTED", acquiredPrice: 5_000_000, currentValue: 5_000_000 }),
      ],
      [],
    );
    expect(divs.map((d) => d.key)).toEqual(["REAL_ESTATE", "BUSINESS", "PHYSICAL"]);
    const physical = divs.find((d) => d.key === "PHYSICAL")!;
    const business = divs.find((d) => d.key === "BUSINESS")!;
    // 실물(미술)은 수익 안 냄, 사업(비상장)은 수익 냄
    expect(physical.producesIncome).toBe(false);
    expect(business.producesIncome).toBe(true);
    expect(physical.label).toBe("대체 사업부");
  });

  it("임대수익은 해당 자산의 사업부에만 귀속", () => {
    const divs = computeDivisions(
      [asset({ id: "re", kind: "REAL_ESTATE" })],
      [income({ assetId: "re", amount: 3_000_000, cost: 0 })],
    );
    expect(divs).toHaveLength(1);
    expect(divs[0].totals.realized).toBe(3_000_000);
  });
});
