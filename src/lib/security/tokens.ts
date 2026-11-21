import { createHash, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

/**
 * Random, unguessable tokens for student tracking, resolution feedback and
 * emergency acknowledgement links. Only SHA-256 hashes are stored.
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Validates the shape of a token before it is hashed and looked up. */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

