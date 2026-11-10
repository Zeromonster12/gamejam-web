"use server";

import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { getDb } from "@/db";
import { participants, registrationAttempts, registrations, teams } from "@/db/schema";
import { CONSENT_VERSION } from "@/lib/event";
import { checkFormToken, issueFormToken } from "@/lib/form-token";
import { housekeeping } from "@/lib/maintenance";
import { isRegistrationOpen } from "@/lib/registration-status";
import { MSG_DUP_EMAIL, MSG_DUP_TEAM, MSG_INVALID, uniqueViolationResult } from "@/lib/registration-errors";
import { errorCode, getClientIpHash, getUniqueViolation } from "@/lib/security";
import {
  ADULT_AGE,
  registrationSchema,
  toFieldErrors,
  type Leader,
  type Member,
  type RegisterResult,
  type RegistrationInput,
} from "@/lib/validation";

const WINDOW_MS = 60 * 60 * 1000;
/** Úspešné registrácie z jednej IP za hodinu. */
const SUCCESS_LIMIT_PER_IP = 5;
/** Všetky pokusy (aj neplatné/duplicitné) z jednej IP za hodinu – brzda proti enumerácii e-mailov. */
const ATTEMPT_LIMIT_PER_IP = 20;
/** Ak IP nepoznáme (TRUST_PROXY vypnuté), zdieľajú všetci jeden bucket – voľnejšie limity. */
const SUCCESS_LIMIT_UNKNOWN_IP = 60;
const ATTEMPT_LIMIT_UNKNOWN_IP = 200;

const MSG_RETRY = "Odoslanie sa nepodarilo. Počkaj chvíľu, obnov stránku a skús to znova.";
const MSG_RATE = "Z tohto pripojenia prišlo priveľa registrácií. Skús to znova neskôr alebo nám napíš.";
const MSG_CLOSED = "Registrácia je momentálne uzavretá.";
const MSG_SERVER = "Na našej strane sa niečo pokazilo. Skús to o chvíľu znova.";

type Person = Leader | Member;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Honeypot vyplnený → predstieraj úspech (bot nemá dostať spätnú väzbu), nič neukladaj. */
function fakeSuccess(input: Record<string, unknown>): RegisterResult {
  const mode = input.mode === "team" ? "team" : "solo";
  const leader = (input.leader && typeof input.leader === "object" ? input.leader : {}) as Record<string, unknown>;
  return {
    ok: true,
    mode,
    teamName: mode === "team" ? str(input.teamName, 40) || undefined : undefined,
    firstName: str(leader.firstName, 60) || "hráč",
  };
}

class DuplicateError extends Error {
  constructor(public fieldErrors: Record<string, string>) {
    super("duplicate");
  }
}

/** Čerstvý token formulára – napr. pre „Registrovať ďalší tím“ bez obnovenia stránky. */
export async function getFormToken(): Promise<string> {
  return issueFormToken();
}

/**
 * Zapíše pokus o registráciu a skontroluje limit pokusov (serializované advisory lockom).
 * true = limit prekročený.
 */
async function attemptLimited(ipHash: string, limit: number): Promise<boolean> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"reg-attempt:" + ipHash}))`);
    const [{ n }] = await tx
      .select({ n: count() })
      .from(registrationAttempts)
      .where(and(eq(registrationAttempts.ipHash, ipHash), gte(registrationAttempts.createdAt, new Date(Date.now() - WINDOW_MS))));
    if (n >= limit) return true;
    await tx.insert(registrationAttempts).values({ ipHash });
    return false;
  });
}

export async function registerAction(input: RegistrationInput): Promise<RegisterResult> {
  try {
    if (!isRegistrationOpen()) return { ok: false, error: MSG_CLOSED };

    const { ipHash, known } = await getClientIpHash();
    // každý pokus (aj neplatný, duplicitný, bot) sa počíta do limitu pokusov
    if (await attemptLimited(ipHash, known ? ATTEMPT_LIMIT_PER_IP : ATTEMPT_LIMIT_UNKNOWN_IP)) {
      console.warn("[register] attempt rate limited");
      return { ok: false, error: MSG_RATE };
    }

    if (!input || typeof input !== "object") return { ok: false, error: MSG_INVALID };
    const raw = input as unknown as Record<string, unknown>;

    if (raw.website !== undefined && raw.website !== null && raw.website !== "") {
      console.info("[register] honeypot");
      return fakeSuccess(raw);
    }

    const parsed = registrationSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors = toFieldErrors(parsed.error);
      // chýbajúci/poškodený token nie je chyba používateľa v poli → všeobecná hláška
      if (fieldErrors.formToken) return { ok: false, error: MSG_RETRY };
      return { ok: false, error: MSG_INVALID, fieldErrors };
    }
    const data = parsed.data;

    const token = checkFormToken(data.formToken);
    if (token !== "ok") {
      console.info(`[register] rejected token=${token}`);
      return { ok: false, error: MSG_RETRY };
    }

    const successLimit = known ? SUCCESS_LIMIT_PER_IP : SUCCESS_LIMIT_UNKNOWN_IP;

    const people: { person: Person; key: string; isLeader: boolean }[] = [
      { person: data.leader, key: "leader", isLeader: true },
      ...(data.mode === "team" ? data.members.map((m, i) => ({ person: m as Person, key: `members.${i}`, isLeader: false })) : []),
    ];
    const emails = people.map((p) => p.person.email).filter((e): e is string => !!e);
    const hasAllergies = people.some((p) => !!p.person.allergies);

    const db = await getDb();
    const now = new Date();

    let result: string | "rate-limited";
    try {
      result = await db.transaction(async (tx) => {
        // serializuje registrácie z jednej IP → limit sa nedá obísť paralelnými requestmi
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ipHash}))`);

        const [{ n }] = await tx
          .select({ n: count() })
          .from(registrations)
          .where(and(eq(registrations.ipHash, ipHash), gte(registrations.createdAt, new Date(now.getTime() - WINDOW_MS))));
        if (n >= successLimit) return "rate-limited" as const;

        // duplicity vopred → priateľské hlášky po poliach (unique index je poistka nižšie)
        const fieldErrors: Record<string, string> = {};
        if (emails.length) {
          const existing = await tx
            .select({ email: participants.email })
            .from(participants)
            .where(inArray(sql<string>`lower(${participants.email})`, emails));
          const taken = new Set(existing.map((e) => e.email?.toLowerCase()));
          for (const p of people) {
            if (p.person.email && taken.has(p.person.email)) fieldErrors[`${p.key}.email`] = MSG_DUP_EMAIL;
          }
        }
        if (data.mode === "team") {
          const t = await tx
            .select({ id: teams.id })
            .from(teams)
            .where(sql`lower(${teams.name}) = lower(${data.teamName})`)
            .limit(1);
          if (t.length) fieldErrors.teamName = MSG_DUP_TEAM;
        }
        if (Object.keys(fieldErrors).length) throw new DuplicateError(fieldErrors);

        const [reg] = await tx
          .insert(registrations)
          .values({
            mode: data.mode,
            ipHash,
            gdprConsentAt: now,
            healthConsentAt: hasAllergies && data.healthConsent ? now : null,
            consentVersion: CONSENT_VERSION,
          })
          .returning({ id: registrations.id });

        let teamId: string | null = null;
        if (data.mode === "team") {
          const [team] = await tx
            .insert(teams)
            .values({ name: data.teamName, origin: "registration" })
            .returning({ id: teams.id });
          teamId = team.id;
        }

        await tx.insert(participants).values(
          people.map(({ person, isLeader }) => {
            const minor = person.age < ADULT_AGE;
            return {
              registrationId: reg.id,
              teamId,
              origin: data.mode,
              isLeader: data.mode === "team" ? isLeader : false,
              firstName: person.firstName,
              lastName: person.lastName,
              email: person.email ?? null,
              age: person.age,
              schoolType: person.schoolType,
              schoolName: person.schoolName,
              focus: person.focus,
              focusNote: person.focusNote ?? null,
              allergies: person.allergies ?? null,
              // údaje o zákonnom zástupcovi ukladáme len pri mladistvých (minimalizácia údajov)
              guardianName: minor ? (person.guardianName ?? null) : null,
              guardianContact: minor ? (person.guardianContact ?? null) : null,
              guardianConsent: minor ? person.guardianConsent === true : false,
            };
          }),
        );
        return reg.id;
      });
    } catch (err) {
      if (err instanceof DuplicateError) {
        return { ok: false, error: MSG_INVALID, fieldErrors: err.fieldErrors };
      }
      const unique = getUniqueViolation(err);
      if (unique) return uniqueViolationResult(unique, people.map((p) => ({ email: p.person.email, key: p.key })));
      throw err;
    }

    if (result === "rate-limited") {
      console.warn("[register] rate limited");
      return { ok: false, error: MSG_RATE };
    }

    after(() => housekeeping());
    console.info(`[register] ok id=${result} mode=${data.mode} people=${people.length}`);
    return {
      ok: true,
      mode: data.mode,
      teamName: data.mode === "team" ? data.teamName : undefined,
      firstName: data.leader.firstName,
    };
  } catch (err) {
    console.error(`[register] failed code=${errorCode(err)}`);
    return { ok: false, error: MSG_SERVER };
  }
}
