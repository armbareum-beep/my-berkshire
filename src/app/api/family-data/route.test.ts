import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/family/server", () => ({
  authorized: mocks.auth, database: mocks.db,
  json: (v: unknown, status = 200) => Response.json(v, { status }),
}));
import * as route from "./route";
describe("read-only family storage", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue(false); });
  it("does not query records without authentication", async () => {
    expect((await route.GET()).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("has no write handler, even for an authenticated viewer", () => {
    for (const method of ["PUT", "POST", "PATCH", "DELETE"]) expect(route).not.toHaveProperty(method);
  });
  it("returns only the family record and reports storage failures", async () => {
    mocks.auth.mockResolvedValue(true);
    const record = { data: { owners: [] }, revision: "version", updated_at: "2026-09-18" };
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: record, error: null }) };
    const from = vi.fn().mockReturnValue(query);
    mocks.db.mockReturnValue({ from });
    const result = await route.GET();
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual(record);
    expect(from).toHaveBeenCalledWith("family_vault");
    expect(query.eq).toHaveBeenCalledWith("id", "family");
    query.single.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect((await route.GET()).status).toBe(503);
  });
});
