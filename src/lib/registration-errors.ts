import type { RegisterResult } from "./validation";

export const MSG_INVALID = "Skontroluj zvýraznené polia.";
export const MSG_DUP_EMAIL = "Tento e-mail je už zaregistrovaný";
export const MSG_DUP_TEAM = "Tím s týmto názvom už existuje";
export const MSG_CONFLICT =
  "Niektorý z údajov (e-mail alebo názov tímu) práve niekto zaregistroval. Skontroluj ich a skús to znova.";

/**
 * Poistka pre súbeh dvoch registrácií (predbežná kontrola prešla, unique index nie):
 * podľa názvu constraintu a hodnoty z `detail` („Key (lower(email))=(a@b.sk) already exists.“)
 * priradí chybu správnemu poľu. Ak sa to nedá určiť, vráti všeobecnú hlášku.
 */
export function uniqueViolationResult(
  unique: { constraint?: string; detail?: string },
  people: { email?: string | null; key: string }[],
): RegisterResult {
  if (unique.constraint === "teams_name_lower_uq") {
    return { ok: false, error: MSG_INVALID, fieldErrors: { teamName: MSG_DUP_TEAM } };
  }
  if (unique.constraint === "participants_email_lower_uq") {
    const value = /=\((.*)\) already exists/.exec(unique.detail ?? "")?.[1]?.trim().toLowerCase();
    const hit = value ? people.find((p) => p.email?.toLowerCase() === value) : undefined;
    if (hit) return { ok: false, error: MSG_INVALID, fieldErrors: { [`${hit.key}.email`]: MSG_DUP_EMAIL } };
  }
  return { ok: false, error: MSG_CONFLICT };
}
