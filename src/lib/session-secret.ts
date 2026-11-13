import { createHash } from "node:crypto";

/**
 * Kľúč pre podpisy admin session (JWT) a cookie zapamätaného zariadenia + verzia hesla.
 * Bez `server-only` a bez závislostí (používa ho proxy, server actions aj unit testy).
 */

const DEV_SECRET = "dev-only-session-secret-change-me-0123456789";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Vráti chybu konfigurácie SESSION_SECRET alebo null. */
export function sessionSecretProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  const s = env.SESSION_SECRET;
  if (!s) return "SESSION_SECRET nie je nastavené";
  if (s.length < 32) return "SESSION_SECRET musí mať aspoň 32 znakov";
  return null;
}

let warned = false;
/** Kľúč z SESSION_SECRET; vývojový kľúč IBA v `next dev`, inde (produkcia, testy, iný NODE_ENV) chyba. */
export function sessionSecretKey(): Uint8Array {
  const problem = sessionSecretProblem();
  if (problem) {
    if (process.env.NODE_ENV !== "development") throw new ConfigError(problem);
    if (!warned) {
      warned = true;
      console.warn(`[auth] ${problem} – používam vývojový kľúč (iba v next dev).`);
    }
    return new TextEncoder().encode(DEV_SECRET);
  }
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}

/**
 * Odtlačok aktuálneho hashu hesla – zmenou ADMIN_PASSWORD_HASH sa zneplatnia všetky
 * existujúce sessions aj zapamätané zariadenia (stateless tokeny sa inak nedajú odvolať).
 */
export function passwordVersion(): string {
  return createHash("sha256")
    .update(process.env.ADMIN_PASSWORD_HASH ?? "")
    .digest("base64url")
    .slice(0, 16);
}
