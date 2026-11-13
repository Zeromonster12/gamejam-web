"use server";

import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, type Db } from "@/db";
import { after } from "next/server";
import { loginAttempts, participants, registrationAttempts, registrations, teams } from "@/db/schema";
import {
  adminPasswordConfigured,
  createSession,
  deleteSession,
  isAuthenticated,
  revokeAllSessions,
  verifyAdminPassword,
  verifySession,
} from "@/lib/auth";
import { audit, auditOncePer, housekeeping, type AuditAction } from "@/lib/maintenance";
import { EVENT } from "@/lib/event";
import { errorCode, getClientIpHash, getUniqueViolation, hashIp } from "@/lib/security";
import { DEVICE_TTL_SECONDS, deviceCookieName, readDeviceToken, signDeviceToken } from "@/lib/device-token";
import { sessionCookieSecure } from "@/lib/session-token";

/** Výsledok admin akcií pre useActionState. */
export type AdminActionState = { ok: boolean; message: string } | null;

const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
/** Globálny strop neúspechov (všetky IP) – nad ním sa prihlasovanie spomalí pre všetkých (nie zámok). */
const GLOBAL_FAILURE_SOFT_CAP = 50;
const MAX_DELAY_S = 30;
/**
 * Počty sa rátajú len po hodnotu, ktorú brzda potrebuje (oneskorenie je od n≈10 / g≈190 už maximálne) –
 * cena kontroly tak nerastie s tým, koľko pokusov útočník nahromadí.
 */
const BUCKET_COUNT_CAP = 50;
const GLOBAL_COUNT_CAP = 200;
/**
 * Strop riadkov za okno pre jeden bucket: zdieľaný „unknown“ bucket sa nikdy nezamyká, takže bez
 * stropu by každá požiadavka pridala riadok. Nad stropom je oneskorenie už maximálne → nevkladáme.
 */
const BUCKET_ROW_CAP = BUCKET_COUNT_CAP;
/** Zamknuté pokusy a neúspechy v nespoľahlivom buckete sa do auditu zapíšu najviac raz za okno. */
const UNKNOWN_FAIL_AUDIT_WINDOW_MS = 60 * 1000;
const MSG_LOGIN_FAILED = "Prihlásenie zlyhalo. Skontroluj heslo, prípadne to skús znova o 15 minút.";
const MSG_LOGIN_BUSY = "Server je práve vyťažený. Skús sa prihlásiť o chvíľu.";
const MSG_LOGIN_DISABLED = "Prihlásenie do adminu je vypnuté (nie je nastavené ADMIN_PASSWORD_HASH).";

const uuid = z.uuid({ error: "Neplatný identifikátor" });
const noControlChars = (v: string) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Brzda prihlasovania (v sekundách) alebo "locked". Bucket = zapamätané zariadenie (device cookie),
 * inak IP klienta.
 *  - spoľahlivý bucket: tvrdý zámok po 5 neúspechoch / 15 min,
 *  - nespoľahlivá IP (bucket „unknown“ = všetci spolu): žiadny zámok (útočník by inak zamkol
 *    aj organizátorov), ale progresívne oneskorenie 2^(n-5) s, max 30 s,
 *  - globálne > 50 neúspechov / 15 min: oneskorenie pre všetkých.
 */
export type LoginGate = { locked: true } | { locked: false; delayS: number };

function loginGate(failuresForIp: number, failuresGlobal: number, ipKnown: boolean): LoginGate {
  if (ipKnown && failuresForIp >= LOGIN_MAX_FAILURES) return { locked: true };
  let delay = 0;
  if (!ipKnown && failuresForIp >= LOGIN_MAX_FAILURES) delay = 2 ** (failuresForIp - LOGIN_MAX_FAILURES);
  if (failuresGlobal >= GLOBAL_FAILURE_SOFT_CAP) delay = Math.max(delay, 2 + (failuresGlobal - GLOBAL_FAILURE_SOFT_CAP) / 5);
  return { locked: false, delayS: Math.min(MAX_DELAY_S, delay) };
}

/* ------------------------------------------------------------------ */
/* Prihlásenie / odhlásenie                                           */
/* ------------------------------------------------------------------ */

export async function loginAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  if (!adminPasswordConfigured()) {
    console.error("[admin] ADMIN_PASSWORD_HASH nie je nastavené alebo má zlý formát – login vypnutý");
    return { ok: false, message: MSG_LOGIN_DISABLED };
  }
  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0 || password.length > 256) {
    return { ok: false, message: MSG_LOGIN_FAILED };
  }

  let success = false;
  try {
    // ipHash = odtlačok IP do auditu; bucket = kľúč brute-force limitu
    const { ipHash, known } = await getClientIpHash();
    const cookieStore = await cookies();
    const deviceId = readDeviceToken(cookieStore.get(deviceCookieName())?.value);
    // zariadenie, z ktorého sa už organizátor prihlásil → vlastný bucket (zámok cudzích pokusov z tej istej
    // IP / NAT ho nezasiahne); inak IP (alebo zdieľaný „unknown“ bucket bez dôveryhodnej proxy)
    const bucket = deviceId ? hashIp(`device:${deviceId}`) : ipHash;
    const bucketKnown = deviceId ? true : known;
    const db = await getDb();
    after(() => housekeeping());

    // 1) pokus sa ZAPÍŠE (ako neúspech) ešte pred overením hesla – v transakcii so zámkom,
    //    takže ani paralelné požiadavky neprekročia limit
    const gate = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"login:" + bucket}))`);
      const since = new Date(Date.now() - LOGIN_WINDOW_MS);
      const failedSince = and(eq(loginAttempts.success, false), gte(loginAttempts.createdAt, since));
      const bucketRows = tx
        .select({ one: sql`1` })
        .from(loginAttempts)
        .where(and(eq(loginAttempts.ipHash, bucket), failedSince))
        .limit(BUCKET_COUNT_CAP)
        .as("bucket_rows");
      // globálny počet používa čiastočný index login_attempts_fail_created_idx (drizzle/0002)
      const globalRows = tx.select({ one: sql`1` }).from(loginAttempts).where(failedSince).limit(GLOBAL_COUNT_CAP).as("global_rows");
      const [[{ n }], [{ g }]] = await Promise.all([
        tx.select({ n: count() }).from(bucketRows),
        tx.select({ g: count() }).from(globalRows),
      ]);
      const gate = loginGate(n, g, bucketKnown);
      if (gate.locked) return { ...gate, attemptId: null };
      if (n >= BUCKET_ROW_CAP) return { ...gate, attemptId: null };
      const [row] = await tx.insert(loginAttempts).values({ ipHash: bucket, success: false }).returning({ id: loginAttempts.id });
      return { ...gate, attemptId: row.id };
    });

    if (gate.locked) {
      // dočasný zákaz: heslo sa ani neoveruje, hláška je rovnaká ako pri zlom hesle;
      // do auditu najviac 1 záznam za okno zámku (anonym môže skúšať ľubovoľne často)
      console.warn("[admin] login locked");
      await auditOncePer("login_fail_locked", ipHash, LOGIN_WINDOW_MS);
      return { ok: false, message: MSG_LOGIN_FAILED };
    }
    if (gate.delayS > 0) await sleep(gate.delayS * 1000);

    // 2) scrypt (semafor – pri preťažení generická chyba, pokus ostáva započítaný)
    const { ok, busy } = await verifyAdminPassword(password);
    if (busy) {
      console.warn("[admin] login busy");
      return { ok: false, message: MSG_LOGIN_BUSY };
    }
    if (!ok) {
      console.warn("[admin] login failed");
      // spoľahlivý bucket má ≤ 5 neúspechov za 15 min → každý do auditu; zdieľaný bucket sa nezamyká → deduplikovať
      if (bucketKnown) await audit("login_fail", ipHash);
      else await auditOncePer("login_fail", ipHash, UNKNOWN_FAIL_AUDIT_WINDOW_MS);
      return { ok: false, message: MSG_LOGIN_FAILED };
    }

    // 3) úspech → pokus prepnúť na úspešný, zapamätať zariadenie
    if (gate.attemptId) {
      await db.update(loginAttempts).set({ success: true }).where(eq(loginAttempts.id, gate.attemptId));
    }
    await createSession();
    cookieStore.set(deviceCookieName(), signDeviceToken(), {
      httpOnly: true,
      secure: sessionCookieSecure(),
      sameSite: "strict",
      path: "/",
      maxAge: DEVICE_TTL_SECONDS,
    });
    await audit("login_ok", ipHash);
    success = true;
    console.info("[admin] login ok");
  } catch (err) {
    console.error(`[admin] login error code=${errorCode(err)}`);
    return { ok: false, message: "Prihlásenie je dočasne nedostupné (chyba servera alebo konfigurácie)." };
  }
  if (success) redirect("/admin");
  return null;
}

/** Odhlásenie zneplatní VŠETKY doteraz vydané admin tokeny (stateless JWT inak odvolať nejde). */
export async function logoutAction(): Promise<void> {
  // odvolávať smie len prihlásený – inak by ktokoľvek mohol odhlasovať organizátorov
  if (await isAuthenticated()) {
    try {
      await revokeAllSessions();
      const { ipHash } = await getClientIpHash();
      await audit("logout", ipHash);
    } catch (err) {
      console.error(`[admin] logout revoke failed code=${errorCode(err)}`);
    }
  }
  await deleteSession();
  redirect("/admin/login");
}

/* ------------------------------------------------------------------ */
/* Spoločné                                                           */
/* ------------------------------------------------------------------ */

type Handler<T> = (data: T) => Promise<AdminActionState>;

/**
 * Overí session, zvaliduje vstup, zachytí chyby (žiadne interné detaily klientovi)
 * a úspešnú akciu zapíše do auditu.
 */
function adminAction<T>(schema: z.ZodType<T>, action: AuditAction, handler: Handler<T>) {
  return async (_prev: AdminActionState, formData: FormData): Promise<AdminActionState> => {
    await verifySession();
    const raw: Record<string, unknown> = {};
    for (const key of new Set(formData.keys())) {
      if (key.startsWith("$ACTION")) continue;
      const all = formData.getAll(key).filter((v): v is string => typeof v === "string");
      raw[key] = key.endsWith("[]") ? all : all[0];
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Neplatný vstup." };
    }
    try {
      const res = await handler(parsed.data);
      if (res?.ok) await audit(action, (await getClientIpHash()).ipHash);
      refresh();
      return res;
    } catch (err) {
      if (getUniqueViolation(err)) return { ok: false, message: "Tím s týmto názvom už existuje." };
      console.error(`[admin] action error code=${errorCode(err)}`);
      return { ok: false, message: "Akcia zlyhala (chyba servera). Skús to znova." };
    }
  };
}

const teamName = z
  .string()
  .trim()
  .min(2, { error: "Názov tímu: aspoň 2 znaky" })
  .max(40, { error: "Názov tímu: najviac 40 znakov" })
  .refine(noControlChars, { error: "Názov tímu obsahuje nepovolené znaky" });

async function teamSize(db: Pick<Db, "select">, teamId: string) {
  const [{ n }] = await db.select({ n: count() }).from(participants).where(eq(participants.teamId, teamId));
  return n;
}

/* ------------------------------------------------------------------ */
/* Tímy a hráči                                                       */
/* ------------------------------------------------------------------ */

const updateNotesSchema = z.object({
  teamId: uuid,
  notes: z
    .string()
    .max(2000, { error: "Poznámka: najviac 2000 znakov" })
    .refine((v) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v), { error: "Poznámka obsahuje nepovolené znaky" })
    .optional()
    .default(""),
});

const updateTeamNotesImpl = adminAction(updateNotesSchema, "update_notes", async ({ teamId, notes }) => {
  const db = await getDb();
  const res = await db
    .update(teams)
    .set({ notes: notes.trim() || null })
    .where(eq(teams.id, teamId))
    .returning({ id: teams.id });
  if (!res.length) return { ok: false, message: "Tím neexistuje." };
  return { ok: true, message: "Poznámka uložená." };
});
export async function updateTeamNotes(prev: AdminActionState, fd: FormData) {
  return updateTeamNotesImpl(prev, fd);
}

const renameSchema = z.object({ teamId: uuid, name: teamName });
const renameTeamImpl = adminAction(renameSchema, "rename_team", async ({ teamId, name }) => {
  const db = await getDb();
  const res = await db.update(teams).set({ name }).where(eq(teams.id, teamId)).returning({ id: teams.id });
  if (!res.length) return { ok: false, message: "Tím neexistuje." };
  return { ok: true, message: "Tím premenovaný." };
});
export async function renameTeam(prev: AdminActionState, fd: FormData) {
  return renameTeamImpl(prev, fd);
}

/** Presun hráča do tímu, alebo `teamId="none"` → späť medzi nepriradených. */
const assignSchema = z.object({
  participantId: uuid,
  teamId: z.union([uuid, z.literal("none")], { error: "Vyber tím." }),
});
const assignParticipantImpl = adminAction(assignSchema, "assign", async ({ participantId, teamId }) => {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [p] = await tx.select({ id: participants.id, teamId: participants.teamId }).from(participants).where(eq(participants.id, participantId));
    if (!p) return { ok: false, message: "Hráč neexistuje." };
    if (teamId === "none") {
      await tx.update(participants).set({ teamId: null, isLeader: false }).where(eq(participants.id, participantId));
      return { ok: true, message: "Hráč presunutý medzi nepriradených." };
    }
    if (p.teamId === teamId) return { ok: true, message: "Hráč už je v tomto tíme." };
    const [t] = await tx.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.id, teamId));
    if (!t) return { ok: false, message: "Tím neexistuje." };
    if ((await teamSize(tx, teamId)) >= EVENT.team.max) {
      return { ok: false, message: `Tím „${t.name}“ už má maximum ${EVENT.team.max} hráčov.` };
    }
    await tx.update(participants).set({ teamId, isLeader: false }).where(eq(participants.id, participantId));
    return { ok: true, message: `Hráč priradený do tímu „${t.name}“.` };
  });
});
export async function assignParticipant(prev: AdminActionState, fd: FormData) {
  return assignParticipantImpl(prev, fd);
}

/** Vytvorí nový tím (origin "admin") z vybraných hráčov (typicky sólistov). */
const createTeamSchema = z.object({
  name: teamName,
  "participantIds[]": z
    .array(uuid)
    .min(1, { error: "Vyber aspoň jedného hráča." })
    .max(EVENT.team.max, { error: `Tím môže mať najviac ${EVENT.team.max} hráčov.` })
    .transform((a) => Array.from(new Set(a))),
});
const createTeamFromParticipantsImpl = adminAction(createTeamSchema, "create_team", async (data) => {
  const ids = data["participantIds[]"];
  const db = await getDb();
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: teams.id }).from(teams).where(sql`lower(${teams.name}) = lower(${data.name})`).limit(1);
    if (existing.length) return { ok: false, message: "Tím s týmto názvom už existuje." };
    // FOR UPDATE: súbežný presun tých istých hráčov počká na túto transakciu
    const found = await tx
      .select({ id: participants.id, teamId: participants.teamId })
      .from(participants)
      .where(inArray(participants.id, ids))
      .for("update");
    if (found.length !== ids.length) return { ok: false, message: "Niektorý z vybraných hráčov už neexistuje. Obnov stránku." };
    // nový tím sa skladá len z nepriradených – členov existujúcich tímov presúva „Presunúť do“ (s kontrolou veľkosti)
    if (found.some((p) => p.teamId !== null)) {
      return { ok: false, message: "Niektorý z vybraných hráčov už je v tíme. Vyber len nepriradených hráčov a obnov stránku." };
    }
    const [team] = await tx.insert(teams).values({ name: data.name, origin: "admin" }).returning({ id: teams.id });
    await tx.update(participants).set({ teamId: team.id, isLeader: false }).where(inArray(participants.id, ids));
    return { ok: true, message: `Tím „${data.name}“ vytvorený (${ids.length} ${ids.length === 1 ? "hráč" : ids.length < 5 ? "hráči" : "hráčov"}).` };
  });
});
export async function createTeamFromParticipants(prev: AdminActionState, fd: FormData) {
  return createTeamFromParticipantsImpl(prev, fd);
}

const setLeaderSchema = z.object({ participantId: uuid });
const setLeaderImpl = adminAction(setLeaderSchema, "set_leader", async ({ participantId }) => {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [p] = await tx.select({ teamId: participants.teamId }).from(participants).where(eq(participants.id, participantId));
    if (!p?.teamId) return { ok: false, message: "Hráč nie je v tíme." };
    await tx.update(participants).set({ isLeader: false }).where(eq(participants.teamId, p.teamId));
    await tx.update(participants).set({ isLeader: true }).where(eq(participants.id, participantId));
    return { ok: true, message: "Kapitán tímu zmenený." };
  });
});
export async function setLeader(prev: AdminActionState, fd: FormData) {
  return setLeaderImpl(prev, fd);
}

const deleteParticipantSchema = z.object({
  participantId: uuid,
  confirm: z.literal("yes", { error: "Potvrď zmazanie." }),
});
const deleteParticipantImpl = adminAction(deleteParticipantSchema, "delete_participant", async ({ participantId }) => {
  const db = await getDb();
  const res = await db.delete(participants).where(eq(participants.id, participantId)).returning({ id: participants.id });
  if (!res.length) return { ok: false, message: "Hráč už neexistuje." };
  // registrácia bez účastníkov (súhlasy, ipHash) už nemá účel → zmaž ju tiež
  await db.delete(registrations).where(
    sql`not exists (select 1 from ${participants} where ${participants.registrationId} = ${registrations.id})`,
  );
  return { ok: true, message: "Hráč zmazaný." };
});
export async function deleteParticipant(prev: AdminActionState, fd: FormData) {
  return deleteParticipantImpl(prev, fd);
}

/** Zmazanie tímu: členovia → nepriradení ("unassign"), alebo zmazať aj členov ("delete"). */
const deleteTeamSchema = z.object({
  teamId: uuid,
  members: z.enum(["unassign", "delete"], { error: "Vyber, čo sa stane s členmi." }),
  confirm: z.literal("yes", { error: "Potvrď zmazanie." }),
});
const deleteTeamImpl = adminAction(deleteTeamSchema, "delete_team", async ({ teamId, members }) => {
  const db = await getDb();
  return db.transaction(async (tx) => {
    if (members === "delete") {
      await tx.delete(participants).where(eq(participants.teamId, teamId));
    } else {
      await tx.update(participants).set({ teamId: null, isLeader: false }).where(eq(participants.teamId, teamId));
    }
    const res = await tx.delete(teams).where(eq(teams.id, teamId)).returning({ id: teams.id });
    if (!res.length) return { ok: false, message: "Tím už neexistuje." };
    await tx.delete(registrations).where(
      sql`not exists (select 1 from ${participants} where ${participants.registrationId} = ${registrations.id})`,
    );
    return {
      ok: true,
      message: members === "delete" ? "Tím aj jeho členovia zmazaní." : "Tím zmazaný, členovia sú medzi nepriradenými.",
    };
  });
});
export async function deleteTeam(prev: AdminActionState, fd: FormData) {
  return deleteTeamImpl(prev, fd);
}

/** GDPR – po evente vymaže všetky osobné údaje. */
const wipeSchema = z.object({
  confirmText: z.literal("VYMAZAŤ", { error: "Pre potvrdenie napíš presne VYMAZAŤ." }),
});
const wipeAllDataImpl = adminAction(wipeSchema, "wipe", async () => {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(participants);
    await tx.delete(teams);
    await tx.delete(registrations);
    await tx.delete(registrationAttempts);
    await tx.delete(loginAttempts);
    // admin_audit ostáva (neobsahuje osobné údaje) – wrapper doň zapíše „wipe“
  });
  console.warn("[admin] all registration data wiped");
  return { ok: true, message: "Všetky registračné údaje boli vymazané." };
});
export async function wipeAllData(prev: AdminActionState, fd: FormData) {
  return wipeAllDataImpl(prev, fd);
}
