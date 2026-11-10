import "server-only";

import { scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  sessionCookieName,
  sessionCookieSecure,
  SESSION_TTL_SECONDS,
  readSessionToken,
  signSessionToken,
} from "./session-token";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminState } from "@/db/schema";

/* ------------------------------------------------------------------ */
/* Heslo: scrypt:N:r:p:saltB64:hashB64 (formát scripts/hash-password.mjs; akceptuje aj $) */
/* ------------------------------------------------------------------ */

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

type ParsedHash = { N: number; r: number; p: number; salt: Buffer; hash: Buffer };

export function parsePasswordHash(stored: string | undefined): ParsedHash | null {
  if (!stored) return null;
  const parts = stored.trim().split(/[:$]/);
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [N, r, p] = parts.slice(1, 4).map((x) => Number(x));
  if (![N, r, p].every((x) => Number.isInteger(x) && x > 0)) return null;
  // rozumné limity (obrana proti preklepu, ktorý by zahltil CPU/RAM)
  if (N < 2 ** 14 || N > 2 ** 20 || (N & (N - 1)) !== 0 || r > 32 || p > 16) return null;
  const salt = Buffer.from(parts[4], "base64");
  const hash = Buffer.from(parts[5], "base64");
  if (salt.length < 16 || hash.length < 32) return null;
  return { N, r, p, salt, hash };
}

/** Je admin login zapnutý? Bez platného ADMIN_PASSWORD_HASH je prihlásenie úplne vypnuté. */
export function adminPasswordConfigured(): boolean {
  return parsePasswordHash(process.env.ADMIN_PASSWORD_HASH) !== null;
}

/**
 * Semafor na súbežné scrypt výpočty (každý ~32 MiB RAM a desiatky ms CPU).
 * Pri preťažení sa nečaká – volajúci vráti generickú chybu.
 */
const MAX_CONCURRENT_SCRYPT = 3;
let activeScrypt = 0;

/**
 * Overí heslo proti ADMIN_PASSWORD_HASH (porovnanie v konštantnom čase).
 * `busy` = semafor je plný, heslo sa neoverovalo.
 */
export async function verifyAdminPassword(password: string): Promise<{ ok: boolean; busy?: boolean }> {
  const parsed = parsePasswordHash(process.env.ADMIN_PASSWORD_HASH);
  if (!parsed) return { ok: false };
  if (activeScrypt >= MAX_CONCURRENT_SCRYPT) return { ok: false, busy: true };
  activeScrypt++;
  try {
    const derived = await scrypt(password.normalize("NFKC"), parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: 256 * parsed.N * parsed.r * parsed.p,
    });
    return { ok: derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash) };
  } finally {
    activeScrypt--;
  }
}

/* ------------------------------------------------------------------ */
/* Session cookie                                                      */
/* ------------------------------------------------------------------ */

export async function createSession(): Promise<void> {
  const token = await signSessionToken();
  const store = await cookies();
  store.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: sessionCookieSecure(),
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession(): Promise<void> {
  const store = await cookies();
  store.set(sessionCookieName(), "", {
    httpOnly: true,
    secure: sessionCookieSecure(),
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Je požiadavka prihlásená? (bez presmerovania – pre route handlery)
 * Okrem podpisu/platnosti tokenu overí aj odvolanie: tokeny vydané pred
 * `admin_state.sessions_valid_after` (nastavuje logout) sú neplatné. Chyba DB → neprihlásený.
 */
export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const token = await readSessionToken(store.get(sessionCookieName())?.value);
  if (!token) return false;
  try {
    const validAfter = await sessionsValidAfter();
    return token.issuedAtMs > validAfter.getTime();
  } catch {
    return false;
  }
}

async function sessionsValidAfter(): Promise<Date> {
  const db = await getDb();
  const [row] = await db
    .select({ t: adminState.sessionsValidAfter })
    .from(adminState)
    .where(eq(adminState.id, 1));
  return row?.t ?? new Date(0);
}

/** Odvolá všetky doteraz vydané admin sessions (logout). */
export async function revokeAllSessions(): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .insert(adminState)
    .values({ id: 1, sessionsValidAfter: now })
    .onConflictDoUpdate({ target: adminState.id, set: { sessionsValidAfter: now } });
}

/**
 * DAL: overí admin session na serveri, inak presmeruje na prihlásenie.
 * Volať v KAŽDEJ admin stránke a server action (proxy je len optimistická kontrola).
 */
export const verifySession = cache(async (): Promise<{ isAuth: true; role: "admin" }> => {
  if (!(await isAuthenticated())) redirect("/admin/login");
  return { isAuth: true, role: "admin" };
});
