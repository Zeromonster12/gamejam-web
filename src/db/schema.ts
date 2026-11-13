import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Jedno odoslanie formulára (tím alebo sólo). Slúži na súhlasy, audit a rate limit. */
export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: text("mode", { enum: ["team", "solo"] }).notNull(),
    /** HMAC-SHA256(IP, IP_HASH_SECRET) – nie surová IP adresa. */
    ipHash: text("ip_hash").notNull(),
    gdprConsentAt: timestamp("gdpr_consent_at", { withTimezone: true }).notNull(),
    healthConsentAt: timestamp("health_consent_at", { withTimezone: true }),
    /** Verzia textu súhlasov, ktorú používateľ odsúhlasil (CONSENT_VERSION v src/lib/event.ts). */
    consentVersion: text("consent_version").notNull().default("2027-01"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("registrations_ip_created_idx").on(t.ipHash, t.createdAt)],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** "registration" = tím zaregistrovaný líderom, "admin" = vytvorený organizátormi (napr. zo sólistov). */
    origin: text("origin", { enum: ["registration", "admin"] }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("teams_name_lower_uq").on(sql`lower(${t.name})`)],
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    /** null = sólista zatiaľ nepriradený k tímu. */
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    /** Ako sa prihlásil: "team" (líder/člen tímu) alebo "solo". */
    origin: text("origin", { enum: ["team", "solo"] }).notNull(),
    isLeader: boolean("is_leader").notNull().default(false),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    age: integer("age").notNull(),
    schoolType: text("school_type", { enum: ["ss", "vs"] }).notNull(),
    schoolName: text("school_name").notNull(),
    focus: text("focus").array().notNull(),
    focusNote: text("focus_note"),
    allergies: text("allergies"),
    guardianName: text("guardian_name"),
    guardianContact: text("guardian_contact"),
    guardianConsent: boolean("guardian_consent").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("participants_team_idx").on(t.teamId),
    // ten istý e-mail sa nemôže zaregistrovať dvakrát
    uniqueIndex("participants_email_lower_uq").on(sql`lower(${t.email})`).where(sql`${t.email} is not null`),
  ],
);

/** Pokusy o prihlásenie do adminu – brute-force ochrana. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ipHash: text("ip_hash").notNull(),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_ip_created_idx").on(t.ipHash, t.createdAt),
    // globálny počet neúspechov za 15 min (brzda prihlasovania) → rozsah v indexe, nie scan celej tabuľky
    index("login_attempts_fail_created_idx").on(t.createdAt).where(sql`${t.success} = false`),
  ],
);

/** Každý pokus o registráciu (aj neúspešný) – rate limit proti enumerácii e-mailov. Maže sa po 24 h. */
export const registrationAttempts = pgTable(
  "registration_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("registration_attempts_ip_created_idx").on(t.ipHash, t.createdAt)],
);

/** Jediný riadok (id = 1) so stavom adminu. Tokeny vydané pred `sessionsValidAfter` sú neplatné. */
export const adminState = pgTable("admin_state", {
  id: integer("id").primaryKey(),
  sessionsValidAfter: timestamp("sessions_valid_after", { withTimezone: true }).notNull(),
});

/** Audit admin akcií – bez osobných údajov (iba akcia, čas a HMAC IP). */
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_audit_created_idx").on(t.createdAt)],
);

export type Team = typeof teams.$inferSelect;
export type Participant = typeof participants.$inferSelect;
