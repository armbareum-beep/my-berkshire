import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HoldingValuationStatus from "./HoldingValuationStatus";
import TargetMembers from "./TargetMembers";
import { emptyPortfolio, summarize } from "@/lib/family/model";

describe("보유종목 단계 표시", () => {
  it("모바일 목록의 A/B에 전일 종가 기준과 관측 시각을 표시", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-30T05:30:00Z"));
    try {
      const data = emptyPortfolio();
      const end = Date.parse("2026-10-29T20:00:00Z") / 1000;
      const instrument = { symbol: "BRK.B", exchange: "NYSE", currency: "USD", basisDate: "2026-06-30", updatedAt: "2026-10-29T00:00:00Z", status: "verified", note: "가상", conditions: [{ id: "A", label: "A 자사주", direction: "lte", value: 100, note: "가상" }, { id: "B", label: "B P/TBV", direction: "lte", value: 90, note: "가상" }] };
      data.priceWatchConnections = { task: { version: 1, title: "가상", updatedAt: instrument.updatedAt, instruments: [instrument] } };
      data.rawQuotes = { "BRK-B": { symbol: "BRK-B", exchange: "NYSE", currency: "USD", unit: "share", price: 95, marketTime: end, regularSession: { start: end + 63000, end: end + 86400 }, regularSessions: [{ start: end - 23400, end }], sessionTimeZone: "America/New_York" } };
      const html = renderToStaticMarkup(<HoldingValuationStatus data={data} code="BRK-B" price={999999} />);
      expect(html).toContain('aria-label="자사주 매수 A 도달"');
      expect(html).toContain('aria-label="P/TBV 매수 B 미도달"');
      expect(html).toContain("종가 기준");
      expect(html).toContain("05:00 KST");
      expect(html).not.toContain("판정 보류");
      expect(html).not.toContain("A<b>?");
      expect(html).not.toContain("B<b>?");
    } finally { clock.mockRestore(); }
  });
  it("상세 가격표 없이 P/TBV·역DCF 단계 각각 표시", () => {
    const data = emptyPortfolio();
    data.valuationAlerts = { TEST: { currency: "KRW", basisDate: "2026-06-30", updatedAt: "2026-10-29T00:00:00Z", methods: [{ id: "DCF", label: "가상 산식", down: [100, 90, 80], up: [200, 300], note: "상세 산식" }] } };
    data.quoteMarketTimes = { TEST: Date.now() / 1000 };
    const html = renderToStaticMarkup(<HoldingValuationStatus data={data} code="TEST" price={100} />);
    expect(html).toContain("P/TBV");
    expect(html).toContain("역DCF");
    expect(html).toContain('aria-label="역DCF 매수 1차 도달"');
    expect(html).toContain('aria-label="역DCF 매수 2차 미도달"');
    expect(html).toContain('aria-label="역DCF 매수 3차 미도달"');
    expect(html).toContain('aria-label="P/TBV 매수 1차 기준 미설정"');
    expect(html).toContain('aria-label="역DCF 매도 1차 미도달"');
    expect(html).toContain('aria-label="역DCF 매도 2차 미도달"');
    expect(html).toContain('aria-label="역DCF 매도 3차 기준 미설정"');
    expect((html.match(/class="hv-side up"/g) || [])).toHaveLength(2);
    for (const text of ["가상 산식", "상세 산식", "details", "table", "예약"]) expect(html).not.toContain(text);
    expect((html.match(/class="hv-row"/g) || [])).toHaveLength(2);
  });
  it("미보유 감시종목은 국가 목록에 나타나지 않음", () => {
    const data = emptyPortfolio();
    data.priceWatchConnections = { task: { version: 1, title: "숨겨야 할 예약", updatedAt: "2026-10-29T00:00:00Z", instruments: [{ symbol: "UNHELD", exchange: "NYSE", currency: "USD", basisDate: null, updatedAt: "2026-10-29T00:00:00Z", status: "pending", conditions: [], note: "가상" }] } };
    const before = summarize(data);
    const html = renderToStaticMarkup(<TargetMembers data={data} s={before} group={2} />);
    expect(html).toContain("보유한 종목이 없어요");
    for (const text of ["UNHELD", "숨겨야 할 예약", "미보유", "가격 감시"]) expect(html).not.toContain(text);
    expect(summarize(data)).toEqual(before);
  });
});
