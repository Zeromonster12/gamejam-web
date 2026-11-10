import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { clientIpFromHeaders, ipConfigFromEnv } from "./client-ip";

/** Hodnota použitá, keď IP nevieme zistiť (TRUST_PROXY vypnuté) – všetci zdieľajú jeden „bucket“. */
export const UNKNOWN_IP = "unknown";

/** Je IP klienta spoľahlivá (sme za dôveryhodnou proxy)? Logika v src/lib/client-ip.ts. */
export function trustProxy(): boolean {
  return ipConfigFromEnv().trustProxy;
}

export async function getClientIp(): Promise<string> {
  const cfg = ipConfigFromEnv();
  if (!cfg.trustProxy) return UNKNOWN_IP;
  const h = await headers();
  return clientIpFromHeaders((n) => h.get(n), cfg) ?? UNKNOWN_IP;
}

let warnedIpSecret = false;

function ipHashSecret(): string {
  const secret = process.env.IP_HASH_SECRET;
  if (secret && secret.length >= 16) return secret;
  // vývojový kľúč IBA v `next dev` – v produkcii, testoch aj pri nastavenom inom NODE_ENV chyba
  if (process.env.NODE_ENV !== "development") {
    throw new Error("IP_HASH_SECRET musí byť nastavené (aspoň 16 znakov).");
  }
  if (!warnedIpSecret) {
    warnedIpSecret = true;
    console.warn("[security] IP_HASH_SECRET nie je nastavené – používam vývojový kľúč (iba v next dev).");
  }
  return "dev-only-ip-hash-secret-do-not-use-in-prod";
}

/** HMAC-SHA256 IP adresy – do DB sa nikdy neukladá surová IP. */
export function hashIp(ip: string): string {
  return createHmac("sha256", ipHashSecret()).update(ip).digest("base64url");
}

export async function getClientIpHash(): Promise<{ ipHash: string; known: boolean }> {
  const ip = await getClientIp();
  return { ipHash: hashIp(ip), known: ip !== UNKNOWN_IP };
}

/**
 * Postgres chyba unique violation (23505) – prejde aj obalené chyby (DrizzleQueryError.cause).
 * `detail` je napr. „Key (lower(email))=(a@b.sk) already exists.“ (postgres.js aj PGlite).
 */
export function getUniqueViolation(err: unknown): { constraint?: string; detail?: string } | null {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const e = cur as { code?: unknown; constraint_name?: unknown; constraint?: unknown; detail?: unknown; cause?: unknown };
    if (e.code === "23505") {
      const c = e.constraint_name ?? e.constraint;
      return {
        constraint: typeof c === "string" ? c : undefined,
        detail: typeof e.detail === "string" ? e.detail : undefined,
      };
    }
    cur = e.cause;
  }
  return null;
}

/** Bezpečný kód chyby do logu (bez správy, ktorá môže obsahovať PII z parametrov). */
export function errorCode(err: unknown): string {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const e = cur as { code?: unknown; cause?: unknown; name?: unknown };
    if (typeof e.code === "string") return e.code;
    cur = e.cause;
  }
  return err instanceof Error ? err.name : "unknown";
}
