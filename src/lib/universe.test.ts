import { describe, expect, it } from "vitest";
import {
  approvedSymbols,
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
