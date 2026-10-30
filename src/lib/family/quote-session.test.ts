import { describe, expect, it } from "vitest";
import { quoteTimeBasis, readQuoteSessions } from "./quote-session";
import { watchConditionStates, type NativeQuote, type PriceWatchInstrument } from "./valuation-alerts";
const seconds = (s: string) => Date.parse(s) / 1000;
const session = (day: string, open = "13:30", close = "20:00") => ({ start: seconds(`${day}T${open}:00Z`), end: seconds(`${day}T${close}:00Z`) });
const thu = session("2026-10-29"), fri = session("2026-10-30");
const quote: NativeQuote = { symbol: "BRK-B", exchange: "NYSE", currency: "USD", unit: "share", price: 95, marketTime: thu.end, regularSession: fri, regularSessions: [thu, fri], sessionTimeZone: "America/New_York" };
const instrument: PriceWatchInstrument = { symbol: "BRK.B", exchange: "NYSE", currency: "USD", basisDate: "2026-06-30", updatedAt: "2026-10-29T00:00:00Z", status: "verified", note: "fictional", conditions: [{ id: "A", label: "A 자사주", direction: "lte", value: 100, note: "fictional" }, { id: "B", label: "B P/TBV", direction: "lte", value: 90, note: "fictional" }] };
describe("장외 종가 비교", () => {
  it("한국 오후의 전일 종가로 A/B를 각각 비교하고 종가·시각을 표시", () => {
    const state = watchConditionStates(instrument, quote, Date.parse("2026-10-30T05:30:00Z"));
    expect(state.conditions.map(c => c.state)).toEqual(["hit", "waiting"]);
    expect(state.quoteLabel).toContain("종가 기준");
    expect(state.quoteLabel).toContain("05:00");
    expect(state.quoteLabel).toContain("KST");
    expect(state.reason).toBe("");
  });
  it("개장 전까지만 종가 허용, 개장 순간부터 오래된 종가는 보류", () => {
    expect(quoteTimeBasis(quote, fri.start * 1000 - 1)).toBe("close");
    expect(quoteTimeBasis(quote, fri.start * 1000)).toBeNull();
    const live = { ...quote, marketTime: fri.start };
    expect(quoteTimeBasis(live, fri.start * 1000 + 1200_000)).toBe("latest");
    expect(quoteTimeBasis(live, fri.start * 1000 + 1201_000)).toBeNull();
  });
  it("주말·제공자가 확인한 휴일과 다음 거래일 개장 경계", () => {
    const next = session("2026-11-03", "14:30", "21:00");
    const closed = { ...quote, marketTime: fri.end, regularSession: next, regularSessions: [fri, next] };
    expect(quoteTimeBasis(closed, Date.parse("2026-11-01T05:30:00Z"))).toBe("close");
    // A synthetic Monday holiday supplied by the provider, not an inferred calendar.
    expect(quoteTimeBasis(closed, Date.parse("2026-11-02T17:00:00Z"))).toBe("close");
    expect(quoteTimeBasis(closed, next.start * 1000)).toBeNull();
    const oldSchedule = { ...closed, regularSession: fri, regularSessions: [fri] };
    expect(quoteTimeBasis(oldSchedule, Date.parse("2026-10-31T17:00:00Z"))).toBe("close");
    expect(quoteTimeBasis(oldSchedule, Date.parse("2026-11-02T15:00:00Z"))).toBeNull();
  });
  it("조기폐장과 DST는 제공된 UTC 경계 사용", () => {
    const short = session("2026-11-27", "14:30", "18:00");
    const next = session("2026-11-30", "14:30", "21:00");
    const closed = { ...quote, marketTime: short.end - 1, regularSession: next, regularSessions: [short, next] };
    expect(quoteTimeBasis(closed, Date.parse("2026-11-28T05:00:00Z"))).toBe("close");
    expect(quoteTimeBasis({ ...closed, marketTime: short.end - 601 }, Date.parse("2026-11-28T05:00:00Z"))).toBeNull();
  });
  it("장중 지연가·이전 세션 종가·미래·과도하게 오래된 관측은 종가로 승격 금지", () => {
    const now = Date.parse("2026-10-30T05:00:00Z");
    for (const marketTime of [thu.end - 1201, thu.end - 86400, NaN, 0, now / 1000 + 301]) expect(quoteTimeBasis({ ...quote, marketTime }, now)).toBeNull();
    expect(quoteTimeBasis(quote, Date.parse("2026-11-10T05:00:00Z"))).toBeNull();
    expect(quoteTimeBasis({ ...quote, regularSessions: [fri] }, now)).toBeNull();
  });
  it("종가라도 통화·상장시장·단위 오류와 미검증 조건은 계속 보류", () => {
    const now = Date.parse("2026-10-30T05:00:00Z");
    for (const patch of [{ currency: "KRW" }, { exchange: "TSX" }, { symbol: "BRK-A" }, { unit: "other" as const }]) {
      const state = watchConditionStates(instrument, { ...quote, ...patch }, now);
      expect(state.conditions.map(c => c.state)).toEqual(["unjudged", "unjudged"]);
      expect(state.quoteLabel).toBeUndefined();
    }
    expect(watchConditionStates({ ...instrument, status: "pending" }, quote, now).conditions[0].state).toBe("pending");
  });
  it("세션 메타데이터가 없으면 기존 장중 20분 제한 유지", () => {
    const now = Date.parse("2026-10-30T05:00:00Z");
    expect(quoteTimeBasis({ marketTime: now / 1000 }, now)).toBe("latest");
    expect(quoteTimeBasis({ marketTime: thu.end }, now)).toBeNull();
  });
  it("배열·regular 객체 메타를 읽고 pre/post·잘못된 세션 제외", () => {
    const meta = { currentTradingPeriod: { regular: fri }, exchangeTimezoneName: "America/New_York" };
    expect(readQuoteSessions({ ...meta, tradingPeriods: [[thu], [fri]] }).regularSessions).toEqual([thu, fri]);
    expect(readQuoteSessions({ ...meta, tradingPeriods: { regular: [[thu]], pre: [[{ start: 1, end: 2 }]] } }).regularSessions).toEqual([thu, fri]);
    expect(readQuoteSessions({ ...meta, tradingPeriods: [[{ start: 1, end: 0 }], [{}]] }).regularSessions).toEqual([fri]);
    expect(readQuoteSessions({ currentTradingPeriod: { regular: {} } })).toEqual({});
  });
});
