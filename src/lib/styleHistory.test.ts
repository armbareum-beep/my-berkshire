import { describe, expect, it } from "vitest";
import { toStyleHistorySnapshot } from "./styleHistory";
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
});
