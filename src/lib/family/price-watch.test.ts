import { describe, expect, it } from "vitest";
import { readPriceWatchConnection, watchConditionStates, watchQuoteSymbol, watchesForSymbol, type NativeQuote, type PriceWatchInstrument } from "./valuation-alerts";
const now = Date.parse("2026-10-29T15:00:00Z");
const instrument: PriceWatchInstrument = { symbol: "BRK.B", exchange: "NYSE", currency: "USD", basisDate: "2026-06-30", updatedAt: "2026-10-29T14:00:00Z", status: "verified", conditions: [{ id: "A", label: "A 실제 매입가", direction: "lte", value: 100, note: "가상 테스트 값" }, { id: "B", label: "B P/TBV", direction: "lte", value: 90, note: "가상 테스트 값" }], note: "B주 1주 단위" };
const q: NativeQuote = { symbol: "BRK-B", exchange: "NYSE", currency: "USD", price: 100, marketTime: now / 1000, unit: "share" };
const states = (i = instrument, quote: NativeQuote | undefined = q) => watchConditionStates(i, quote, now).conditions.map(c => c.state);
const connection = { version: 1, title: "가상 감시", updatedAt: instrument.updatedAt, instruments: [instrument] };
describe("통화·상장시장별 독립 가격 감시", () => {
  it("A/B OR 조건은 단계로 바꾸지 않으며 경계 포함", () => {
    expect(states()).toEqual(["hit", "waiting"]);
    expect(states(instrument, { ...q, price: 90 })).toEqual(["hit", "hit"]);
    expect(states(instrument, { ...q, price: 101 })).toEqual(["waiting", "waiting"]);
    expect(states({ ...instrument, conditions: [{ ...instrument.conditions[0], direction: "gte" }] })).toEqual(["hit"]);
  });
  it("원화 환산가·타 통화·다른 주식·다른 시장·단위는 비교 금지", () => {
    for (const patch of [{ currency: "KRW", price: 130000 }, { currency: "CAD" }, { symbol: "BRK-A" }, { exchange: "NASDAQ" }, { unit: "other" as const }]) expect(states(instrument, { ...q, ...patch })).toEqual(["unjudged", "unjudged"]);
  });
  it("0·NaN·음수·누락·오래된·미래 시세는 미도달과 구분", () => {
    expect(watchConditionStates(instrument, undefined, now).conditions[0].state).toBe("unjudged");
    for (const patch of [{ price: 0 }, { price: NaN }, { price: -1 }, { marketTime: 0 }, { marketTime: NaN }, { marketTime: now / 1000 - 1201 }, { marketTime: now / 1000 + 301 }]) expect(states(instrument, { ...q, ...patch })).toEqual(["unjudged", "unjudged"]);
  });
  it("검증 대기인 B가 독립적으로 검증된 A를 막지 않음", () => {
    expect(states({ ...instrument, conditions: [instrument.conditions[0], { ...instrument.conditions[1], value: null }] })).toEqual(["hit", "pending"]);
    expect(states({ ...instrument, status: "pending" })).toEqual(["pending", "pending"]);
  });
  it("명시적 별칭만 연결하고 FFH의 CAD 상장만 조회", () => {
    expect(watchesForSymbol({ task: connection }, "BRK-B")).toHaveLength(1);
    expect(watchesForSymbol({ task: connection }, "BRK-A")).toHaveLength(0);
    const ffh = { ...instrument, symbol: "FFH", exchange: "TSX", currency: "CAD" };
    expect(watchQuoteSymbol(ffh)).toBe("FFH.TO");
    expect(states(ffh, { ...q, symbol: "FFH.TO", exchange: "TSX", currency: "CAD" })).toEqual(["hit", "waiting"]);
    for (const symbol of ["FFH-U.TO", "FRFHF", "FIH-U.TO"]) expect(states(ffh, { ...q, symbol, exchange: "TSX", currency: "CAD" })).toEqual(["unjudged", "unjudged"]);
  });
  it("KRX 6자리 코드는 실제 거래소 접미사를 검증", () => {
    const kr = { ...instrument, symbol: "123456", exchange: "KRX", currency: "KRW" };
    expect(states(kr, { ...q, symbol: "123456.KQ", exchange: "KRX", currency: "KRW" })).toEqual(["hit", "waiting"]);
  });
  it("손상된 계약·0·음수·잘못된 방향·중복 ID를 거부", () => {
    expect(readPriceWatchConnection(connection)).not.toBeNull();
    for (const value of [0, -1, Infinity, "100"]) expect(readPriceWatchConnection({ ...connection, instruments: [{ ...instrument, conditions: [{ ...instrument.conditions[0], value }] }] })).toBeNull();
    for (const patch of [{ currency: "US$" }, { updatedAt: "yesterday" }, { basisDate: "2026-02-30" }, { conditions: [instrument.conditions[0], instrument.conditions[0]] }, { conditions: [{ ...instrument.conditions[0], direction: "down" }] }]) expect(readPriceWatchConnection({ ...connection, instruments: [{ ...instrument, ...patch }] })).toBeNull();
    expect(readPriceWatchConnection({ ...connection, instruments: [instrument, instrument] })).toBeNull();
  });
  it("다른 예약의 미검증 재무기말 null·미설정 조건도 보존해서 읽음", () => {
    const pending = { ...instrument, status: "pending", basisDate: null, conditions: [] };
    expect(readPriceWatchConnection({ ...connection, instruments: [pending] })).not.toBeNull();
    expect(readPriceWatchConnection({ ...connection, instruments: [{ ...pending, status: "verified" }] })).toBeNull();
  });
});
