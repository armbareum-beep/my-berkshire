import { describe, expect, it } from "vitest";
import { holdingValuationRows } from "./holding-valuation-stages";
import type { NativeQuote, PriceWatchInstrument } from "./valuation-alerts";
const now = Date.parse("2026-10-29T14:00:00Z"), marketTime = now / 1000;
const basis = { currency: "KRW", basisDate: "2026-06-30", updatedAt: "2026-10-29T00:00:00Z", methods: [{ id: "DCF", label: "역DCF", down: [100, 90, 80], up: [200, 300], note: "가상 기준" }, { id: "PTBV", label: "P/TBV", down: [200, 180, 160], up: [400, 500], note: "가상 기준" }] };
const instrument: PriceWatchInstrument = { symbol: "TEST", exchange: "NYSE", currency: "USD", basisDate: "2026-06-30", updatedAt: "2026-10-29T00:00:00Z", status: "verified", conditions: [{ id: "ptbv-low-1", label: "P/TBV 1차", direction: "lte", value: 100, note: "가상" }, { id: "ptbv-low-2", label: "P/TBV 2차", direction: "lte", value: 90, note: "가상" }, { id: "ptbv-low-3", label: "P/TBV 3차", direction: "lte", value: 80, note: "가상" }], note: "가상 1주" };
const quote: NativeQuote = { symbol: "TEST", exchange: "NYSE", currency: "USD", price: 90, marketTime, unit: "share" };
const rows = (patch: Partial<Parameters<typeof holdingValuationRows>[0]> = {}) => holdingValuationRows({ basis, price: 150, marketTime, now, instruments: [], ...patch });
const states = (row: ReturnType<typeof rows>[number]) => row.stages.map(s => s.state);
describe("평가방식별 독립 단계", () => {
  it("P/TBV와 역DCF를 합치지 않고 각각 1·2·3차 표시", () => {
    const result = rows();
    expect(result.map(r => r.label)).toEqual(["P/TBV", "역DCF"]);
    expect(states(result[0])).toEqual(["hit", "hit", "hit"]);
    expect(states(result[1])).toEqual(["waiting", "waiting", "waiting"]);
    expect(result[0].stages.map(s => s.label)).toEqual(["1차", "2차", "3차"]);
  });
  it("해외 P/TBV도 같은 세 단계, 실제 통화와 주당 시세로 경계 포함", () => {
    const result = rows({ basis: undefined, price: 999999, instruments: [instrument], quotes: { TEST: quote } });
    expect(states(result[0])).toEqual(["hit", "hit", "waiting"]);
    expect(states(result[1])).toEqual(["unregistered", "unregistered", "unregistered"]);
  });
  it("역DCF 매수·매도는 같은 방식 안에서 별도 단계로 유지", () => {
    const dcf = { ...instrument, conditions: [{ id: "dcf-1", label: "역DCF 1차", direction: "lte" as const, value: 95, note: "가상" }, { id: "dcf-high", label: "역DCF 고평가", direction: "gte" as const, value: 120, note: "가상" }] };
    const result = rows({ basis: undefined, instruments: [instrument, dcf], quotes: { TEST: quote } });
    expect(states(result[0])).toEqual(["hit", "hit", "waiting"]);
    expect(states(result[1])).toEqual(["hit", "unregistered", "unregistered"]);
    expect(result[1].sellStages.map(s => s.state)).toEqual(["waiting", "unregistered", "unregistered"]);
  });
  it("PER를 역DCF로 바꾸거나 없는 3차 가격선을 만들지 않음", () => {
    const per = { ...instrument, conditions: [{ id: "eps25", label: "정규화 TTM EPS ×25", direction: "lte" as const, value: 100, note: "가상" }, { id: "eps20", label: "정규화 TTM EPS ×20", direction: "lte" as const, value: 80, note: "가상" }] };
    const result = rows({ basis: undefined, instruments: [per], quotes: { TEST: quote } });
    expect(result.map(r => r.label)).toEqual(["P/TBV", "역DCF", "PER"]);
    expect(states(result[1])).toEqual(["unregistered", "unregistered", "unregistered"]);
    expect(states(result[2])).toEqual(["hit", "waiting", "unregistered"]);
  });
  it("버크셔의 독립 A/B 이름과 원래 기준을 유지", () => {
    const ab = { ...instrument, conditions: [{ id: "A", label: "A 실제 자사주 매입 평균가", direction: "lte" as const, value: 100, note: "가상" }, { id: "B", label: "B 공시 후 최저 P/TBV", direction: "lte" as const, value: 80, note: "가상" }] };
    const result = rows({ basis: undefined, instruments: [ab], quotes: { TEST: quote } });
    expect(result.find(r => r.label === "P/TBV")?.stages).toMatchObject([{ label: "B", state: "waiting" }]);
    expect(result.find(r => r.label === "자사주")?.stages).toMatchObject([{ label: "A", state: "hit" }]);
  });
  it("시세·통화 오류와 미검증은 미도달로 표시하지 않음", () => {
    expect(states(rows({ marketTime: undefined })[0])).toEqual(["unjudged", "unjudged", "unjudged"]);
    const result = rows({ basis: undefined, instruments: [instrument], quotes: { TEST: { ...quote, currency: "KRW" } } });
    expect(states(result[0])).toEqual(["unjudged", "unjudged", "unjudged"]);
    const pending = { ...instrument, status: "pending" as const, conditions: instrument.conditions.map(c => ({ ...c, value: null })) };
    expect(states(rows({ basis: undefined, instruments: [pending] })[0])).toEqual(["pending", "pending", "pending"]);
  });
});

describe("매도 단계 복원", () => {
  it("국내 매도 경계값 포함, 두 평가방식과 매수 조건은 독립", () => {
    const result = rows({ price: 300 });
    expect(states(result[0])).toEqual(["waiting", "waiting", "waiting"]);
    expect(states(result[1])).toEqual(["waiting", "waiting", "waiting"]);
    expect(result[0].sellStages.map(s => s.state)).toEqual(["waiting", "waiting", "unregistered"]);
    expect(result[1].sellStages.map(s => s.state)).toEqual(["hit", "hit", "unregistered"]);
  });
  it("매도만 있는 기준도 누락하지 않고 세 단계를 보존", () => {
    const sellOnly = { ...basis, methods: [{ ...basis.methods[0], down: [], up: [200, 300, 400] }] };
    const dcf = rows({ basis: sellOnly, price: 300 }).find(r => r.id === "DCF")!;
    expect(states(dcf)).toEqual(["unregistered", "unregistered", "unregistered"]);
    expect(dcf.sellStages.map(s => s.state)).toEqual(["hit", "hit", "waiting"]);
  });
  it("해외 gte 세 단계는 원래 통화로 비교, lte와 섞지 않음", () => {
    const both = { ...instrument, conditions: [...instrument.conditions, ...[100, 110, 120].map((value, i) => ({ id: `ptbv-high-${i + 1}`, label: `P/TBV 매도 ${i + 1}차`, direction: "gte" as const, value, note: "가상" }))] };
    const result = rows({ basis: undefined, instruments: [both], quotes: { TEST: { ...quote, price: 110 } } });
    expect(states(result[0])).toEqual(["waiting", "waiting", "waiting"]);
    expect(result[0].sellStages.map(s => s.state)).toEqual(["hit", "hit", "waiting"]);
    const wrongCurrency = rows({ basis: undefined, instruments: [both], quotes: { TEST: { ...quote, currency: "KRW" } } });
    expect(wrongCurrency[0].sellStages.map(s => s.state)).toEqual(["unjudged", "unjudged", "unjudged"]);
  });
  it("미검증·누락 시세를 매도 미도달로 표시하지 않음", () => {
    expect(rows({ marketTime: undefined })[1].sellStages.map(s => s.state)).toEqual(["unjudged", "unjudged", "unregistered"]);
    expect(rows({ basis: {} })[1].sellStages.map(s => s.state)).toEqual(["pending", "pending", "pending"]);
  });
});
