import { describe, expect, it } from "vitest";
import {
  groupRanked,
  rankBasis,
  rankRows,
  targetGap,
} from "./allocateRanking";
import type { AllocateRow } from "./allocateData";

function row(
  symbol: string,
  value: number,
  target: number,
  extra: Partial<AllocateRow> = {},
): AllocateRow {
  return {
    key: symbol,
    symbol,
    label: symbol,
    value,
    target,
    held: value > 0,
    price: 100,
    assetType: "주식",
    country: "미국",
    sector: "반도체",
    ...extra,
  };
}

const symbols = (rows: ReturnType<typeof rankRows>) => rows.map((r) => r.row.symbol);

describe("rankRows — 살 수 있는 것이 먼저 (PRD §6.1)", () => {
  it("한도에 걸린 종목은 살 수 있는 종목보다 아래로 간다", () => {
    // 총 1000. A: 목표 10%·현재 30% → hard cap(15%) 초과 → 차단
    //          B: 목표 60%·현재 20% → 살 수 있음 (미달 40%p)
    //          C: 목표 50%·현재 50% → 살 수 있음 (미달 0)
    const ranked = rankRows([row("A", 300, 0.1), row("B", 200, 0.6), row("C", 500, 0.5)]);
    expect(symbols(ranked)).toEqual(["B", "C", "A"]);
  });

  it("기대수익률이 높은 순으로 줄 세운다", () => {
    const ranked = rankRows([
      row("LOW", 0, 0.3, { expectedCagr: 0.09, requiredReturn: 0.12 }),
      row("HIGH", 0, 0.3, { expectedCagr: 0.22, requiredReturn: 0.12 }),
      row("MID", 0, 0.4, { expectedCagr: 0.15, requiredReturn: 0.12 }),
    ]);
    expect(symbols(ranked)).toEqual(["HIGH", "MID", "LOW"]);
  });

  it("가정이 있는 종목이 없는 종목보다 위 — 모르는 것을 0%로 취급하지 않는다", () => {
    const ranked = rankRows([
      row("NONE", 0, 0.5),
      row("HAS", 0, 0.5, { expectedCagr: 0.05, requiredReturn: 0.12 }),
    ]);
    expect(symbols(ranked)).toEqual(["HAS", "NONE"]);
  });

  it("가정이 둘 다 없으면 목표 미달이 큰 순", () => {
    // A 는 목표 70% 인데 10% 뿐, B 는 목표 30% 에 20%.
    const ranked = rankRows([row("B", 200, 0.3), row("A", 100, 0.7)]);
    expect(symbols(ranked)).toEqual(["A", "B"]);
  });

  it("목표를 채운 종목은 차단된 종목보다는 위다", () => {
    // FILLED 는 "다 샀다"이고 BLOCKED 는 "사면 안 된다" — 둘은 다른 말이다.
    const ranked = rankRows([
      row("BLOCKED", 300, 0.1),
      row("FILLED", 500, 0.5),
      row("BUY", 200, 0.4),
    ]);
    expect(symbols(ranked)).toEqual(["BUY", "FILLED", "BLOCKED"]);
  });

  it("빈 목록에서도 터지지 않는다", () => {
    expect(rankRows([])).toEqual([]);
  });

  it("모든 행이 leg 를 갖는다 — 화면에서 종목이 조용히 사라지지 않게", () => {
    const rows = [row("A", 100, 0.5), row("B", 100, 0.5)];
    expect(rankRows(rows)).toHaveLength(rows.length);
  });
});

describe("groupRanked — 개별주와 ETF 를 가른다", () => {
  it("자산유형으로 나눈다 — ETF·코인·원자재는 기대수익률 모형 밖", () => {
    const ranked = rankRows([
      row("005930", 100, 0.3),
      row("278530", 100, 0.3, { assetType: "ETF" }),
      row("BTC-USD", 100, 0.2, { assetType: "코인" }),
      row("411060", 100, 0.2, { assetType: "원자재" }),
    ]);
    const { stocks, others } = groupRanked(ranked);
    expect(stocks.map((r) => r.row.symbol)).toEqual(["005930"]);
    expect(others.map((r) => r.row.symbol).sort()).toEqual([
      "278530",
      "411060",
      "BTC-USD",
    ]);
  });

  it("나누어도 전체 개수는 보존된다 — 종목이 조용히 사라지지 않게", () => {
    const ranked = rankRows([
      row("A", 100, 0.5),
      row("B", 100, 0.5, { assetType: "ETF" }),
    ]);
    const { stocks, others } = groupRanked(ranked);
    expect(stocks.length + others.length).toBe(ranked.length);
  });

  it("자산유형을 모르면 개별주로 본다 — 기존 동작(기본값 주식)", () => {
    const ranked = rankRows([row("A", 100, 1)]);
    expect(groupRanked(ranked).stocks).toHaveLength(1);
  });
});

describe("groupRanked — 묶음마다 자기 기준으로 센다", () => {
  it("ETF 묶음은 목표 미달이 큰 순 — 전역 정렬(주식 기준)을 그대로 쓰지 않는다", () => {
    // 총 1000. A: 목표 60%·현재 10% → 미달 50%p, B: 목표 30%·현재 20% → 미달 10%p
    const ranked = rankRows([
      row("B", 200, 0.3, { assetType: "ETF" }),
      row("A", 100, 0.6, { assetType: "ETF" }),
      row("C", 700, 0.1, { assetType: "ETF" }),
    ]);
    const { others } = groupRanked(ranked);
    expect(others.map((r) => r.row.symbol)[0]).toBe("A");
  });

  it("targetGap 은 목표 − 현재 — 넘겼으면 음수", () => {
    const ranked = rankRows([row("A", 100, 0.5), row("B", 900, 0.5)]);
    const a = ranked.find((r) => r.row.symbol === "A")!;
    const b = ranked.find((r) => r.row.symbol === "B")!;
    expect(targetGap(a)).toBeCloseTo(0.4); // 목표 50% − 현재 10%
    expect(targetGap(b)).toBeCloseTo(-0.4); // 목표 50% − 현재 90%
  });

  it("주식 묶음은 전역 정렬(기대수익률 순)을 유지한다", () => {
    const ranked = rankRows([
      row("LOW", 0, 0.3, { expectedCagr: 0.09, requiredReturn: 0.12 }),
      row("HIGH", 0, 0.3, { expectedCagr: 0.22, requiredReturn: 0.12 }),
      row("ETF", 0, 0.4, { assetType: "ETF" }),
    ]);
    expect(groupRanked(ranked).stocks.map((r) => r.row.symbol)).toEqual([
      "HIGH",
      "LOW",
    ]);
  });
});

describe("rankBasis — 왜 이 자리인지", () => {
  it("개별주는 기대수익률이 근거다 — 정렬 키와 같은 값", () => {
    const ranked = rankRows([
      row("HIGH", 0, 0.3, { expectedCagr: 0.22, requiredReturn: 0.12 }),
      row("LOW", 0, 0.3, { expectedCagr: 0.09, requiredReturn: 0.12 }),
    ]);
    const bases = ranked.map((r) => rankBasis(r, "stocks"));
    expect(bases.map((b) => b.kind)).toEqual(["cagr", "cagr"]);
    // 목록 순서대로 읽으면 내림차순 — 그게 "로직이 있다"의 증거다.
    const values = bases.map((b) => (b.kind === "cagr" ? b.cagr : NaN));
    expect(values[0]).toBeGreaterThan(values[1]);
  });

  it("가정이 없는 개별주는 그 사실 자체가 근거다", () => {
    const ranked = rankRows([row("NONE", 100, 0.5)]);
    const b = rankBasis(ranked[0], "stocks");
    expect(b.kind).toBe("unjudged");
    if (b.kind === "unjudged") expect(b.gap).toBeCloseTo(0.5 - 1);
  });

  it("ETF 묶음은 목표 미달이 근거다 — 기대수익률 모형을 못 쓴다", () => {
    // 총 1000. A 는 목표 70%에 10%, B 는 30%에 20%.
    const { others } = groupRanked(
      rankRows([
        row("A", 100, 0.7, { assetType: "ETF" }),
        row("B", 200, 0.3, { assetType: "ETF" }),
      ]),
    );
    const bases = others.map((r) => rankBasis(r, "others"));
    expect(bases.every((b) => b.kind === "gap")).toBe(true);
    const gaps = bases.map((b) => (b.kind === "gap" ? b.gap : NaN));
    expect(gaps[0]).toBeGreaterThan(gaps[1]);
  });

  it("ETF 는 기대수익률이 있어도 목표 미달로 말한다 — 섹션 기준을 따른다", () => {
    const ranked = rankRows([
      row("SPY", 100, 0.4, { assetType: "ETF", expectedCagr: 0.2 }),
    ]);
    expect(rankBasis(ranked[0], "others").kind).toBe("gap");
  });
});
