import { jwtVerify, SignJWT } from "jose";
import { passwordVersion, sessionSecretKey } from "./session-secret";

export { ConfigError, sessionSecretProblem } from "./session-secret";

/**
 * Podpisovanie a overovanie admin session tokenu (JWT HS256).
 * Bez `server-only`, aby ho mohol použiť aj `proxy.ts` (optimistická kontrola).
 * Autoritatívna kontrola je v `src/lib/auth.ts` (`verifySession`).
 */

export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const ISSUER = "gamejam-web";
const AUDIENCE = "gamejam-admin";

export function sessionCookieName(): string {
  // __Host- prefix: iba Secure, Path=/, bez Domain → cookie sa nedá podvrhnúť zo subdomény.
  // V `next dev` (http na LAN IP, Safari) by Secure cookie neprešla → vývojové meno bez prefixu.
  return process.env.NODE_ENV === "development" ? "gj_admin_dev" : "__Host-gj_admin";
}

export function sessionCookieSecure(): boolean {
  return process.env.NODE_ENV !== "development";
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
    .sign(sessionSecretKey());
}

/** true = podpis, platnosť a verzia hesla sedia. Nikdy nehádže. (Odvolanie cez DB rieši auth.ts.) */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  return (await readSessionToken(token)) !== null;
}

/** Overí token a vráti čas vydania v ms, inak null. Nikdy nehádže. */
export async function readSessionToken(token: string | undefined | null): Promise<{ issuedAtMs: number } | null> {
  if (!token || token.length > 2048) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecretKey(), {
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
