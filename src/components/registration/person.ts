import { ADULT_AGE, MIN_AGE, type FOCUS_OPTIONS, type SCHOOL_TYPES } from "@/lib/validation";

export type Focus = (typeof FOCUS_OPTIONS)[number];
export type SchoolType = (typeof SCHOOL_TYPES)[number];

/** Stav jednej osoby vo formulári (všetko ako reťazce – zod ich na vstupe skonvertuje). */
export type Person = {
  firstName: string;
  lastName: string;
  email: string;
  age: string;
  schoolType: SchoolType | "";
  schoolName: string;
  focus: Focus[];
  focusNote: string;
  allergies: string;
  guardianName: string;
  guardianContact: string;
  guardianConsent: boolean;
};

export const emptyPerson = (): Person => ({
  firstName: "",
  lastName: "",
  email: "",
  age: "",
  schoolType: "",
  schoolName: "",
  focus: [],
  focusNote: "",
  allergies: "",
  guardianName: "",
  guardianContact: "",
  guardianConsent: false,
});

/** Blok zákonného zástupcu ukážeme pre vek 12–17 (pri písaní „1“ → „16“ neblikne). */
export function isMinor(p: Person) {
  const n = Number(p.age);
  return p.age.trim() !== "" && Number.isFinite(n) && n >= MIN_AGE && n < ADULT_AGE;
}

export const hasAllergies = (p: Person) => p.allergies.trim() !== "";

/** Prevod na vstup pre `registrationSchema` (prázdne voliteľné hodnoty vynecháme). */
export function personInput(p: Person) {
  const minor = p.age.trim() !== "" && Number(p.age) < ADULT_AGE;
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    age: p.age.trim() === "" ? undefined : p.age.trim(),
    schoolType: p.schoolType || undefined,
    schoolName: p.schoolName,
    focus: p.focus,
    focusNote: p.focusNote || undefined,
    allergies: p.allergies || undefined,
    ...(minor
      ? { guardianName: p.guardianName || undefined, guardianContact: p.guardianContact || undefined, guardianConsent: p.guardianConsent }
      : {}),
  };
}

/** Poradie polí osoby – pre zoradenie súhrnu chýb podľa poradia vo formulári. */
export const PERSON_KEYS = [
  "firstName",
  "lastName",
  "email",
  "age",
  "schoolType",
  "schoolName",
  "focus",
  "focusNote",
  "allergies",
  "guardianName",
  "guardianContact",
  "guardianConsent",
] as const;
