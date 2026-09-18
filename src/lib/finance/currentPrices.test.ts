import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getKrwPrices, getPrices } from "./prices";

function quote(meta: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({ chart: { result: [{ meta: {
      regularMarketPrice: 100, previousClose: 95, currency: "KRW",
      instrumentType: "ETF", regularMarketTime: 1_800_000_000, ...meta,
    } }], error: null } }),
  };
}

describe("현재가 조회와 원화 환산", () => {
  beforeEach(() => vi.stubEnv("FINANCE_SOURCE", "yahoo"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("국내 거래소 후보 중 더 최근 시세를 선택한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes(".KQ")
      ? quote({ regularMarketPrice: 120, regularMarketTime: 1_800_000_001 })
      : quote()));
    const result = await getPrices(["069500"]);
    expect(result.prices).toEqual({ "069500": 120 });
    expect(result.instrumentTypes).toEqual({ "069500": "ETF" });
  });

  it.each([0, -10, NaN, Infinity, "100"])("유효하지 않은 가격 %s를 자산에 포함하지 않는다", async (price) => {
    vi.stubGlobal("fetch", vi.fn(async () => quote({ regularMarketPrice: price })));
    const result = await getPrices(["AAPL"]);
    expect(result.prices).toEqual({});
    expect(result.available).toBe(false);
  });

  it("거래 통화가 없는 해외 시세를 원화로 간주하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => quote({ currency: undefined })));
    expect((await getPrices(["AAPL"])).available).toBe(false);
  });

  it("잘못된 전일 종가로 등락률을 계산하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => quote({ previousClose: 0 })));
    const result = await getPrices(["069500"]);
    expect(result.prices["069500"]).toBe(100);
    expect(result.previousCloses).toEqual({});
  });

  it("종목 일부가 실패해도 성공한 시세는 보존한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("MISSING")) throw new DOMException("Timed out", "TimeoutError");
      return quote({ currency: "USD" });
    }));
    const result = await getPrices(["AAPL", "MISSING"]);
    expect(result.prices).toEqual({ AAPL: 100 });
    expect(result.available).toBe(true);
  });

  it("HTTP 또는 공급자 오류를 가격으로 사용하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("AAPL")
      ? { ok: false }
      : { ok: true, json: async () => ({ chart: {
        result: [{ meta: { regularMarketPrice: 100, currency: "USD" } }],
        error: { code: "Bad Symbol" },
      } }) }));
    expect((await getPrices(["AAPL", "MSFT"])).available).toBe(false);
  });

  it("주가와 전일 종가를 현재 환율로 원화 환산한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("KRW=X")
      ? quote({ regularMarketPrice: 1400 }) : quote({ currency: "USD" })));
    const result = await getKrwPrices(["AAPL"]);
    expect(result.prices).toEqual({ AAPL: 140_000 });
    expect(result.previousCloses).toEqual({ AAPL: 133_000 });
  });

  it("환율이 실패하면 원화 자산을 보존하고 환산 못한 해외 종목만 누락한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("KRW=X")) return quote({ regularMarketPrice: Infinity });
      return quote({ currency: url.includes("AAPL") ? "USD" : "KRW" });
    }));
    const mixed = await getKrwPrices(["069500", "AAPL"]);
    expect(mixed.prices).toEqual({ "069500": 100 });
    expect(mixed.available).toBe(true);
    expect(mixed.usdKrw).toBeNull();
    const overseas = await getKrwPrices(["AAPL"]);
    expect(overseas.prices).toEqual({});
    expect(overseas.available).toBe(false);
  });

  it("현재가와 환율 모두 대기 시간을 제한한다", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn(async () => quote());
    vi.stubGlobal("fetch", fetchMock);
    await getKrwPrices(["069500"]);
    expect(timeout).toHaveBeenCalledTimes(3); // KS, KQ, USD/KRW
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([20_000, 20_000, 10_000]);
    expect(fetchMock.mock.calls.length).toBe(3);
  });
});
