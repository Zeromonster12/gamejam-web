import type { Metadata } from "next";
import { Suspense } from "react";
import { getAdminInsights } from "@/lib/admin-data";
import { EVENT } from "@/lib/event";
import type { Insights } from "@/lib/insights";
import { ADULT_AGE } from "@/lib/validation";
import { Badge, h2, linkBtn, Stat } from "../_components/ui";

export const metadata: Metadata = { title: `Prehľad – Admin – ${EVENT.name}` };

/** /admin/prehlad – súhrn pre organizátorov: alergie, pokrytie rolí, vek, školy, registrácie v čase, mladiství. */
export default function InsightsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-6xl px-4 py-10">
          <p className="font-pixel text-sm uppercase text-grey" role="status">
            Načítavam prehľad…
          </p>
        </main>
      }
    >
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  // getAdminInsights() overuje session (DAL) – bez platnej session presmeruje na /admin/login
  const d = await getAdminInsights();
  const { totals, teamHealth } = d;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-4 border-violet pb-4">
        <div>
          <p className="font-pixel text-xs uppercase tracking-widest text-lime">{EVENT.name}</p>
          <h1 className="font-pixel text-3xl uppercase text-pink sm:text-4xl">Prehľad</h1>
          <p className="mt-1 text-xs text-grey">Súhrn registrácií pre organizátorov, aktuálny k času načítania stránky.</p>
        </div>
        <nav aria-label="Admin navigácia" className="flex flex-wrap gap-2">
          <a href="/admin" className={linkBtn} data-testid="back-to-admin">
            ← Správa tímov
          </a>
          <a href="/admin/export?type=diet" download className={linkBtn}>
            Export strava/alergie
          </a>
        </nav>
      </header>

      <section aria-labelledby="kpi-h">
        <h2 id="kpi-h" className="sr-only">
          Kľúčové čísla
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="insights-stats">
          <Stat label="Hráči" value={totals.participants} testId="ins-participants" />
          <Stat label="Tímy" value={totals.teams} testId="ins-teams" />
          <Stat label="Nepriradení sólisti" value={totals.unassigned} accent href="/admin#solo-h" testId="ins-unassigned" />
          <Stat label={`Tímy pod minimom (< ${EVENT.team.min})`} value={teamHealth.belowMin} accent testId="ins-below-min" />
          <Stat label="Priemerná veľkosť tímu" value={teamHealth.avgSize === null ? "—" : num(teamHealth.avgSize)} />
          <Stat label="Mladiství (< 18)" value={totals.minors} href="#mladistvi" testId="ins-minors" />
          <Stat label="S alergiami / stravou" value={totals.allergies} href="#alergie" testId="ins-allergies" />
          <Stat label="Bez e-mailu" value={totals.withoutEmail} testId="ins-no-email" />
        </dl>
      </section>

      <AllergiesSection allergies={d.allergies} />
      <CoverageSection coverage={d.coverage} />

      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="focus-h" className="flex flex-col gap-4" data-testid="focus-chart">
          <h2 id="focus-h" className={h2}>
            Zameranie hráčov
          </h2>
          <p className="text-xs text-grey">Hráč môže mať viac zameraní, súčet preto nesedí s počtom hráčov.</p>
          {totals.participants === 0 ? (
            <Empty />
          ) : (
            <BarList
              unit={PLAYERS}
              rows={d.focus.map((f) => ({
                label: f.label,
                value: f.total,
                note: f.unassigned ? `z toho ${f.unassigned} ${plural(f.unassigned, UNASSIGNED)}` : undefined,
              }))}
            />
          )}
        </section>

        <section aria-labelledby="sizes-h" className="flex flex-col gap-4" data-testid="team-sizes">
          <h2 id="sizes-h" className={h2}>
            Veľkosť tímov
          </h2>
          <p className="text-xs text-grey">
            Tím môže mať {EVENT.team.min}–{EVENT.team.max} hráčov. Plných tímov: {teamHealth.full}.
          </p>
          {totals.teams === 0 ? (
            <Empty>Zatiaľ žiadne tímy.</Empty>
          ) : (
            <BarList
              unit={TEAMS}
              rows={teamHealth.sizes
                .filter((s) => s.size > 0 || s.count > 0)
                .map((s) => ({
                  label: `${s.size} ${plural(s.size, PLAYERS)}`,
                  value: s.count,
                  note: s.size < EVENT.team.min ? "pod minimom" : s.size >= EVENT.team.max ? "plný tím" : undefined,
                }))}
            />
          )}
        </section>

        <section aria-labelledby="age-h" className="flex flex-col gap-4" data-testid="age-chart">
          <h2 id="age-h" className={h2}>
            Vek
          </h2>
          {d.ages === null ? (
            <Empty />
          ) : (
            <>
              <p className="text-xs text-grey">
                Najmladší <strong className="text-ink">{d.ages.min}</strong> · medián{" "}
                <strong className="text-ink">{num(d.ages.median)}</strong> · najstarší{" "}
                <strong className="text-ink">{d.ages.max}</strong>
              </p>
              <BarList unit={PLAYERS} rows={d.ages.bands.map((b) => ({ label: `${b.label} r.`, value: b.count }))} />
            </>
          )}
        </section>

        <section aria-labelledby="schools-h" className="flex flex-col gap-4" data-testid="schools">
          <h2 id="schools-h" className={h2}>
            Školy
          </h2>
          {totals.participants === 0 ? (
            <Empty />
          ) : (
            <>
              <BarList unit={PLAYERS} rows={d.schoolTypes.map((s) => ({ label: s.label, value: s.count }))} />
              <div className="overflow-x-auto border-2 border-dim">
                <table className="w-full text-left text-xs">
                  <caption className="bg-navy px-3 py-2 text-left font-pixel uppercase text-grey">
                    Najčastejšie školy ({d.schools.distinct} {plural(d.schools.distinct, SCHOOLS)} spolu)
                  </caption>
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">Škola</th>
                      <th scope="col">Hráči</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.schools.top.map((s) => (
                      <tr key={s.name} className="border-t border-dim">
                        <td className="px-3 py-1.5">{s.name}</td>
                        <td className="w-12 px-3 py-1.5 text-right font-pixel tabular-nums">{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      <SignupsSection signups={d.signups} />
      <MinorsSection minors={d.minors} />
    </main>
  );
}

/* ------------------------------------------------------------------ */

function AllergiesSection({ allergies }: { allergies: Insights["allergies"] }) {
  const { people, items } = allergies;
  return (
    <section id="alergie" aria-labelledby="alergie-h" className="flex scroll-mt-6 flex-col gap-4" data-testid="allergies">
      <h2 id="alergie-h" className={h2}>
        Strava a alergie <span className="text-grey">({people.length})</span>
      </h2>
      <p className="max-w-prose text-xs text-grey">
        Údaje o zdraví – len pre organizátorov a catering. Pre catering použi „Export strava/alergie“ (bez kontaktov),
        snímky obrazovky ďalej neposielaj.
      </p>
      {people.length === 0 ? (
        <Empty>Nikto zatiaľ neuviedol alergie ani špeciálnu stravu.</Empty>
      ) : (
        <>
          {items.length > 0 ? (
            <div>
              <h3 className="font-pixel text-xs uppercase text-grey">Najčastejšie položky (orientačne podľa textu)</h3>
              <ul className="mt-2 flex flex-wrap gap-2" data-testid="allergy-items">
                {items.slice(0, 20).map((i) => (
                  <li key={i.label} className="border-2 border-[var(--gold)] bg-window px-2 py-1 text-xs">
                    {i.label} <span className="font-pixel text-[var(--gold)]">×{i.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="overflow-x-auto border-2 border-dim">
            <table className="w-full min-w-[32rem] text-left text-xs" data-testid="allergies-table">
              <thead className="bg-navy font-pixel uppercase text-grey">
                <tr>
                  <th scope="col" className="px-3 py-2">Hráč</th>
                  <th scope="col" className="px-3 py-2">Tím</th>
                  <th scope="col" className="px-3 py-2">Vek</th>
                  <th scope="col" className="px-3 py-2">Alergie / strava</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-t border-dim align-top">
                    <td className="whitespace-nowrap px-3 py-1.5 font-bold">
                      {p.firstName} {p.lastName}
                    </td>
                    <td className="px-3 py-1.5">{p.teamName ?? <span className="text-grey">nepriradený</span>}</td>
                    <td className="px-3 py-1.5 tabular-nums">
                      {p.age} {p.age < ADULT_AGE ? <Badge tone="pink">&lt;{ADULT_AGE}</Badge> : null}
                    </td>
                    <td className="whitespace-pre-line break-words px-3 py-1.5 text-[var(--gold)]">{p.allergies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function CoverageSection({ coverage }: { coverage: Insights["coverage"] }) {
  const { roles, teams, summary } = coverage;
  return (
    <section aria-labelledby="coverage-h" className="flex flex-col gap-4" data-testid="coverage">
      <h2 id="coverage-h" className={h2}>
        Pokrytie rolí v tímoch
      </h2>
      <p className="max-w-prose text-xs text-grey">
        Koľko členov tímu uviedlo dané zameranie. Ružová <strong className="text-pink">0</strong> znamená, že rola v
        tíme chýba. Spodný riadok ukazuje nepriradených sólistov, ktorí by ju vedeli doplniť.
      </p>
      {teams.length === 0 ? (
        <Empty>Zatiaľ žiadne tímy.</Empty>
      ) : (
        <div className="overflow-x-auto border-2 border-dim">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="bg-navy font-pixel uppercase text-grey">
              <tr>
                <th scope="col" className="px-3 py-2">Tím</th>
                <th scope="col" className="px-3 py-2 text-right">Hráči</th>
                {roles.map((r) => (
                  <th key={r.key} scope="col" className="px-3 py-2 text-center">
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id} className="border-t border-dim" data-testid="coverage-row" data-team-name={t.name}>
                  <th scope="row" className="px-3 py-1.5 font-bold">
                    {t.name}
                  </th>
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums ${t.size < EVENT.team.min ? "text-pink" : ""}`}
                    title={t.size < EVENT.team.min ? "pod minimom" : undefined}
                  >
                    {t.size}/{EVENT.team.max}
                  </td>
                  {roles.map((r) => (
                    <td key={r.key} className="px-3 py-1.5 text-center tabular-nums" data-role={r.key}>
                      {t.counts[r.key] > 0 ? (
                        t.counts[r.key]
                      ) : (
                        <>
                          <strong className={t.size > 0 ? "text-pink" : "font-normal text-dim"}>0</strong>
                          <span className="sr-only"> – chýba</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-4 border-dim bg-window text-grey">
              <tr>
                <th scope="row" colSpan={2} className="px-3 py-1.5 text-left font-normal">
                  Tímov bez tejto roly
                </th>
                {roles.map((r) => (
                  <td key={r.key} className={`px-3 py-1.5 text-center tabular-nums ${summary[r.key].teamsMissing ? "text-pink" : ""}`}>
                    {summary[r.key].teamsMissing}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-dim">
                <th scope="row" colSpan={2} className="px-3 py-1.5 text-left font-normal">
                  Nepriradení s touto rolou
                </th>
                {roles.map((r) => (
                  <td key={r.key} className={`px-3 py-1.5 text-center tabular-nums ${summary[r.key].unassigned ? "text-lime" : ""}`}>
                    {summary[r.key].unassigned}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

function SignupsSection({ signups }: { signups: Insights["signups"] }) {
  const { buckets, unit, last7Days } = signups;
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const peak = buckets.reduce<(typeof buckets)[number] | null>((best, b) => (!best || b.count > best.count ? b : best), null);
  return (
    <section aria-labelledby="signups-h" className="flex flex-col gap-4" data-testid="signups">
      <h2 id="signups-h" className={h2}>
        Registrácie v čase
      </h2>
      <p className="text-xs text-grey">
        Prihlásení hráči {unit === "day" ? "podľa dňa" : "podľa týždňa (posledných 26 týždňov)"}. Za posledných 7 dní:{" "}
        <strong className="text-ink" data-testid="signups-7d">
          {last7Days}
        </strong>
        {peak && peak.count > 0 ? (
          <>
            {" "}
            · najviac {peak.count} {plural(peak.count, PLAYERS)} ({peak.label})
          </>
        ) : null}
      </p>
      {buckets.length === 0 ? (
        <Empty>Zatiaľ žiadne registrácie.</Empty>
      ) : (
        <figure className="flex flex-col gap-1">
          <div className="flex h-36 gap-2">
            <div className="flex w-6 flex-col justify-between text-right font-pixel text-[10px] text-grey" aria-hidden>
              <span>{max}</span>
              <span>0</span>
            </div>
            <ol className="flex h-full flex-1 items-end gap-[2px] border-b-2 border-l-2 border-dim">
              {buckets.map((b) => (
                <li
                  key={b.key}
                  className="group flex h-full min-w-0 max-w-12 flex-1 items-end"
                  title={`${b.label}: ${b.count} ${plural(b.count, PLAYERS)}`}
                >
                  <span
                    className="block w-full bg-lime group-hover:bg-pink"
                    style={{ height: `${(b.count / max) * 100}%`, minHeight: b.count > 0 ? 2 : 0 }}
                    aria-hidden
                  />
                  <span className="sr-only">
                    {b.label}: {b.count}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex justify-between pl-8 text-[10px] text-grey" aria-hidden>
            <span>{buckets[0].label}</span>
            {buckets.length > 1 ? <span>{buckets[buckets.length - 1].label}</span> : null}
          </div>
          <figcaption className="sr-only">
            Registrácie {unit === "day" ? "podľa dňa" : "podľa týždňa"}, spolu {total}.
          </figcaption>
        </figure>
      )}
    </section>
  );
}

function MinorsSection({ minors }: { minors: Insights["minors"] }) {
  return (
    <section id="mladistvi" aria-labelledby="minors-h" className="flex scroll-mt-6 flex-col gap-4" data-testid="minors">
      <h2 id="minors-h" className={h2}>
        Mladiství <span className="text-grey">({minors.length})</span>
      </h2>
      <p className="max-w-prose text-xs text-grey">
        Pri príchode treba od každého podpísaný súhlas zákonného zástupcu – zoznam na kontrolu pri registrácii na mieste.
      </p>
      {minors.length === 0 ? (
        <Empty>Žiadni hráči pod 18 rokov.</Empty>
      ) : (
        <div className="overflow-x-auto border-2 border-dim">
          <table className="w-full min-w-[40rem] text-left text-xs" data-testid="minors-table">
            <thead className="bg-navy font-pixel uppercase text-grey">
              <tr>
                <th scope="col" className="px-3 py-2">Hráč</th>
                <th scope="col" className="px-3 py-2">Vek</th>
                <th scope="col" className="px-3 py-2">Tím</th>
                <th scope="col" className="px-3 py-2">Zákonný zástupca</th>
                <th scope="col" className="px-3 py-2">Kontakt</th>
                <th scope="col" className="px-3 py-2">Súhlas vo formulári</th>
              </tr>
            </thead>
            <tbody>
              {minors.map((p) => (
                <tr key={p.id} className="border-t border-dim align-top">
                  <td className="whitespace-nowrap px-3 py-1.5 font-bold">
                    {p.firstName} {p.lastName}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{p.age}</td>
                  <td className="px-3 py-1.5">{p.teamName ?? <span className="text-grey">nepriradený</span>}</td>
                  <td className="px-3 py-1.5">{p.guardianName ?? "—"}</td>
                  <td className="break-words px-3 py-1.5">{p.guardianContact ?? "—"}</td>
                  <td className={`px-3 py-1.5 ${p.guardianConsent ? "text-lime" : "text-pink"}`}>
                    {p.guardianConsent ? "áno" : "chýba"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

type Forms = readonly [one: string, few: string, many: string];
const PLAYERS: Forms = ["hráč", "hráči", "hráčov"];
const TEAMS: Forms = ["tím", "tímy", "tímov"];
const SCHOOLS: Forms = ["škola", "školy", "škôl"];
const UNASSIGNED: Forms = ["nepriradený", "nepriradení", "nepriradených"];

/** Slovenské tvary: 1 hráč, 2–4 hráči, 0/5+ hráčov. */
function plural(n: number, [one, few, many]: Forms): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

const num = (n: number) => n.toLocaleString("sk-SK", { maximumFractionDigits: 1 });

function Empty({ children = "Zatiaľ žiadne registrácie." }: { children?: React.ReactNode }) {
  return <p className="text-sm text-grey">{children}</p>;
}

/** Vodorovné stĺpce (jedna séria, jedna farba) – číslo je vždy vypísané, stĺpec len pomáha porovnať. */
function BarList({ rows, unit }: { rows: { label: string; value: number; note?: string }[]; unit: Forms }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li
          key={r.label}
          className="grid grid-cols-[minmax(0,11rem)_1fr_2.5rem] items-center gap-3 text-xs"
          title={`${r.label}: ${r.value} ${plural(r.value, unit)}${r.note ? ` (${r.note})` : ""}`}
        >
          <span className="min-w-0 text-ink">
            {r.label}
            {r.note ? <span className="block text-grey">{r.note}</span> : null}
          </span>
          <span className="h-3 bg-window" aria-hidden>
            <span className="block h-full bg-lime" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-right font-pixel text-sm tabular-nums text-ink">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}
