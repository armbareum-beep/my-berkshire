import { describe, expect, it } from "vitest";
import { rankRows } from "./allocateRanking";
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
