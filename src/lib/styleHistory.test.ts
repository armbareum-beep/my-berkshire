import { describe, expect, it } from "vitest";
import { toStyleHistorySnapshot } from "./styleHistory";
import type { StyleHistorySnapshot } from "./styleHistory";
import type { StyleResult } from "./style";

describe("toStyleHistorySnapshot", () => {
  it("비교에 필요한 칭호와 축만 날짜별 스냅샷으로 고정한다", () => {
    const style = {
      compositeStyle: null,
      primaryStyle: {
        key: "longTerm",
        label: "장기보유가",
        emoji: "",
        score: 0.8,
        tagline: "",
      },
      dimensions: [
        { key: "longTerm", label: "운용 호흡", score: 0.8 },
        {
          key: "innovation",
          label: "산업 성향",
          score: 0,
          available: false,
        },
      ],
    } as StyleResult;
    expect(toStyleHistorySnapshot(style, "2026-06-19")).toEqual({
      asOfDate: "2026-06-19",
      primaryStyle: { key: "longTerm", label: "장기보유가", score: 0.8 },
      dimensions: [
        { key: "longTerm", label: "운용 호흡", score: 0.8, available: true },
        { key: "innovation", label: "산업 성향", score: 0, available: false },
      ],
    });
  });

  it("규율 점수·등급 라벨을 스냅샷에 채운다(033 US3 등급업 비교용)", () => {
    const style = {
      compositeStyle: null,
      primaryStyle: {
        key: "longTerm",
        label: "장기보유가",
        emoji: "",
        score: 0.8,
        tagline: "",
      },
      dimensions: [],
      score: 76,
      grade: { label: "규율 있는 장기투자가", emoji: "🌳", tone: "good" },
    } as unknown as StyleResult;
    const snapshot = toStyleHistorySnapshot(style, "2026-07-03");
    expect(snapshot.score).toBe(76);
    expect(snapshot.gradeLabel).toBe("규율 있는 장기투자가");
  });

  it("점수 산출 불가(insufficient)면 score·gradeLabel을 채우지 않는다", () => {
    const style = {
      compositeStyle: null,
      primaryStyle: null,
      dimensions: [],
      score: null,
      grade: null,
    } as unknown as StyleResult;
    const snapshot = toStyleHistorySnapshot(style, "2026-07-03");
    expect(snapshot.score).toBeUndefined();
    expect(snapshot.gradeLabel).toBeUndefined();
  });
});

describe("StyleHistorySnapshot 하위호환(v1 VERSION 유지)", () => {
  it("score/gradeLabel 없는 구(舊) 스냅샷도 유효한 타입 — 등급업 비교는 콜드스타트로 침묵", () => {
    // 이 기능 배포 이전에 저장된 v1 스냅샷을 흉내(옵셔널 필드 부재).
    const legacy: StyleHistorySnapshot = {
      asOfDate: "2026-01-01",
      primaryStyle: { key: "longTerm", label: "장기보유가", score: 0.8 },
      dimensions: [],
    };
    expect(legacy.score).toBeUndefined();
    expect(legacy.gradeLabel).toBeUndefined();
  });
});
