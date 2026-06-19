import { describe, expect, it } from "vitest";
import { annualReportEligibility, computeAnnualReport } from "./annualReport";
import type { InvestmentEvent } from "./valuation";

describe("annualReportEligibility", () => {
  it("설립 1주년에 잠금을 해제한다", () => {
    expect(annualReportEligibility("2025-06-19", "2026-06-18").eligible).toBe(false);
    expect(annualReportEligibility("2025-06-19", "2026-06-19").eligible).toBe(true);
  });

  it("윤일 설립 회사는 비윤년 2월 말에 잠금을 해제한다", () => {
    expect(annualReportEligibility("2024-02-29", "2025-02-28").eligible).toBe(true);
  });
});

describe("computeAnnualReport", () => {
  it("직전 1년 XIRR과 베스트 사업부를 계산한다", () => {
    const events: InvestmentEvent[] = [
      { type: "BUY", symbol: "A", quantity: 50, priceOrAmount: 100, feeAndTax: 0, date: "2025-06-19" },
      { type: "BUY", symbol: "B", quantity: 50, priceOrAmount: 100, feeAndTax: 0, date: "2025-06-19" },
      { type: "DIVIDEND", symbol: "A", quantity: null, priceOrAmount: 100, feeAndTax: 10, date: "2026-01-01" },
    ];
    const report = computeAnnualReport(
      { foundedAt: "2025-06-19", initialValuation: 10_000 },
      events,
      {
        A: [{ date: "2025-06-19", close: 100 }, { date: "2026-06-19", close: 120 }],
        B: [{ date: "2025-06-19", close: 100 }, { date: "2026-06-19", close: 80 }],
      },
      { A: 120, B: 80 },
      { A: "알파", B: "베타" },
      10_090,
      "2026-06-19",
    );
    expect(report.start).toBe("2025-06-19");
    expect(report.best?.name).toBe("알파");
    expect(report.worst?.name).toBe("베타");
    expect(report.dividends).toBe(100);
    expect(report.fees).toBe(10);
    expect(report.xirr).not.toBeNull();
  });
});
