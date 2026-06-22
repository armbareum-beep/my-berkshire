import { describe, it, expect } from "vitest";
import { normalizeTossPrices, normalizeTossRate, normalizeTossCandles } from "./normalize";

describe("normalizeTossPrices", () => {
  it("배치 result[] 를 {symbol:{price,currency}} 로", () => {
    const out = normalizeTossPrices({
      result: [
        { symbol: "005930", lastPrice: "355000", currency: "KRW" },
        { symbol: "AAPL", lastPrice: "296.9988", currency: "USD" },
      ],
    });
    expect(out["005930"]).toEqual({ price: 355000, currency: "KRW" });
    expect(out["AAPL"]).toEqual({ price: 296.9988, currency: "USD" });
  });
  it("가격 0/결측은 제외", () => {
    expect(normalizeTossPrices({ result: [{ symbol: "X", lastPrice: "0", currency: "KRW" }] })).toEqual({});
    expect(normalizeTossPrices({})).toEqual({});
  });
});

describe("normalizeTossRate", () => {
  it("rate 문자열을 숫자로", () => {
    expect(normalizeTossRate({ result: { rate: "1539.45", baseCurrency: "USD", quoteCurrency: "KRW" } })).toBe(1539.45);
  });
  it("없으면 null", () => {
    expect(normalizeTossRate({})).toBeNull();
  });
});

describe("normalizeTossCandles", () => {
  it("candles[] 를 일별 봉으로", () => {
    const bars = normalizeTossCandles({
      result: {
        candles: [
          { timestamp: "2026-06-22T00:00:00.000+09:00", openPrice: "351000", highPrice: "363000", lowPrice: "342000", closePrice: "354500", volume: "44974586", currency: "KRW" },
        ],
      },
    });
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ date: "2026-06-22", close: 354500, open: 351000, currency: "KRW" });
  });
});
