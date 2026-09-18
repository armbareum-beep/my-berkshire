import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "family_session";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
function equal(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function verifyPassword(password: unknown, encoded: string): boolean {
  if (typeof password !== "string" || password.length > 128) return false;
  const [salt, hash] = encoded.split(":");
  if (!salt || !/^[a-f0-9]{128}$/.test(hash || "")) return false;
  return equal(scryptSync(password, salt, 64).toString("hex"), hash);
}
export function createSession(secret: string, now = Date.now()): string {
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(24).toString("hex")}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}
export function verifySession(token: string | undefined, secret: string, now = Date.now()): boolean {
  if (!token || secret.length < 32) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{48}$/.test(parts[1])) return false;
  const expires = Number(parts[0]), time = Math.floor(now / 1000);
  if (expires <= time || expires > time + SESSION_SECONDS) return false;
  return equal(parts[2], createHmac("sha256", secret).update(parts.slice(0, 2).join(".")).digest("hex"));
}
export function rateKey(ip: string, secret: string) {
  return createHmac("sha256", secret).update(ip).digest("hex");
}
