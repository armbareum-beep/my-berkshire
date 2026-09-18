import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPortfolio } from "@/lib/family/model";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/family/server", () => ({
  authorized: mocks.auth, database: mocks.db,
  sameOrigin: (r: Request) => r.headers.get("origin") === new URL(r.url).origin,
  json: (v: unknown, status = 200) => Response.json(v, { status }),
}));
import { GET, PUT } from "./route";
const origin = "https://example.test";
const request = (body: unknown, from = origin) => new Request(origin + "/api/family-data", { method: "PUT", headers: { origin: from }, body: JSON.stringify(body) });
describe("private family storage", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue(false); });
  it("does not query records without authentication", async () => {
    expect((await GET()).status).toBe(401);
    expect((await PUT(request({}))).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects foreign-origin writes even with a valid session", async () => {
    mocks.auth.mockResolvedValue(true);
    expect((await PUT(request({}, "https://attacker.test"))).status).toBe(403);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("requires the current revision and refuses conflicting saves", async () => {
    mocks.auth.mockResolvedValue(true);
    const query = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    mocks.db.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    const revision = "11111111-1111-4111-8111-111111111111";
    expect((await PUT(request({ data: emptyPortfolio(), revision }))).status).toBe(409);
    expect(query.eq).toHaveBeenCalledWith("revision", revision);
    expect(query.eq).toHaveBeenCalledWith("id", "family");
  });
  it("returns success only after storage acknowledges the write", async () => {
    mocks.auth.mockResolvedValue(true);
    const query = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockResolvedValue({ data: [{ revision: "new" }], error: null }) };
    mocks.db.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    expect((await PUT(request({ data: emptyPortfolio(), revision: "11111111-1111-4111-8111-111111111111" }))).status).toBe(200);
    query.select.mockResolvedValue({ data: [], error: { message: "unavailable" } });
    expect((await PUT(request({ data: emptyPortfolio(), revision: "11111111-1111-4111-8111-111111111111" }))).status).toBe(503);
  });
});
