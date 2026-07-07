import { describe, expect, it } from "vitest";
import { computeHoldingsPct, parseHoldingsV1 } from "./rankingHoldings";

describe("computeHoldingsPct", () => {
  it("시세 실패(priceAvailable=false) → null", () => {
    const result = computeHoldingsPct({
      positions: { A: 10 },
      prices: { A: 1000 },
      names: { A: "에이" },
      cash: 0,
      priceAvailable: false,
    });
    expect(result).toBeNull();
  });

  it("보유 종목 없음 → null", () => {
    const result = computeHoldingsPct({
      positions: {},
      prices: {},
      names: {},
      cash: 10_000,
      priceAvailable: true,
    });
    expect(result).toBeNull();
  });

  it("비중 내림차순 + 종목 합 = 현금 제외 몫, 금액·수량 필드 없음", () => {
    const result = computeHoldingsPct({
      positions: { A: 10, B: 30 },
      prices: { A: 1000, B: 1000 }, // A=10,000 / B=30,000
      names: { A: "에이", B: "비" },
      cash: 10_000, // 전체 50,000 — B 60%, A 20%, 현금 20%
      priceAvailable: true,
    });
    expect(result).not.toBeNull();
    expect(result!.items.map((i) => i.symbol)).toEqual(["B", "A"]);
    const sum = result!.items.reduce((s, x) => s + x.pct, 0);
    expect(sum).toBe(80); // 현금 20% 제외 몫
    // 금액·수량 필드가 항목에 존재하지 않아야 한다(비공개 불변식) — symbol·name·pct만.
    for (const item of result!.items) {
      expect(Object.keys(item).sort()).toEqual(["name", "pct", "symbol"]);
    }
  });

  it("반올림 오차는 최대 비중 종목에 보정된다", () => {
    const result = computeHoldingsPct({
      positions: { A: 1, B: 1, C: 1 },
      prices: { A: 1, B: 1, C: 1 }, // 각 33.33%
      names: {},
      cash: 0,
      priceAvailable: true,
    });
    const sum = result!.items.reduce((s, x) => s + x.pct, 0);
    expect(sum).toBe(100);
  });

  it("반올림 0%인 소액 종목도 items에 유지된다(전 종목 공개)", () => {
    const result = computeHoldingsPct({
      positions: { A: 999_999, B: 1 },
      prices: { A: 1, B: 1 },
      names: {},
      cash: 0,
      priceAvailable: true,
    });
    const b = result!.items.find((i) => i.symbol === "B");
    expect(b).toBeDefined();
    expect(b!.pct).toBe(0);
  });

  it("시세 미확보 종목은 제외, 이름 없으면 심볼 폴백", () => {
    const result = computeHoldingsPct({
      positions: { A: 10, B: 10 },
      prices: { A: 1000 }, // B 시세 없음
      names: {},
      cash: 0,
      priceAvailable: true,
    });
    expect(result!.items.map((i) => i.symbol)).toEqual(["A"]);
    expect(result!.items[0].name).toBe("A");
  });
});

describe("parseHoldingsV1", () => {
  it("정상 스키마 파싱", () => {
    const raw = { v: 1, items: [{ symbol: "A", name: "에이", pct: 62 }] };
    expect(parseHoldingsV1(raw)).toEqual(raw);
  });

  it("v가 1이 아니면 null", () => {
    expect(parseHoldingsV1({ v: 2, items: [] })).toBeNull();
  });

  it("null/객체 아님 → null", () => {
    expect(parseHoldingsV1(null)).toBeNull();
    expect(parseHoldingsV1("문자열")).toBeNull();
  });

  it("items 항목이 손상되면 필터링", () => {
    const raw = {
      v: 1,
      items: [
        { symbol: "A", name: "에이", pct: 50 },
        { symbol: "B", name: "비" },
        null,
        42,
      ],
    };
    expect(parseHoldingsV1(raw)).toEqual({
      v: 1,
      items: [{ symbol: "A", name: "에이", pct: 50 }],
    });
  });
});
