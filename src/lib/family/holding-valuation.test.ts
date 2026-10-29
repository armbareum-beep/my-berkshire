import { describe, expect, it } from "vitest";
import { holdingValuationState } from "./holding-valuation";
import type { NativeQuote, PriceWatchInstrument } from "./valuation-alerts";

const now = Date.parse("2026-10-29T14:00:00Z"), marketTime = now / 1000;
const basis = { currency: "KRW", basisDate: "2026-06-30", updatedAt: "2026-10-29T00:00:00Z", methods: [{ id: "DCF", label: "DCF", down: [100, 90, 80], up: [200, 300], note: "가상 기준" }] };
const instrument: PriceWatchInstrument = { symbol: "BRK.B", exchange: "NYSE", currency: "USD", basisDate: "2026-06-30", updatedAt: "2026-10-29T00:00:00Z", status: "verified", conditions: [{ id: "A", label: "A", direction: "lte", value: 100, note: "가상 기준" }, { id: "B", label: "B", direction: "lte", value: 90, note: "가상 기준" }], note: "가상 B주" };
const quote: NativeQuote = { symbol: "BRK-B", exchange: "NYSE", currency: "USD", price: 100, marketTime, unit: "share" };
const state = (patch: Partial<Parameters<typeof holdingValuationState>[0]> = {}) => holdingValuationState({ basis, instruments: [], price: 100, marketTime, now, ...patch });

describe("보유종목 저평가 한 줄 요약", () => {
  it("저평가 경계는 포함하고 여러 단계도 상태 하나로 요약", () => {
    expect(state()).toBe("hit");
    expect(state({ price: 70 })).toBe("hit");
    expect(state({ price: 101 })).toBe("waiting");
  });
  it("고평가 도달은 저평가 구간으로 표시하지 않음", () => {
    expect(state({ price: 300 })).toBe("waiting");
    expect(state({ basis: { ...basis, methods: [{ ...basis.methods[0], down: [] }] } })).toBe("unregistered");
  });
  it("확인된 저평가 하나가 충족하면 다른 대기 조건과 독립적으로 표시", () => {
    expect(state({ instruments: [{ ...instrument, status: "pending" }] })).toBe("hit");
    expect(state({ price: 101, instruments: [{ ...instrument, status: "pending" }] })).toBe("pending");
  });
  it("A/B는 OR를 유지하며 외화 원시 주당가격만 비교", () => {
    expect(state({ basis: undefined, price: 140000, instruments: [instrument], quotes: { "BRK-B": quote } })).toBe("hit");
    expect(state({ basis: undefined, instruments: [instrument], quotes: { "BRK-B": { ...quote, price: 101 } } })).toBe("waiting");
    expect(state({ basis: undefined, instruments: [instrument], quotes: { "BRK-B": { ...quote, currency: "KRW" } } })).toBe("pending");
  });
  it("시세 누락·유효기간 초과·보류 기준은 미도달로 꾸미지 않음", () => {
    expect(state({ marketTime: undefined })).toBe("pending");
    expect(state({ marketTime: marketTime - 5 * 86400 })).toBe("pending");
    expect(state({ basis: undefined, instruments: [instrument], quotes: { "BRK-B": { ...quote, marketTime: marketTime - 1201 } } })).toBe("pending");
    expect(state({ basis: { ...basis, methods: [{ ...basis.methods[0], status: "hold" }] } })).toBe("pending");
  });
  it("미등록·손상·미설정 조건을 구분", () => {
    expect(state({ basis: undefined })).toBe("unregistered");
    expect(state({ basis: {} })).toBe("pending");
    expect(state({ basis: undefined, instruments: [{ ...instrument, status: "pending", basisDate: null, conditions: [] }] })).toBe("pending");
  });
});
