import { describe, expect, it } from "vitest";
import {
  approvedSymbols,
  resolveUniverse,
  type UniverseStatusMap,
} from "./universe";

describe("resolveUniverse — 판정 규칙 (PRD §3.1)", () => {
  it("보유 중이면 후보다", () => {
    const entries = resolveUniverse(["AAPL", "005930"], {});
    expect(approvedSymbols(entries).sort()).toEqual(["005930", "AAPL"]);
  });

  it("보유 중이면 WATCH 행이 있어도 후보다 — 관심종목 표시로 배분에서 빠지지 않는다", () => {
    // `watchlist` 행은 대부분 관심종목 기능이 만든 것이라 "배분 제외" 의사가 아니다.
    // 이걸 제외로 읽으면 관심종목에 담아둔 보유 주식이 조용히 사라진다(실제로 그랬다).
    const entries = resolveUniverse(["AAPL", "005930"], { AAPL: "WATCH" });
    expect(approvedSymbols(entries).sort()).toEqual(["005930", "AAPL"]);
  });

  it("배분에서 빼는 건 목표비중 0 이 한다 — 여기서는 빼지 않는다", () => {
    const entries = resolveUniverse(["AAPL"], { AAPL: "WATCH" });
    expect(entries[0].status).toBe("APPROVED");
    expect(entries[0].held).toBe(true);
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
