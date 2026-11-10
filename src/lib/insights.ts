import "server-only";

import type { AdminParticipant } from "./admin-data";
import { EVENT } from "./event";
import { ADULT_AGE, FOCUS_LABELS, FOCUS_OPTIONS, SCHOOL_TYPE_LABELS, SCHOOL_TYPES } from "./validation";

/**
 * Prehľad pre organizátorov (/admin/prehlad) – čistý výpočet nad už načítanými dátami
 * (žiadne ďalšie dotazy do DB). Volá ho iba getAdminInsights() v admin-data.ts, ktorý overuje session.
 */

type Focus = (typeof FOCUS_OPTIONS)[number];
type TeamLite = { id: string; name: string };

/** Roly, ktorých pokrytie v tímoch sledujeme („ešte neviem“ nie je rola). */
const ROLES = FOCUS_OPTIONS.filter((f) => f !== "neviem");
type Role = (typeof ROLES)[number];

const AGE_BANDS = [
  { label: "12–14", from: 12, to: 14 },
  { label: "15–17", from: 15, to: 17 },
  { label: "18–20", from: 18, to: 20 },
  { label: "21–24", from: 21, to: 24 },
  { label: "25+", from: 25, to: Infinity },
] as const;

/** Hodnoty, ktorými ľudia v nepovinnom poli vyjadrujú „žiadne alergie“ – v súhrne položiek sa nepočítajú. */
const NO_ALLERGY = /^(nie|nemám|nemam|žiadn[eaáyý]|ziadn[eaáyý]|bez alergi[ií]|none|no|n\/a|x|0|-+|—|–)$/i;

export type PersonRef = {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  teamName: string | null;
};

export type Insights = {
  totals: {
    participants: number;
    teams: number;
    unassigned: number;
    minors: number;
    allergies: number;
    withoutEmail: number;
  };
  teamHealth: {
    /** tímy s menej ako EVENT.team.min členmi (aj prázdne) */
    belowMin: number;
    full: number;
    /** priemer neprázdnych tímov */
    avgSize: number | null;
    /** počet tímov podľa počtu členov 0..EVENT.team.max */
    sizes: { size: number; count: number }[];
  };
  coverage: {
    roles: { key: Role; label: string }[];
    teams: { id: string; name: string; size: number; counts: Record<Role, number> }[];
    /** koľkým (neprázdnym) tímom daná rola chýba a koľko nepriradených ju má */
    summary: Record<Role, { teamsMissing: number; unassigned: number }>;
  };
  focus: { key: Focus; label: string; total: number; unassigned: number }[];
  schoolTypes: { key: (typeof SCHOOL_TYPES)[number]; label: string; count: number }[];
  schools: { top: { name: string; count: number }[]; distinct: number };
  ages: { min: number; median: number; max: number; bands: { label: string; count: number }[] } | null;
  signups: {
    unit: "day" | "week";
    buckets: { key: string; label: string; count: number }[];
    last7Days: number;
  };
  allergies: {
    people: (PersonRef & { allergies: string })[];
    items: { label: string; count: number }[];
  };
  minors: (PersonRef & { guardianName: string | null; guardianContact: string | null; guardianConsent: boolean })[];
};

export function computeInsights(teams: TeamLite[], people: AdminParticipant[], now = new Date()): Insights {
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const ref = (p: AdminParticipant): PersonRef => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    age: p.age,
    teamName: p.teamId ? (teamName.get(p.teamId) ?? null) : null,
  });
  const byTeamThenName = (a: PersonRef, b: PersonRef) =>
    (a.teamName ?? "￿").localeCompare(b.teamName ?? "￿", "sk") ||
    a.lastName.localeCompare(b.lastName, "sk") ||
    a.firstName.localeCompare(b.firstName, "sk");

  const unassigned = people.filter((p) => !p.teamId);
  const hasFocus = (p: AdminParticipant, f: Focus) => p.focus.includes(f);

  // --- tímy -----------------------------------------------------------------
  const members = new Map<string, AdminParticipant[]>(teams.map((t) => [t.id, []]));
  for (const p of people) if (p.teamId) members.get(p.teamId)?.push(p);
  const teamSizes = teams.map((t) => members.get(t.id)?.length ?? 0);
  const nonEmptySizes = teamSizes.filter((n) => n > 0);

  const sizes: { size: number; count: number }[] = [];
  // 0 = prázdny tím (napr. po presunoch); tímy nad maximom admin nedovolí, ale pre istotu sa zarátajú do max
  for (let s = 0; s <= EVENT.team.max; s++)
    sizes.push({ size: s, count: teamSizes.filter((n) => (s === EVENT.team.max ? n >= s : n === s)).length });

  const coverageTeams = teams.map((t) => {
    const list = members.get(t.id) ?? [];
    const counts = Object.fromEntries(ROLES.map((r) => [r, list.filter((p) => hasFocus(p, r)).length])) as Record<Role, number>;
    return { id: t.id, name: t.name, size: list.length, counts };
  });
  const summary = Object.fromEntries(
    ROLES.map((r) => [
      r,
      {
        teamsMissing: coverageTeams.filter((t) => t.size > 0 && t.counts[r] === 0).length,
        unassigned: unassigned.filter((p) => hasFocus(p, r)).length,
      },
    ]),
  ) as Insights["coverage"]["summary"];

  // --- zameranie, školy, vek --------------------------------------------------
  const focus = FOCUS_OPTIONS.map((f) => ({
    key: f,
    label: FOCUS_LABELS[f],
    total: people.filter((p) => hasFocus(p, f)).length,
    unassigned: unassigned.filter((p) => hasFocus(p, f)).length,
  })).sort((a, b) => b.total - a.total || FOCUS_OPTIONS.indexOf(a.key) - FOCUS_OPTIONS.indexOf(b.key));

  const schoolTypes = SCHOOL_TYPES.map((k) => ({
    key: k,
    label: SCHOOL_TYPE_LABELS[k],
    count: people.filter((p) => p.schoolType === k).length,
  }));

  // „UKF Nitra“ a „ukf  nitra“ sú tá istá škola; zobrazí sa najčastejší zápis
  const schoolGroups = new Map<string, Map<string, number>>();
  for (const p of people) {
    const spelled = p.schoolName.trim().replace(/\s+/g, " ");
    const key = spelled.toLocaleLowerCase("sk");
    const variants = schoolGroups.get(key) ?? new Map<string, number>();
    variants.set(spelled, (variants.get(spelled) ?? 0) + 1);
    schoolGroups.set(key, variants);
  }
  const schoolsAll = [...schoolGroups.values()]
    .map((variants) => {
      const [name] = [...variants.entries()].sort((a, b) => b[1] - a[1])[0];
      const count = [...variants.values()].reduce((s, n) => s + n, 0);
      return { name, count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "sk"));

  const agesSorted = people.map((p) => p.age).sort((a, b) => a - b);
  const ages = agesSorted.length
    ? {
        min: agesSorted[0],
        max: agesSorted[agesSorted.length - 1],
        median: median(agesSorted),
        bands: AGE_BANDS.map((b) => ({ label: b.label, count: agesSorted.filter((a) => a >= b.from && a <= b.to).length })),
      }
    : null;

  // --- alergie ----------------------------------------------------------------
  const allergyPeople = people
    .filter((p) => !!p.allergies)
    .map((p) => ({ ...ref(p), allergies: p.allergies! }))
    .sort(byTeamThenName);

  // orientačný súhrn: formulár radí písať položky oddelené čiarkou („orechy, laktóza“)
  const itemCounts = new Map<string, number>();
  for (const p of allergyPeople) {
    const items = new Set(
      p.allergies
        .split(/[,;\n/+]+|\s+a\s+/)
        .map((s) => s.trim().replace(/[.!]+$/, "").replace(/\s+/g, " ").toLocaleLowerCase("sk"))
        .filter((s) => s.length > 0 && !NO_ALLERGY.test(s)),
    );
    for (const item of items) itemCounts.set(item, (itemCounts.get(item) ?? 0) + 1);
  }
  const allergyItems = [...itemCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "sk"));

  // --- mladiství --------------------------------------------------------------
  const minors = people
    .filter((p) => p.age < ADULT_AGE)
    .map((p) => ({
      ...ref(p),
      guardianName: p.guardianName,
      guardianContact: p.guardianContact,
      guardianConsent: p.guardianConsent,
    }))
    .sort(byTeamThenName);

  return {
    totals: {
      participants: people.length,
      teams: teams.length,
      unassigned: unassigned.length,
      minors: minors.length,
      allergies: allergyPeople.length,
      withoutEmail: people.filter((p) => !p.email).length,
    },
    teamHealth: {
      belowMin: teamSizes.filter((n) => n < EVENT.team.min).length,
      full: teamSizes.filter((n) => n >= EVENT.team.max).length,
      avgSize: nonEmptySizes.length ? nonEmptySizes.reduce((s, n) => s + n, 0) / nonEmptySizes.length : null,
      sizes,
    },
    coverage: { roles: ROLES.map((r) => ({ key: r, label: FOCUS_LABELS[r] })), teams: coverageTeams, summary },
    focus,
    schoolTypes,
    schools: { top: schoolsAll.slice(0, 10), distinct: schoolsAll.length },
    ages,
    signups: signupBuckets(people.map((p) => p.createdAt), now),
    allergies: { people: allergyPeople, items: allergyItems },
    minors,
  };
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/* ---- registrácie v čase (deň v Europe/Bratislava) ---------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DAILY_BUCKETS = 14;
const MAX_DAILY_BUCKETS = 31;
const MAX_WEEKLY_BUCKETS = 26;
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit" });

/** "YYYY-MM-DD" kalendárneho dňa v Bratislave. */
const dayKey = (d: Date) => dayKeyFmt.format(d);
/** Deň ako UTC polnoc – na aritmetiku s dňami bez posunov letného času. */
const keyToUtc = (key: string) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
const utcToKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const shortLabel = (key: string) => `${Number(key.slice(8, 10))}. ${Number(key.slice(5, 7))}.`;

function signupBuckets(dates: Date[], now: Date): Insights["signups"] {
  const today = keyToUtc(dayKey(now));
  const last7Days = dates.filter((d) => keyToUtc(dayKey(d)) > today - 7 * DAY_MS).length;
  if (dates.length === 0) return { unit: "day", buckets: [], last7Days };

  const perDay = new Map<number, number>();
  for (const d of dates) {
    const k = keyToUtc(dayKey(d));
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  // aspoň MIN_DAILY_BUCKETS dní, aby jeden-dva dni neboli jeden obrovský stĺpec
  const first = Math.min(...perDay.keys(), today - (MIN_DAILY_BUCKETS - 1) * DAY_MS);
  const spanDays = Math.round((today - first) / DAY_MS) + 1;

  if (spanDays <= MAX_DAILY_BUCKETS) {
    const buckets = [];
    for (let t = first; t <= today; t += DAY_MS) {
      const key = utcToKey(t);
      buckets.push({ key, label: shortLabel(key), count: perDay.get(t) ?? 0 });
    }
    return { unit: "day", buckets, last7Days };
  }

  // dlhšie obdobie → týždne (pondelok–nedeľa), najviac posledných MAX_WEEKLY_BUCKETS
  const weekStart = (t: number) => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS;
  const perWeek = new Map<number, number>();
  for (const [t, n] of perDay) perWeek.set(weekStart(t), (perWeek.get(weekStart(t)) ?? 0) + n);
  const lastWeek = weekStart(today);
  const firstWeek = Math.max(weekStart(first), lastWeek - (MAX_WEEKLY_BUCKETS - 1) * 7 * DAY_MS);
  const buckets = [];
  for (let t = firstWeek; t <= lastWeek; t += 7 * DAY_MS) {
    const key = utcToKey(t);
    buckets.push({ key, label: `od ${shortLabel(key)}`, count: perWeek.get(t) ?? 0 });
  }
  return { unit: "week", buckets, last7Days };
}
