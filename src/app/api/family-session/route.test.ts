import { beforeEach, describe, expect, it, vi } from "vitest";
import { scryptSync } from "node:crypto";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), set: vi.fn(), remove: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set, delete: mocks.remove }) }));
vi.mock("@/lib/family/server", () => ({
  database: () => ({ rpc: mocks.rpc }),
  serverConfig: () => ({ password: process.env.TEST_FAMILY_HASH, secret: "test-only-session-secret-with-at-least-32-chars" }),
  sameOrigin: (r: Request) => r.headers.get("origin") === new URL(r.url).origin,
  json: (v: unknown, status = 200) => Response.json(v, { status }),
}));
import { DELETE, POST } from "./route";
const request = (password: string, origin = "https://example.test") => new Request("https://example.test/api/family-session", { method: "POST", headers: { origin }, body: JSON.stringify({ password }) });
describe("family login boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TEST_FAMILY_HASH = "salt:" + scryptSync("test-password", "salt", 64).toString("hex");
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });
  it("does not issue cookies for wrong passwords or cross-origin login", async () => {
    expect((await POST(request("wrong"))).status).toBe(401);
    expect((await POST(request("test-password", "https://attacker.test"))).status).toBe(403);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("fails closed when rate limited or when the rate-limit store is down", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect((await POST(request("test-password"))).status).toBe(429);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    expect((await POST(request("test-password"))).status).toBe(503);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("sets a private session cookie and removes it at logout", async () => {
    expect((await POST(request("test-password"))).status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith("family_session", expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: "strict", path: "/", maxAge: 604800 }));
    expect((await DELETE(request(""))).status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith("family_session");
  });
});
