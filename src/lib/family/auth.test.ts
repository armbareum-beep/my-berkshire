import { describe, expect, it } from "vitest";
import { scryptSync } from "node:crypto";
import { createSession, SESSION_SECONDS, verifyPassword, verifySession } from "./auth";

describe("family authentication", () => {
  const secret = "test-only-random-secret-for-family-session-check";
  it("checks a salted password without accepting missing or malformed values", () => {
    const hash = "test-salt:" + scryptSync("synthetic-password", "test-salt", 64).toString("hex");
    expect(verifyPassword("synthetic-password", hash)).toBe(true);
    for (const wrong of ["wrong", "", null, {}, "x".repeat(129)]) expect(verifyPassword(wrong, hash)).toBe(false);
    expect(verifyPassword("synthetic-password", "")).toBe(false);
  });
  it("rejects forged, expired and revoked sessions", () => {
    const now = 1700000000000;
    const token = createSession(secret, now);
    expect(verifySession(token, secret, now)).toBe(true);
    expect(verifySession(token, secret, now + SESSION_SECONDS * 1000)).toBe(false);
    expect(verifySession(token + "0", secret, now)).toBe(false);
    expect(verifySession(token, secret + "rotated", now)).toBe(false);
    expect(verifySession(undefined, secret, now)).toBe(false);
    expect(verifySession(token, "", now)).toBe(false);
    const parts = token.split("."); parts[0] = String(Number(parts[0]) + 86400);
    expect(verifySession(parts.join("."), secret, now)).toBe(false);
  });
});
