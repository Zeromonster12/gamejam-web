import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Podpísaný časový token formulára (náhrada za `startedAt` od klienta).
 *
 * Server ho vydá pri renderi formulára: `v1.<ts>.<HMAC-SHA256(secret, "form:v1:" + ts)>` (base64url).
 * Pri odoslaní overí podpis a vek tokenu (3 s – 24 h). Klient čas nevie podvrhnúť.
 * Kľúč: FORM_TOKEN_SECRET, inak IP_HASH_SECRET (s vlastným prefixom – oddelené použitie).
 */

export const FORM_TOKEN_MIN_AGE_MS = 3_000;
export const FORM_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Tolerancia, keby hodiny inštancií (serverless) neboli úplne zosynchronizované. */
const FUTURE_SKEW_MS = 5_000;

const DEV_SECRET = "dev-only-form-token-secret-0123456789";
let warned = false;

function secret(): string {
  const s = process.env.FORM_TOKEN_SECRET || process.env.IP_HASH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV !== "development") {
    throw new Error("FORM_TOKEN_SECRET alebo IP_HASH_SECRET musí byť nastavené (aspoň 16 znakov).");
  }
  if (!warned) {
    warned = true;
    console.warn("[form-token] FORM_TOKEN_SECRET/IP_HASH_SECRET chýba – vývojový kľúč (iba v next dev).");
  }
  return DEV_SECRET;
}

function sign(ts: string): string {
  return createHmac("sha256", secret()).update(`form:v1:${ts}`).digest("base64url");
}

export function issueFormToken(now = Date.now()): string {
  const ts = String(now);
  return `v1.${ts}.${sign(ts)}`;
}

export type FormTokenCheck = "ok" | "invalid" | "too-fast" | "expired";

export function checkFormToken(token: unknown, now = Date.now()): FormTokenCheck {
  if (typeof token !== "string" || token.length > 200) return "invalid";
  const m = /^v1\.(\d{10,16})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return "invalid";
  const expected = Buffer.from(sign(m[1]));
  const given = Buffer.from(m[2]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  const age = now - Number(m[1]);
  if (age < -FUTURE_SKEW_MS) return "invalid";
  if (age < FORM_TOKEN_MIN_AGE_MS) return "too-fast";
  if (age > FORM_TOKEN_MAX_AGE_MS) return "expired";
  return "ok";
}
