import { describe, expect, it } from "vitest";
import {
  approvedSymbols,
  groupBySector,
  resolveUniverse,
  type UniverseStatusMap,
} from "./universe";

describe("resolveUniverse — 행이 없을 때의 규칙 (PRD §3.1)", () => {
  it("보유 중이고 저장된 상태가 없으면 후보다 — 기존 동작 보존", () => {
    const entries = resolveUniverse(["AAPL", "005930"], {});
    expect(approvedSymbols(entries).sort()).toEqual(["005930", "AAPL"]);
    expect(entries.every((e) => e.implicit)).toBe(true);
  });

  it("보유 중이어도 WATCH 로 내리면 후보에서 빠진다", () => {
    const entries = resolveUniverse(["AAPL", "005930"], { AAPL: "WATCH" });
    expect(approvedSymbols(entries)).toEqual(["005930"]);
    expect(entries.find((e) => e.symbol === "AAPL")!.implicit).toBe(false);
  });

  it("보유하지 않아도 APPROVED 면 후보다 — 아직 안 산 기업", () => {
    const entries = resolveUniverse(["AAPL"], { META: "APPROVED" });
    expect(approvedSymbols(entries).sort()).toEqual(["AAPL", "META"]);
    const meta = entries.find((e) => e.symbol === "META")!;
    expect(meta.held).toBe(false);
    expect(meta.status).toBe("APPROVED");
  });

  it("보유하지 않고 WATCH 면 후보가 아니다 — 그냥 관심종목", () => {
    const entries = resolveUniverse(["AAPL"], { NVDA: "WATCH" });
    expect(approvedSymbols(entries)).toEqual(["AAPL"]);
  });

  it("보유 종목이 먼저, 그다음 심볼순 — 순서가 매번 뒤집히지 않는다", () => {
    const statuses: UniverseStatusMap = { ZZZ: "APPROVED", META: "APPROVED" };
    const entries = resolveUniverse(["TSLA", "AAPL"], statuses);
    expect(entries.map((e) => e.symbol)).toEqual(["AAPL", "TSLA", "META", "ZZZ"]);
  });

  it("보유 목록과 저장 상태가 겹쳐도 중복되지 않는다", () => {
    const entries = resolveUniverse(["AAPL"], { AAPL: "APPROVED" });
    expect(entries).toHaveLength(1);
  });

  it("보유도 저장도 없으면 빈 목록", () => {
    expect(resolveUniverse([], {})).toEqual([]);
  });
});

describe("groupBySector — 산업별 묶음", () => {
  const sectors: Record<string, string> = {
    "005930": "반도체",
    SK: "반도체",
    META: "플랫폼",
  };

  it("섹터별로 묶고 종목 많은 순으로 정렬한다", () => {
    const groups = groupBySector(
      [{ symbol: "META" }, { symbol: "005930" }, { symbol: "SK" }],
      (s) => sectors[s],
    );
    expect(groups.map((g) => g.sector)).toEqual(["반도체", "플랫폼"]);
    expect(groups[0].items.map((i) => i.symbol)).toEqual(["005930", "SK"]);
  });

  it("섹터를 모르는 종목은 미분류로 모아 맨 뒤에 둔다 — 추측하지 않는다", () => {
    const groups = groupBySector(
      [{ symbol: "UNKNOWN1" }, { symbol: "UNKNOWN2" }, { symbol: "META" }],
      (s) => sectors[s],
    );
    // 미분류가 2개로 더 많지만 그래도 맨 뒤다.
    expect(groups[groups.length - 1].sector).toBe("미분류");
    expect(groups[groups.length - 1].items).toHaveLength(2);
  });

  it("빈 문자열 섹터도 미분류로 취급한다", () => {
    const groups = groupBySector([{ symbol: "X" }], () => "");
    expect(groups[0].sector).toBe("미분류");
  });
});
