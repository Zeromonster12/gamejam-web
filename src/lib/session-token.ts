import { createHash } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

/**
 * Podpisovanie a overovanie admin session tokenu (JWT HS256).
 * Bez `server-only`, aby ho mohol použiť aj `proxy.ts` (optimistická kontrola).
 * Autoritatívna kontrola je v `src/lib/auth.ts` (`verifySession`).
 */

export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const ISSUER = "gamejam-web";
const AUDIENCE = "gamejam-admin";
const DEV_SECRET = "dev-only-session-secret-change-me-0123456789";

export function sessionCookieName(): string {
  // __Host- prefix: iba Secure, Path=/, bez Domain → cookie sa nedá podvrhnúť zo subdomény.
  // V `next dev` (http na LAN IP, Safari) by Secure cookie neprešla → vývojové meno bez prefixu.
  return process.env.NODE_ENV === "development" ? "gj_admin_dev" : "__Host-gj_admin";
}

export function sessionCookieSecure(): boolean {
  return process.env.NODE_ENV !== "development";
}

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
function secretKey(): Uint8Array {
  const problem = sessionSecretProblem();
  if (problem) {
    // vývojový kľúč IBA v `next dev`; inde (produkcia, testy, iný NODE_ENV) chyba
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
 * existujúce sessions (stateless JWT sa inak nedá odvolať).
 */
function passwordVersion(): string {
  return createHash("sha256")
    .update(process.env.ADMIN_PASSWORD_HASH ?? "")
    .digest("base64url")
    .slice(0, 16);
}

export async function signSessionToken(): Promise<string> {
  // iat_ms: presný čas vydania (štandardné `iat` je v sekundách) – porovnáva sa s admin_state
  return new SignJWT({ pwv: passwordVersion(), iat_ms: Date.now() })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("admin")
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** true = podpis, platnosť a verzia hesla sedia. Nikdy nehádže. (Odvolanie cez DB rieši auth.ts.) */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  return (await readSessionToken(token)) !== null;
}

/** Overí token a vráti čas vydania v ms, inak null. Nikdy nehádže. */
export async function readSessionToken(token: string | undefined | null): Promise<{ issuedAtMs: number } | null> {
  if (!token || token.length > 2048) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
      subject: "admin",
      maxTokenAge: SESSION_TTL_SECONDS,
    });
    if (payload.pwv !== passwordVersion()) return null;
    const ms = typeof payload.iat_ms === "number" ? payload.iat_ms : (payload.iat ?? 0) * 1000;
    return { issuedAtMs: ms };
  } catch {
    return null;
  }
}
