import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HoldingValuationStatus from "./HoldingValuationStatus";
import TargetMembers from "./TargetMembers";
import { emptyPortfolio, summarize } from "@/lib/family/model";

describe("간단한 보유종목 상태 표시", () => {
  it("가격표·산식·고평가·예약 정보 없이 저평가 상태만 표시", () => {
    const data = emptyPortfolio();
    data.valuationAlerts = { TEST: { currency: "KRW", basisDate: "2026-06-30", updatedAt: "2026-10-29T00:00:00Z", methods: [{ id: "DCF", label: "가상 산식", down: [100, 90, 80], up: [200, 300], note: "상세 산식" }] } };
    data.quoteMarketTimes = { TEST: Date.now() / 1000 };
    const html = renderToStaticMarkup(<HoldingValuationStatus data={data} code="TEST" price={100} />);
    expect(html).toContain("저평가 구간");
    for (const text of ["고평가", "가상 산식", "상세 산식", "details", "table", "1차", "예약"]) expect(html).not.toContain(text);
    expect((html.match(/<small/g) || [])).toHaveLength(1);
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
