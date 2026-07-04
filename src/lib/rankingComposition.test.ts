import { describe, expect, it } from "vitest";
import { computeCompositionPct, parseCompositionV1 } from "./rankingComposition";
import type { SecurityRecord } from "./securities";

function meta(overrides: Record<string, Partial<SecurityRecord>>): Record<string, SecurityRecord> {
  const out: Record<string, SecurityRecord> = {};
  for (const [symbol, m] of Object.entries(overrides)) {
    out[symbol] = {
      name: symbol,
      country: "기타",
      assetType: "주식",
      currency: "KRW",
      sector: null,
      ...m,
    };
  }
  return out;
}

describe("computeCompositionPct", () => {
  it("시세 실패(priceAvailable=false) → null", () => {
    const result = computeCompositionPct({
      positions: { A: 10 },
      prices: { A: 1000 },
      cash: 0,
      meta: meta({ A: { assetType: "주식" } }),
      priceAvailable: false,
    });
    expect(result).toBeNull();
  });

  it("전체 평가액 0 → null", () => {
    const result = computeCompositionPct({
      positions: {},
      prices: {},
      cash: 0,
      meta: {},
      priceAvailable: true,
    });
    expect(result).toBeNull();
  });

  it("유형별 비중 % 합 = 100, 금액 필드 없음", () => {
    const result = computeCompositionPct({
      positions: { A: 10, B: 5 },
      prices: { A: 1000, B: 2000 }, // A=10,000 주식, B=10,000 ETF
      cash: 5_000, // 현금 5,000
      meta: meta({
        A: { assetType: "주식" },
        B: { assetType: "ETF" },
      }),
      priceAvailable: true,
    });
    expect(result).not.toBeNull();
    const sum = result!.slices.reduce((s, x) => s + x.pct, 0);
    expect(sum).toBe(100);
    // 금액·수량 필드가 슬라이스에 존재하지 않아야 한다(비공개 불변식) — label·pct만.
    for (const slice of result!.slices) {
      expect(Object.keys(slice).sort()).toEqual(["label", "pct"]);
    }
  });

  it("반올림 오차 보정 — 3등분처럼 나눠떨어지지 않아도 합 100", () => {
    const result = computeCompositionPct({
      positions: { A: 1, B: 1, C: 1 },
      prices: { A: 1, B: 1, C: 1 }, // 1:1:1 → 각 33.33%
      cash: 0,
      meta: meta({
        A: { assetType: "주식" },
        B: { assetType: "ETF" },
        C: { assetType: "코인" },
      }),
      priceAvailable: true,
    });
    const sum = result!.slices.reduce((s, x) => s + x.pct, 0);
    expect(sum).toBe(100);
  });

  it("0% 슬라이스는 제외된다", () => {
    const result = computeCompositionPct({
      positions: { A: 999_999, B: 1 },
      prices: { A: 1, B: 1 }, // B는 반올림 시 0%
      cash: 0,
      meta: meta({
        A: { assetType: "주식" },
        B: { assetType: "ETF" },
      }),
      priceAvailable: true,
    });
    expect(result!.slices.every((s) => s.pct > 0)).toBe(true);
    expect(result!.slices.find((s) => s.label === "ETF")).toBeUndefined();
  });

  it("표시 순서 — 주식 → ETF → 원자재 → 코인 → 현금", () => {
    const result = computeCompositionPct({
      positions: { A: 1, B: 1, C: 1, D: 1 },
      prices: { A: 100, B: 100, C: 100, D: 100 },
      cash: 100,
      meta: meta({
        A: { assetType: "코인" },
        B: { assetType: "주식" },
        C: { assetType: "원자재" },
        D: { assetType: "ETF" },
      }),
      priceAvailable: true,
    });
    expect(result!.slices.map((s) => s.label)).toEqual([
      "주식",
      "ETF",
      "원자재",
      "코인",
      "현금",
    ]);
  });
});

describe("parseCompositionV1", () => {
  it("정상 스키마 파싱", () => {
    const raw = { v: 1, slices: [{ label: "주식", pct: 62 }] };
    expect(parseCompositionV1(raw)).toEqual(raw);
  });

  it("v가 1이 아니면 null", () => {
    expect(parseCompositionV1({ v: 2, slices: [] })).toBeNull();
  });

  it("null/객체 아님 → null", () => {
    expect(parseCompositionV1(null)).toBeNull();
    expect(parseCompositionV1("문자열")).toBeNull();
  });

  it("slices 항목이 손상되면 필터링", () => {
    const raw = {
      v: 1,
      slices: [{ label: "주식", pct: 50 }, { label: "ETF" }, null, 42],
    };
    expect(parseCompositionV1(raw)).toEqual({
      v: 1,
      slices: [{ label: "주식", pct: 50 }],
    });
  });
});
