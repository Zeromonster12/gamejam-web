import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { passwordVersion, sessionSecretKey } from "./session-secret";

/**
 * Cookie „zapamätaného zariadenia“ (device cookie, odporúčanie OWASP proti zneužitiu zámku účtu).
 *
 * Prehliadač, z ktorého sa už organizátor úspešne prihlásil, dostane podpísané náhodné ID.
 * Brute-force zámok sa preň počíta podľa zariadenia, nie podľa IP – útočník za rovnakým NAT
 * (napr. školská sieť) tak zamkne iba seba, nie organizátorov. Cookie NIE JE prihlásenie:
 * stále treba heslo; bez úspešného prihlásenia sa nedá získať. Zmena hesla ju zneplatní (pwv).
 */

export const DEVICE_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEVICE_TOKEN_RE = /^v1\.([A-Za-z0-9_-]{22})\.(\d{13})\.([A-Za-z0-9_-]{43})$/;

export function deviceCookieName(): string {
  // rovnako ako session cookie: __Host- (Secure, Path=/, bez Domain); v `next dev` bez prefixu
  return process.env.NODE_ENV === "development" ? "gj_device_dev" : "__Host-gj_device";
}

function deviceMac(id: string, exp: string): string {
  // doménovo oddelené od JWT podpisu (iný formát vstupu aj prefix)
  return createHmac("sha256", sessionSecretKey())
    .update(`gamejam-device:v1:${id}.${exp}.${passwordVersion()}`)
    .digest("base64url");
}

export function signDeviceToken(): string {
  const id = randomBytes(16).toString("base64url");
  const exp = String(Date.now() + DEVICE_TTL_SECONDS * 1000);
  return `v1.${id}.${exp}.${deviceMac(id, exp)}`;
}

/** Vráti ID zariadenia z platnej cookie, inak null. Nikdy nehádže. */
export function readDeviceToken(token: string | undefined | null): string | null {
  const m = token ? DEVICE_TOKEN_RE.exec(token) : null;
  if (!m) return null;
  const [, id, exp, mac] = m;
  if (Number(exp) <= Date.now()) return null;
  try {
    const expected = Buffer.from(deviceMac(id, exp));
    const given = Buffer.from(mac);
    return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
  } catch {
    return null;
  }
}
