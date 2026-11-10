import { z } from "zod";
import { EVENT } from "./event";

/**
 * Zdieľaná validácia – používa ju klientsky formulár (okamžitá spätná väzba)
 * aj server action (jediný zdroj pravdy; klientovi sa nikdy neverí).
 */

export const SCHOOL_TYPES = ["ss", "vs"] as const;
export const SCHOOL_TYPE_LABELS: Record<(typeof SCHOOL_TYPES)[number], string> = {
  ss: "Stredná škola",
  vs: "Vysoká škola",
};

export const FOCUS_OPTIONS = [
  "programovanie",
  "grafika",
  "zvuk-hudba",
  "game-design",
  "pribeh",
  "testovanie",
  "neviem",
] as const;
export const FOCUS_LABELS: Record<(typeof FOCUS_OPTIONS)[number], string> = {
  programovanie: "Programovanie",
  grafika: "Grafika / art",
  "zvuk-hudba": "Zvuk a hudba",
  "game-design": "Game design",
  pribeh: "Príbeh / texty",
  testovanie: "Testovanie",
  neviem: "Ešte neviem – chcem skúsiť",
};

export const ADULT_AGE = 18;
export const MIN_AGE = 12;
export const MAX_AGE = 99;

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label}: povinné pole` })
    .trim()
    .min(min, { error: min <= 1 ? `${label}: povinné pole` : `${label}: aspoň ${min} znaky` })
    .max(max, { error: `${label}: najviac ${max} znakov` })
    // zakáže riadiace znaky (okrem bežných medzier) – obrana proti neviditeľnému „smetiu“
    .refine((v) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v), {
      error: `${label}: obsahuje nepovolené znaky`,
    });

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label}: najviac ${max} znakov` })
    .refine((v) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v), {
      error: `${label}: obsahuje nepovolené znaky`,
    })
    .optional()
    .transform((v) => (v ? v : undefined));

const email = z
  .string({ error: "E-mail: povinné pole" })
  .trim()
  .toLowerCase()
  .max(254, { error: "E-mail je príliš dlhý" })
  .pipe(z.email({ error: "Zadaj platný e-mail" }));

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.email({ error: "Zadaj platný e-mail" }).optional());

const baseParticipant = z.object({
  firstName: trimmed(1, 60, "Meno"),
  lastName: trimmed(1, 80, "Priezvisko"),
  age: z.coerce
    .number({ error: "Vek: zadaj číslo" })
    .int({ error: "Vek: celé číslo" })
    .min(MIN_AGE, { error: `Vek: minimálne ${MIN_AGE} rokov` })
    .max(MAX_AGE, { error: "Vek: skontroluj hodnotu" }),
  schoolType: z.enum(SCHOOL_TYPES, { error: "Vyber typ školy" }),
  schoolName: trimmed(2, 120, "Škola"),
  focus: z
    .array(z.enum(FOCUS_OPTIONS))
    .min(1, { error: "Vyber aspoň jedno zameranie" })
    .max(FOCUS_OPTIONS.length)
    .transform((a) => Array.from(new Set(a))),
  focusNote: optionalText(300, "Poznámka k zameraniu"),
  allergies: optionalText(300, "Alergie"),
  guardianName: optionalText(120, "Meno zákonného zástupcu"),
  guardianContact: optionalText(120, "Kontakt na zákonného zástupcu"),
  guardianConsent: z.boolean().optional(),
});

/** Mladiství (< 18): zákonný zástupca musí byť informovaný a súhlasiť. */
const withGuardianRules = <T extends z.ZodType<z.infer<typeof baseParticipant>>>(schema: T) =>
  schema.superRefine((p, ctx) => {
    if (p.age < ADULT_AGE) {
      if (!p.guardianName)
        ctx.addIssue({ code: "custom", path: ["guardianName"], message: "Pri veku pod 18 rokov vyplň meno zákonného zástupcu" });
      if (!p.guardianContact)
        ctx.addIssue({ code: "custom", path: ["guardianContact"], message: "Pri veku pod 18 rokov vyplň kontakt (telefón alebo e-mail) na zákonného zástupcu" });
      if (p.guardianConsent !== true)
        ctx.addIssue({ code: "custom", path: ["guardianConsent"], message: "Zákonný zástupca musí s účasťou súhlasiť" });
    }
  });

export const leaderSchema = withGuardianRules(baseParticipant.extend({ email }));
export const memberSchema = withGuardianRules(baseParticipant.extend({ email: optionalEmail }));

export type LeaderInput = z.input<typeof leaderSchema>;
export type Leader = z.output<typeof leaderSchema>;
export type Member = z.output<typeof memberSchema>;

const consents = {
  /** Súhlas so spracovaním osobných údajov (čl. 6 ods. 1 písm. a) GDPR). */
  gdprConsent: z.literal(true, { error: "Bez súhlasu so spracovaním údajov sa nedá registrovať" }),
  /** Výslovný súhlas so spracovaním údajov o zdraví (alergie) – čl. 9 ods. 2 písm. a) GDPR. */
  healthConsent: z.boolean().optional(),
  /** Honeypot – musí ostať prázdny. */
  website: z.string().max(0).optional(),
  /**
   * Podpísaný token formulára (vydá ho server pri renderi, obsahuje čas otvorenia) –
   * ochrana proti botom, ktoré odošlú okamžite. Overuje ho server (src/lib/form-token.ts).
   */
  formToken: z.string({ error: "Obnov stránku a skús to znova" }).min(1).max(200),
};

const teamName = trimmed(2, 40, "Názov tímu");

export const registrationSchema = z
  .discriminatedUnion("mode", [
    z.object({
      mode: z.literal("team"),
      teamName,
      leader: leaderSchema,
      members: z
        .array(memberSchema)
        .min(EVENT.team.min - 1, { error: `Tím musí mať aspoň ${EVENT.team.min} členov (vrátane teba)` })
        .max(EVENT.team.max - 1, { error: `Tím môže mať najviac ${EVENT.team.max} členov (vrátane teba)` }),
      ...consents,
    }),
    z.object({
      mode: z.literal("solo"),
      leader: leaderSchema,
      ...consents,
    }),
  ])
  .superRefine((r, ctx) => {
    const people = r.mode === "team" ? [r.leader, ...r.members] : [r.leader];
    if (people.some((p) => p.allergies) && r.healthConsent !== true) {
      ctx.addIssue({
        code: "custom",
        path: ["healthConsent"],
        message: "Ak uvádzaš alergie, potrebujeme výslovný súhlas so spracovaním týchto údajov",
      });
    }
    if (r.mode === "team") {
      const emails = people.map((p) => p.email).filter(Boolean);
      if (new Set(emails).size !== emails.length)
        ctx.addIssue({ code: "custom", path: ["members"], message: "Každý člen tímu musí mať iný e-mail" });
    }
  });

export type RegistrationInput = z.input<typeof registrationSchema>;
export type Registration = z.output<typeof registrationSchema>;

/** Výsledok server action `registerAction`. */
export type RegisterResult =
  | { ok: true; mode: "team" | "solo"; teamName?: string; firstName: string }
  | {
      ok: false;
      /** Všeobecná hláška pre používateľa (nikdy neobsahuje interné detaily). */
      error: string;
      /** Chyby po poliach, kľúč = cesta ako "leader.age" alebo "members.1.email". */
      fieldErrors?: Record<string, string>;
    };

/** Prevedie zod chyby na mapu "cesta" -> prvá hláška. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
