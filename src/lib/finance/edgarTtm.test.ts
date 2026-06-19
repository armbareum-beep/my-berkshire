import { describe, expect, it } from "vitest";
import { selectLatestYtdPair, type EdgarFact } from "./edgar";

const fact = (overrides: Partial<EdgarFact>): EdgarFact => ({
  start: "2024-09-29",
  end: "2025-03-29",
  val: 1,
  fy: 2025,
  fp: "Q2",
  form: "10-Q",
  filed: "2025-05-02",
  accn: "current",
  ...overrides,
});

describe("SEC TTM period selection", () => {
  it("selects cumulative Q2 facts instead of standalone quarter facts", () => {
    const pair = selectLatestYtdPair(
      [
        fact({ start: "2025-09-28", end: "2026-03-28", fy: 2026, filed: "2026-05-01" }),
        fact({ start: "2025-12-28", end: "2026-03-28", fy: 2026, filed: "2026-05-01" }),
        fact({}),
        fact({ start: "2024-12-29", end: "2025-03-29" }),
      ],
      "2025-09-27",
      "2026-06-19",
    );
    expect(pair?.fiscalPeriod).toBe("H1");
    expect(pair?.current.start).toBe("2025-09-28");
    expect(pair?.prior.start).toBe("2024-09-29");
  });

  it("ignores filings after the requested as-of date", () => {
    const pair = selectLatestYtdPair(
      [
        fact({ start: "2025-09-28", end: "2026-03-28", filed: "2026-05-01" }),
        fact({ start: "2025-09-28", end: "2025-12-27", fp: "Q1", filed: "2026-01-30" }),
        fact({ start: "2024-09-29", end: "2024-12-28", fp: "Q1", filed: "2025-01-31" }),
      ],
      "2025-09-27",
      "2026-03-01",
    );
    expect(pair?.fiscalPeriod).toBe("Q1");
    expect(pair?.current.end).toBe("2025-12-27");
  });
});
