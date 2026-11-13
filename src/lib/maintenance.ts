import "server-only";

import { and, count, countDistinct, desc, eq, gte, inArray, lt, ne, notInArray } from "drizzle-orm";
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

/**
 * Neúspešné prihlásenia vyvolá aj anonym – evidujú sa oddelene od akcií organizátorov,
 * aby ich záplava nevytlačila z prehľadu prihlásenia, exporty či wipe (a po 30 dňoch sa mažú).
 */
export const LOGIN_FAILURE_ACTIONS: AuditAction[] = ["login_fail", "login_fail_locked"];

/** Zapíše audit záznam. Nikdy nehádže (audit nesmie zablokovať samotnú akciu). */
export async function audit(action: AuditAction, ipHash: string, db?: Pick<Db, "insert">): Promise<void> {
  try {
    await (db ?? (await getDb())).insert(adminAudit).values({ action, ipHash });
  } catch (err) {
    console.error(`[audit] write failed code=${errorCode(err)}`);
  }
}

/**
 * Audit záznam najviac raz za `windowMs` pre tú istú akciu a zariadenie – pre udalosti, ktoré môže
 * anonym opakovať ľubovoľne často (zamknuté pokusy, neúspechy v zdieľanom „unknown“ buckete).
 * Úplný počet pokusov je v `login_attempts` (súhrn v admine). Nikdy nehádže.
 */
export async function auditOncePer(action: AuditAction, ipHash: string, windowMs: number): Promise<void> {
  try {
    const db = await getDb();
    const [recent] = await db
      .select({ id: adminAudit.id })
      .from(adminAudit)
      .where(and(eq(adminAudit.action, action), eq(adminAudit.ipHash, ipHash), gte(adminAudit.createdAt, new Date(Date.now() - windowMs))))
      .limit(1);
    if (!recent) await db.insert(adminAudit).values({ action, ipHash });
  } catch (err) {
    console.error(`[audit] write failed code=${errorCode(err)}`);
  }
}

export type AuditEntry = { id: string; action: string; label: string; ip: string; createdAt: Date };

function toEntry(r: { id: string; action: string; ipHash: string; createdAt: Date }): AuditEntry {
  return {
    id: r.id,
    action: r.action,
    label: AUDIT_ACTIONS[r.action as AuditAction] ?? r.action,
    // len krátky odtlačok HMAC – stačí na rozlíšenie „to isté zariadenie / iné“
    ip: r.ipHash === PURGED ? "—" : r.ipHash.slice(0, 8),
    createdAt: r.createdAt,
  };
}

const auditColumns = { id: adminAudit.id, action: adminAudit.action, ipHash: adminAudit.ipHash, createdAt: adminAudit.createdAt };

export type AuditOverview = {
  /** akcie organizátorov (prihlásenia, exporty, zmeny, wipe) – neúspechy ich nevytlačia */
  actions: AuditEntry[];
  /** posledné neúspešné / zablokované prihlásenia */
  failures: AuditEntry[];
  /** súhrn z login_attempts za 24 h (presný počet, aj keď sa audit deduplikuje) */
  failedLast24h: { attempts: number; sources: number };
};

/** Audit pre admin prehľad (volá ho len admin stránka po overení session). */
export async function auditOverview(actionsLimit = 30, failuresLimit = 20): Promise<AuditOverview> {
  const db = await getDb();
  const since = new Date(Date.now() - DAY);
  const [actions, failures, [stats]] = await Promise.all([
    db
      .select(auditColumns)
      .from(adminAudit)
      .where(notInArray(adminAudit.action, LOGIN_FAILURE_ACTIONS))
      .orderBy(desc(adminAudit.createdAt))
      .limit(actionsLimit),
    db
      .select(auditColumns)
      .from(adminAudit)
      .where(inArray(adminAudit.action, LOGIN_FAILURE_ACTIONS))
      .orderBy(desc(adminAudit.createdAt))
      .limit(failuresLimit),
    db
      .select({ attempts: count(), sources: countDistinct(loginAttempts.ipHash) })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.success, false), gte(loginAttempts.createdAt, since))),
  ]);
  return {
    actions: actions.map(toEntry),
    failures: failures.map(toEntry),
    failedLast24h: { attempts: Number(stats?.attempts ?? 0), sources: Number(stats?.sources ?? 0) },
  };
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
    // neúspešné prihlásenia (môže ich vyvolať anonym) sa po 30 dňoch mažú → tabuľka nerastie donekonečna;
    // akcie organizátorov ostávajú (bez osobných údajov, ipHash sa anonymizuje)
    await db
      .delete(adminAudit)
      .where(and(inArray(adminAudit.action, LOGIN_FAILURE_ACTIONS), lt(adminAudit.createdAt, ipCutoff)));
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
