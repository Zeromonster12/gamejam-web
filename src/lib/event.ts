/**
 * Údaje o evente – jediné miesto, kde sa menia dátumy, miesto a výhry.
 * Používa ich hero, HUD odpočet aj e-maily/exporty.
 */
export const EVENT = {
  name: "GameJam 2027",
  presenter: "Hra bez HRAníc",
  tagline: "Tímy študentov. 24 hodín. Jedna hra.",
  subTagline: "Naprogramuj. Otestuj. Vyhraj.",
  // Štart eventu – stredoeurópsky čas (CET, UTC+1)
  startsAt: "2027-02-11T18:00:00+01:00",
  endsAt: "2027-02-12T18:00:00+01:00",
  dateLabel: "11.–12. 2. 2027",
  startLabel: "štvrtok 18:00",
  durationLabel: "24 h non-stop",
  venue: "Študentské centrum Zobor",
  venueCity: "Nitra",
  prizes: { main: 500, others: [350, 250, 150] },
  currency: "€",
  team: { min: 2, max: 5 },
  /** Kontakt organizátorov – PLACEHOLDER, doplniť skutočný. */
  contactEmail: "gamejam@example.com",
  /** Prevádzkovateľ osobných údajov – PLACEHOLDER, doplniť skutočný. */
  dataController: "[Prevádzkovateľ – doplniť: názov, adresa, IČO]",
  partners: [
    { name: "Hra bez HRAníc", src: "/partners/hra-bez-hranic.png", width: 700, height: 425 },
    { name: "Fakulta prírodných vied a informatiky UKF", src: "/partners/fpvai.png", width: 700, height: 205 },
    { name: "Univerzita Konštantína Filozofa v Nitre", src: "/partners/ukf.png", width: 700, height: 262 },
  ],
} as const;

/**
 * Verzia textov súhlasov (GDPR, zdravotné údaje) vo formulári – ukladá sa ku každej registrácii.
 * Pri zmene textu súhlasu zvýš verziu (napr. "2027-02").
 */
export const CONSENT_VERSION = "2027-01";

/** Paleta z plagátu (violet pixel HUD verzia). */
export const COLORS = {
  bg: "#1c141e",
  card: "#261b2e",
  window: "#211933",
  shadow: "#0c080e",
  ink: "#f3e4f2",
  grey: "#9a849c",
  dim: "#55425a",
  pink: "#f24ed6",
  violet: "#9d2ce8",
  lime: "#a0d14f",
  navy: "#231c4a",
  floor: "#f3e4f2",
  dot: "#e7cbe5",
  red: "#be1634",
  gold: "#cc821a",
} as const;
