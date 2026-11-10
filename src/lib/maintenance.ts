import "server-only";

import { and, desc, lt, ne } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { adminAudit, loginAttempts, registrationAttempts, registrations } from "@/db/schema";
import { errorCode } from "./security";

/* ------------------------------------------------------------------ */
/* Audit log admin akcií – bez osobných údajov                         */
/* ------------------------------------------------------------------ */

export const AUDIT_ACTIONS = {
  login_ok: "Prihlásenie",
  login_fail: "Zlé heslo",
  login_fail_locked: "Prihlásenie zablokované (priveľa pokusov)",
  logout: "Odhlásenie (všetky sessions zneplatnené)",
  export: "Export CSV – hráči",
  export_diet: "Export CSV – strava/alergie",
  assign: "Presun / priradenie hráča",
  create_team: "Nový tím z hráčov",
  set_leader: "Zmena kapitána",
  rename_team: "Premenovanie tímu",
  update_notes: "Poznámka k tímu",
  delete_participant: "Zmazanie hráča",
  delete_team: "Zmazanie tímu",
  wipe: "Vymazanie všetkých dát",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** Zapíše audit záznam. Nikdy nehádže (audit nesmie zablokovať samotnú akciu). */
export async function audit(action: AuditAction, ipHash: string, db?: Pick<Db, "insert">): Promise<void> {
  try {
    await (db ?? (await getDb())).insert(adminAudit).values({ action, ipHash });
  } catch (err) {
    console.error(`[audit] write failed code=${errorCode(err)}`);
  }
}

export type AuditEntry = { id: string; action: string; label: string; ip: string; createdAt: Date };

/** Posledné záznamy auditu (volá ho len admin stránka po overení session). */
export async function recentAudit(limit = 30): Promise<AuditEntry[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: adminAudit.id, action: adminAudit.action, ipHash: adminAudit.ipHash, createdAt: adminAudit.createdAt })
    .from(adminAudit)
    .orderBy(desc(adminAudit.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    label: AUDIT_ACTIONS[r.action as AuditAction] ?? r.action,
    // len krátky odtlačok HMAC – stačí na rozlíšenie „to isté zariadenie / iné“
    ip: r.ipHash === PURGED ? "—" : r.ipHash.slice(0, 8),
    createdAt: r.createdAt,
  }));
}

/* ------------------------------------------------------------------ */
/* Uchovávanie údajov (GDPR minimalizácia)                             */
/* ------------------------------------------------------------------ */

export const PURGED = "purged";
const DAY = 24 * 60 * 60 * 1000;
/** ipHash v registráciách/audite potrebujeme len na rate limit (1 h) a krátky audit → 30 dní. */
const IP_HASH_RETENTION_MS = 30 * DAY;
/** Pokusy (login, registrácia) sa používajú len v oknách 15 min / 1 h. */
const ATTEMPTS_RETENTION_MS = DAY;
const THROTTLE_MS = 10 * 60 * 1000;

const g = globalThis as unknown as { __gamejamHousekeepingAt?: number };

/**
 * Upratovanie: anonymizuje staré ipHash (→ "purged") a maže staré pokusy.
 * Volá sa pri registrácii a načítaní adminu; v rámci procesu najviac raz za 10 minút.
 */
export async function housekeeping(force = false): Promise<void> {
  const now = Date.now();
  if (!force && g.__gamejamHousekeepingAt && now - g.__gamejamHousekeepingAt < THROTTLE_MS) return;
  g.__gamejamHousekeepingAt = now;
  try {
    const db = await getDb();
    const ipCutoff = new Date(now - IP_HASH_RETENTION_MS);
    const attemptsCutoff = new Date(now - ATTEMPTS_RETENTION_MS);
    await db
      .update(registrations)
      .set({ ipHash: PURGED })
      .where(and(lt(registrations.createdAt, ipCutoff), ne(registrations.ipHash, PURGED)));
    await db
      .update(adminAudit)
      .set({ ipHash: PURGED })
      .where(and(lt(adminAudit.createdAt, ipCutoff), ne(adminAudit.ipHash, PURGED)));
    await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, attemptsCutoff));
    await db.delete(registrationAttempts).where(lt(registrationAttempts.createdAt, attemptsCutoff));
  } catch (err) {
    g.__gamejamHousekeepingAt = undefined;
    console.error(`[housekeeping] failed code=${errorCode(err)}`);
  }
}
