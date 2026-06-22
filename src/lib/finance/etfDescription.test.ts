import { describe, expect, it } from "vitest";
import { buildEtfDescription } from "./etfDescription";

describe("buildEtfDescription", () => {
  it("adds a canonical overview for a known broad index", () => {
    const result = buildEtfDescription({
      name: "KODEX 200",
      trackedIndex: "KOSPI200",
      sectors: [],
      holdings: [],
    });
    expect(result.text).toContain("대형 우량주 200종목");
    expect(result.basis).toBe("index");
  });

  it("describes an uncatalogued sector ETF from product and composition data", () => {
    const result = buildEtfDescription({
      name: "TIGER 미국필라델피아반도체나스닥",
      trackedIndex: null,
      sectors: [{ name: "기술", weight: 0.92 }],
      holdings: [{ symbol: "NVDA", name: "NVIDIA", weight: 0.12 }],
    });
    expect(result.text).toContain("미국필라델피아반도체나스닥");
    expect(result.text).toContain("기술 92.0%");
    expect(result.text).toContain("NVIDIA");
    expect(result.basis).toBe("composition");
  });

  it("labels inverse and currency-hedged strategies from the official product name", () => {
    const result = buildEtfDescription({
      name: "KODEX 미국채울트라30년선물인버스(H)",
      trackedIndex: null,
      sectors: [],
      holdings: [],
    });
    expect(result.tags).toContain("인버스");
    expect(result.tags).toContain("환헤지");
    expect(result.tags).toContain("채권형");
  });
});
