import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PerformanceCard from "./PerformanceCard";
import { emptyPortfolio } from "@/lib/family/model";

describe("최신 비교 ETF 수익률", () => {
  it("계좌 시세 실패와 비교 ETF 일부 누락에도 나머지 최신 ETF와 날짜를 표시", () => {
    const p = emptyPortfolio();
    p.performance = { start: "2025-12-31", end: "2026-09-17", method: "daily-eod-estimate", note: "", benchmarks: [
      { id: "379800", name: "S&P500", return: .0633 }, { id: "226490", name: "코스피", return: .606 },
    ] };
    p.benchmarkQuotes = { "379800": { start: "2025-12-31", asOf: "2026-10-30", return: .15, currency: "KRW", marketTime: 1793322000, totalReturn: true } };
    const html = renderToStaticMarkup(<PerformanceCard data={p} owner="all" account="all" broker="all" group="all" />);
    expect(html).toContain("+15.00%");
    expect(html).toContain("2025-12-31 ~ 2026-10-30 · KRW · 분배금 재투자");
    expect(html).toContain("2025-12-31 ~ 2026-09-17 · 갱신 대기");
    expect(html).not.toContain("내 계좌가");
  });
  it("다른 시작일로 계산한 수익률은 선택 기간의 최신값으로 오인하지 않음", () => {
    const p = emptyPortfolio();
    p.performance = { start: "2025-12-31", end: "2026-09-17", method: "daily-eod-estimate", note: "", benchmarks: [{ id: "VOO", name: "VOO", return: .06 }] };
    p.benchmarkQuotes = { VOO: { start: "2026-09-17", asOf: "2026-10-29", return: .15, currency: "USD", marketTime: 1793304000, totalReturn: true } };
    const html = renderToStaticMarkup(<PerformanceCard data={p} owner="all" account="all" broker="all" group="all" />);
    expect(html).toContain("+6.00%");
    expect(html).not.toContain("+15.00%");
  });
});
