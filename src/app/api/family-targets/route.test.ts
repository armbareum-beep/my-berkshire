import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPortfolio } from "@/lib/family/model";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn(), origin: vi.fn() }));
vi.mock("@/lib/family/server", () => ({
  authorized: mocks.auth, database: mocks.db, sameOrigin: mocks.origin,
  json: (v: unknown, status = 200) => Response.json(v, { status }),
}));
import * as route from "./route";
const request = (body: unknown) => new Request("https://family.test/api/family-targets", { method: "POST", body: JSON.stringify(body) });
function storage(revision = "r1", updated = [{ revision: "r2" }]) {
  const data = { ...emptyPortfolio(), asOf: "2025-01-01" };
  const read = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { data, revision }, error: null }) };
  const write = { eq: vi.fn().mockReturnThis(), select: vi.fn().mockResolvedValue({ data: updated, error: null }) };
  const table = { ...read, update: vi.fn().mockReturnValue(write) };
  mocks.db.mockReturnValue({ from: vi.fn().mockReturnValue(table) });
  return { table, write };
}
describe("target weights", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue(true); mocks.origin.mockReturnValue(true); });
  it("rejects cross-origin and signed-out requests before storage", async () => {
    mocks.origin.mockReturnValue(false);
    expect((await route.POST(request({ targets: [25, 25, 25, 25], revision: "r1" }))).status).toBe(403);
    mocks.origin.mockReturnValue(true); mocks.auth.mockResolvedValue(false);
    expect((await route.POST(request({ targets: [25, 25, 25, 25], revision: "r1" }))).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("requires four weights summing to 100", async () => {
    expect((await route.POST(request({ targets: [50, 50, 10, 0], revision: "r1" }))).status).toBe(400);
    expect((await route.POST(request({ targets: [100, 0, 0], revision: "r1" }))).status).toBe(400);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("updates only the targets, guarded by the revision", async () => {
    const { table, write } = storage();
    const result = await route.POST(request({ targets: [40, 10, 30, 20], revision: "r1" }));
    expect(result.status).toBe(200);
    const saved = table.update.mock.calls[0][0];
    expect(saved.data.targets).toEqual([40, 10, 30, 20]);
    expect(saved.data.targetsBasis).toBe("nav");
    expect(saved.data.accounts).toEqual([]);
    expect(write.eq).toHaveBeenCalledWith("revision", "r1");
    expect((await result.json()).revision).toBe(saved.revision);
  });
  it("refuses to overwrite a newer version", async () => {
    storage("r9");
    expect((await route.POST(request({ targets: [40, 10, 30, 20], revision: "r1" }))).status).toBe(409);
    storage("r1", []);
    expect((await route.POST(request({ targets: [40, 10, 30, 20], revision: "r1" }))).status).toBe(409);
  });
});
