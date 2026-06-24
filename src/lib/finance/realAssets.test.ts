import { describe, it, expect } from "vitest";
import {
  effectiveCost,
  unrealizedGain,
  saleGain,
  rentNet,
  computeRealEstateDivision,
  computeDivisions,
  type ManualAsset,
  type ManualAssetIncome,
} from "./realAssets";

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
