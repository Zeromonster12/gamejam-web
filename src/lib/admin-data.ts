import "server-only";

import { asc, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { participants, teams, type Participant, type Team } from "@/db/schema";
import { after } from "next/server";
import { isAuthenticated, verifySession } from "./auth";
import { auditOverview, housekeeping, type AuditOverview } from "./maintenance";
import { EVENT } from "./event";
import { computeInsights, type Insights } from "./insights";
import { ADULT_AGE } from "./validation";

/**
 * Data Access Layer pre admin – každá funkcia si sama overí session.
 * Vracia len stĺpce, ktoré admin UI/exporty zobrazujú (bez registrationId, ipHash…).
 */

export type AdminParticipant = Pick<
  Participant,
  | "id"
  | "teamId"
  | "origin"
  | "isLeader"
  | "firstName"
  | "lastName"
  | "email"
  | "age"
  | "schoolType"
  | "schoolName"
  | "focus"
  | "focusNote"
  | "allergies"
  | "guardianName"
  | "guardianContact"
  | "guardianConsent"
  | "createdAt"
>;

export type AdminTeam = Pick<Team, "id" | "name" | "origin" | "notes" | "createdAt"> & {
  members: AdminParticipant[];
};

export type AdminOverview = {
  audit: AuditOverview;
  /** Formulár sľubuje vymazanie údajov do 3 mesiacov po evente → koniec eventu + 90 dní. */
  retention: { deadline: Date; over: boolean };
  teams: AdminTeam[];
  solo: AdminParticipant[];
  stats: {
    teams: number;
    participants: number;
    unassigned: number;
    minors: number;
    allergies: number;
  };
};

const participantColumns = {
  id: participants.id,
  teamId: participants.teamId,
  origin: participants.origin,
  isLeader: participants.isLeader,
  firstName: participants.firstName,
  lastName: participants.lastName,
  email: participants.email,
  age: participants.age,
  schoolType: participants.schoolType,
  schoolName: participants.schoolName,
  focus: participants.focus,
  focusNote: participants.focusNote,
  allergies: participants.allergies,
  guardianName: participants.guardianName,
  guardianContact: participants.guardianContact,
  guardianConsent: participants.guardianConsent,
  createdAt: participants.createdAt,
};

export async function getAdminOverview(): Promise<AdminOverview> {
  await verifySession();
  after(() => housekeeping());
  const db = await getDb();
  const [teamRows, people, auditRows] = await Promise.all([
    db
      .select({ id: teams.id, name: teams.name, origin: teams.origin, notes: teams.notes, createdAt: teams.createdAt })
      .from(teams)
      .orderBy(asc(teams.createdAt)),
    db
      .select(participantColumns)
      .from(participants)
      .orderBy(desc(participants.isLeader), asc(participants.createdAt), asc(participants.lastName)),
    auditOverview(30, 20),
  ]);

  const byTeam = new Map<string, AdminParticipant[]>();
  const solo: AdminParticipant[] = [];
  for (const p of people) {
    if (p.teamId) {
      const list = byTeam.get(p.teamId) ?? [];
      list.push(p);
      byTeam.set(p.teamId, list);
    } else solo.push(p);
  }

  const deadline = new Date(new Date(EVENT.endsAt).getTime() + 90 * 24 * 60 * 60 * 1000);
  return {
    audit: auditRows,
    retention: { deadline, over: Date.now() > deadline.getTime() },
    teams: teamRows.map((t) => ({ ...t, members: byTeam.get(t.id) ?? [] })),
    solo,
    stats: {
      teams: teamRows.length,
      participants: people.length,
      unassigned: solo.length,
      minors: people.filter((p) => p.age < ADULT_AGE).length,
      allergies: people.filter((p) => !!p.allergies).length,
    },
  };
}

/** Prehľad a štatistiky pre /admin/prehlad (alergie, pokrytie rolí, vek, školy, registrácie v čase). */
export async function getAdminInsights(): Promise<Insights> {
  await verifySession();
  const db = await getDb();
  const [teamRows, people] = await Promise.all([
    db.select({ id: teams.id, name: teams.name }).from(teams).orderBy(asc(teams.createdAt)),
    db.select(participantColumns).from(participants).orderBy(asc(participants.createdAt)),
  ]);
  return computeInsights(teamRows, people);
}

export type ExportRow = AdminParticipant & { teamName: string | null };

/** Pre CSV export – volá ho route handler, ktorý session overuje sám (401 namiesto redirectu). */
export async function getExportRows(): Promise<ExportRow[]> {
  if (!(await isAuthenticated())) throw new Error("unauthorized");
  const db = await getDb();
  const [teamRows, people] = await Promise.all([
    db.select({ id: teams.id, name: teams.name }).from(teams),
    db.select(participantColumns).from(participants).orderBy(asc(participants.teamId), desc(participants.isLeader), asc(participants.lastName)),
  ]);
  const names = new Map(teamRows.map((t) => [t.id, t.name]));
  return people
    .map((p) => ({ ...p, teamName: p.teamId ? (names.get(p.teamId) ?? null) : null }))
    .sort((a, b) => (a.teamName ?? "￿").localeCompare(b.teamName ?? "￿", "sk") || Number(b.isLeader) - Number(a.isLeader));
}
