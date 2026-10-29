import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PriceWatchStages, { PriceWatchConnections, UnheldPriceWatches } from "./PriceWatchStages";
import { emptyPortfolio, summarize } from "@/lib/family/model";
import type { PriceWatchInstrument } from "@/lib/family/valuation-alerts";

const instrument: PriceWatchInstrument = { symbol: "BRK.B", exchange: "NYSE", currency: "USD", basisDate: "2026-06-30", updatedAt: "2026-10-29T14:00:00Z", status: "verified", conditions: [{ id: "A", label: "A 실제 자사주 매입가", direction: "lte", value: 100, note: "가상 테스트 값" }, { id: "B", label: "B P/TBV 최저선", direction: "lte", value: null, note: "검증 전" }], note: "B주 1주 단위 · A/B OR" };
describe("해외·다양한 가격 조건 표시", () => {
  it("A/B 이름·USD 주당 단위·실제 시세시각 유지, 단계나 원화로 오인하지 않음", () => {
    const html = renderToStaticMarkup(<PriceWatchStages instrument={instrument} title="가상 예약" quote={{ symbol: "BRK-B", exchange: "NYSE", currency: "USD", unit: "share", price: 100, marketTime: Date.now() / 1000 }} />);
    expect(html).toContain('aria-label="A 실제 자사주 매입가 도달"');
    expect(html).toContain('aria-label="B P/TBV 최저선 검증 대기"');
    expect(html).toContain("USD 100/주 이하");
    expect(html).toContain("KST");
    expect(html).not.toContain("1차");
    expect(html).not.toContain("100원");
  });
  it("시세 없음은 판정 보류, 미검증 가격은 검증 대기로 구분", () => {
    const html = renderToStaticMarkup(<PriceWatchStages instrument={instrument} title="가상 예약" />);
    expect(html).toContain('aria-label="A 실제 자사주 매입가 판정 보류"');
    expect(html).toContain('aria-label="B P/TBV 최저선 검증 대기"');
    expect(html).not.toContain("미도달");
  });
  it("FFH는 미보유 감시로 표시하며 보유수량·국가배분·수익률을 바꾸지 않음", () => {
    const p = emptyPortfolio(), before = summarize(p);
    const ffh = { ...instrument, symbol: "FFH", exchange: "TSX", currency: "CAD", note: "subordinate voting common share 1주" };
    p.priceWatchConnections = { task: { version: 1, title: "가상 예약", updatedAt: ffh.updatedAt, instruments: [ffh] } };
    expect(summarize(p)).toEqual(before);
    expect(p.holdings).toEqual([]);
    expect(renderToStaticMarkup(<UnheldPriceWatches data={p} group={4} />)).toContain("FFH · TSX · CAD/주");
    expect(renderToStaticMarkup(<UnheldPriceWatches data={p} group={2} />)).toBe("");
  });
  it("독립된 네 연결 키와 검증대기·손상된 연결을 숨기지 않음", () => {
    const pending = { ...instrument, status: "pending", basisDate: null, conditions: [] };
    const connection = (title: string, i: unknown) => ({ version: 1, title, updatedAt: instrument.updatedAt, instruments: [i] });
    const html = renderToStaticMarkup(<PriceWatchConnections input={{ first: connection("첫째 예약", instrument), second: connection("둘째 예약", pending), third: connection("셋째 예약", instrument), fourth: {} }} />);
    expect(html).toContain("가격 감시 연결 4개");
    expect(html).toContain("둘째 예약");
    expect(html).toContain("검증 대기");
    expect(html).toContain("연결 형식 확인 필요");
    expect(html).toContain("fourth");
  });
});
