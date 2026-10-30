import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), origin: vi.fn(), prices: vi.fn(), benchmark: vi.fn() }));
vi.mock("@/lib/family/server", () => ({ authorized: mocks.auth, sameOrigin: mocks.origin, json: (v: unknown, status = 200) => Response.json(v, { status }) }));
vi.mock("@/lib/family/quotes", () => ({ getFamilyPrices: mocks.prices, getBenchmarkQuotes: mocks.benchmark }));
import { POST } from "./route";
const request = (body: unknown) => new Request("https://family.test/api/family-quotes", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue(true); mocks.origin.mockReturnValue(true); });
describe("감시 원시 시세 API", () => {
  it("비교 ETF 단독 조회는 보유종목 시세를 기다리지 않음", async () => {
    mocks.prices.mockResolvedValue({ prices: {}, marketTimes: {}, rawQuotes: {} });
    mocks.benchmark.mockResolvedValue({ "379800": { start: "2025-12-31", asOf: "2026-10-30", return: .15 } });
    const response = await POST(request({ symbols: [], benchmarks: { ids: ["379800"], since: "2026-09-17", start: "2025-12-31" } }));
    expect(response.status).toBe(200);
    expect(mocks.prices).toHaveBeenCalledWith([]);
    expect(await response.json()).toMatchObject({ missing: [], benchmarkQuotes: { "379800": { asOf: "2026-10-30" } } });
    expect((await POST(request({ symbols: [] }))).status).toBe(400);
  });
  it("보유종목 시세 누락에도 비교 ETF는 연초부터 독립해서 반환", async () => {
    mocks.prices.mockResolvedValue({ prices: {}, marketTimes: {}, rawQuotes: {} });
    mocks.benchmark.mockResolvedValue({ "379800": { start: "2025-12-31", asOf: "2026-10-30", return: .15, currency: "KRW" } });
    const response = await POST(request({ symbols: ["META"], benchmarks: { ids: ["379800"], since: "2026-09-17", start: "2025-12-31" } }));
    expect(mocks.benchmark).toHaveBeenCalledWith(["379800"], "2025-12-31");
    expect(await response.json()).toMatchObject({ missing: ["META"], benchmarkQuotes: { "379800": { return: .15, asOf: "2026-10-30" } } });
  });
  it("인증·동일 출처 제한 유지", async () => {
    mocks.origin.mockReturnValue(false);
    expect((await POST(request({ symbols: ["BRK-B"] }))).status).toBe(403);
    mocks.origin.mockReturnValue(true); mocks.auth.mockResolvedValue(false);
    expect((await POST(request({ symbols: ["BRK-B"] }))).status).toBe(401);
    expect(mocks.prices).not.toHaveBeenCalled();
  });
  it("미보유 감시 조회는 잔고 시세 누락 판정과 분리, 원시 시세 보존", async () => {
    const raw = { "BRK-B": { price: 100, currency: "USD", symbol: "BRK-B", exchange: "NYSE", marketTime: 123, unit: "share" } };
    mocks.prices.mockResolvedValue({ prices: { "BRK-B": 130000 }, marketTimes: { "BRK-B": 123 }, rawQuotes: raw });
    const response = await POST(request({ symbols: ["BRK-B"], watchSymbols: ["BRK-B", "FFH.TO"] }));
    expect(mocks.prices).toHaveBeenCalledWith(["BRK-B", "FFH.TO"]);
    expect(await response.json()).toMatchObject({ prices: { "BRK-B": 130000 }, rawQuotes: raw, missing: [] });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("잘못된/과도한 감시 요청과 공급자 오류 거부", async () => {
    for (const watchSymbols of [["bad/symbol"], "BRK-B", Array(51).fill("TEST")]) expect((await POST(request({ symbols: ["BRK-B"], watchSymbols }))).status).toBe(400);
    mocks.prices.mockRejectedValue(new Error("provider failure"));
    expect((await POST(request({ symbols: ["BRK-B"] }))).status).toBe(502);
  });
});
