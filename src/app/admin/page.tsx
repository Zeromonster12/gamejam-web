import { Suspense } from "react";
import {
  assignParticipant,
  createTeamFromParticipants,
  deleteParticipant,
  deleteTeam,
  logoutAction,
  renameTeam,
  setLeader,
  updateTeamNotes,
  wipeAllData,
} from "@/app/actions/admin";
import { getAdminOverview, type AdminParticipant, type AdminTeam } from "@/lib/admin-data";
import type { AuditEntry } from "@/lib/maintenance";
import { EVENT } from "@/lib/event";
import { isRegistrationOpen } from "@/lib/registration-status";
import { ADULT_AGE, FOCUS_LABELS, SCHOOL_TYPE_LABELS } from "@/lib/validation";
import { ActionForm, SubmitButton } from "./_components/action-form";
import { ConfirmSubmit } from "./_components/confirm-submit";
import { ToggleAll } from "./_components/toggle-all";
import { Badge, card, h2, input, linkBtn, Stat } from "./_components/ui";

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Dashboard />
    </Suspense>
  );
}

function AdminLoading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="font-pixel text-sm uppercase text-grey" role="status">
        Načítavam admin…
      </p>
    </main>
  );
}

async function Dashboard() {
  // getAdminOverview() overuje session (DAL) – bez platnej session presmeruje na /admin/login
  const data = await getAdminOverview();
  const open = isRegistrationOpen();
  const retention = data.retention.deadline;
  const retentionOver = data.retention.over;
  const teamOptions = data.teams.map((t) => ({ id: t.id, label: `${t.name} (${t.members.length}/${EVENT.team.max})` }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-4 border-violet pb-4">
        <div>
          <p className="font-pixel text-xs uppercase tracking-widest text-lime">{EVENT.name}</p>
          <h1 className="font-pixel text-3xl uppercase text-pink sm:text-4xl">Admin panel</h1>
          <p className="mt-1 text-xs text-grey">
            Registrácia je{" "}
            <strong className={open ? "text-lime" : "text-pink"}>{open ? "otvorená" : "uzavretá"}</strong> (premenná
            REGISTRATION_OPEN).
          </p>
        </div>
        <nav aria-label="Admin akcie" className="flex flex-wrap gap-2">
          <a href="/admin/prehlad" className={`${linkBtn} border-lime`} data-testid="insights-link">
            Prehľad a alergie
          </a>
          <a href="/admin/export" download className={linkBtn} data-testid="export-all">
            Export CSV
          </a>
          <a href="/admin/export?type=diet" download className={linkBtn}>
            Export strava/alergie
          </a>
          <form action={logoutAction}>
            <button type="submit" className={linkBtn} data-testid="logout">
              Odhlásiť
            </button>
          </form>
        </nav>
      </header>

      {retentionOver ? (
        <div role="alert" className="border-4 border-pink bg-shadow p-4 text-sm" data-testid="retention-banner">
          <p className="font-pixel uppercase text-pink">Uplynula lehota uchovávania údajov</p>
          <p className="mt-1">
            Formulár sľubuje vymazanie údajov do 3 mesiacov po evente (do {fmtDate.format(retention)}). Stiahni, čo ešte
            potrebuješ, a v Danger zone nižšie vymaž všetky dáta.
          </p>
        </div>
      ) : (
        <p className="text-xs text-grey" data-testid="retention-info">
          Lehota uchovávania údajov: do {fmtDate.format(retention)} (3 mesiace po evente) – potom vymaž dáta v Danger
          zone.
        </p>
      )}

      <section aria-labelledby="stats-h">
        <h2 id="stats-h" className="sr-only">
          Prehľad
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="stats">
          <Stat label="Tímy" value={data.stats.teams} testId="stat-teams" />
          <Stat label="Hráči" value={data.stats.participants} testId="stat-participants" />
          <Stat label="Nepriradení sólisti" value={data.stats.unassigned} accent testId="stat-unassigned" />
          <Stat label="Mladiství (súhlas zástupcu)" value={data.stats.minors} testId="stat-minors" />
          <Stat label="S alergiami" value={data.stats.allergies} testId="stat-allergies" href="/admin/prehlad#alergie" />
        </dl>
      </section>

      <SoloSection solo={data.solo} teamOptions={teamOptions} />

      <section aria-labelledby="teams-h" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="teams-h" className={h2}>
            Tímy <span className="text-grey">({data.teams.length})</span>
          </h2>
          {data.teams.length > 0 ? <ToggleAll targetId="team-list" /> : null}
        </div>
        {data.teams.length === 0 ? <p className="text-sm text-grey">Zatiaľ žiadne tímy.</p> : null}
        <div id="team-list" className="grid gap-4">
          {data.teams.map((t) => (
            <TeamCard key={t.id} team={t} teamOptions={teamOptions} />
          ))}
        </div>
      </section>

      <section aria-labelledby="audit-h" className="flex flex-col gap-3" data-testid="audit-log">
        <h2 id="audit-h" className={h2}>
          Audit log
        </h2>
        <p className="text-xs text-grey">
          Bez osobných údajov – „zariadenie“ je skrátený HMAC odtlačok IP adresy (po 30 dňoch sa anonymizuje).
          Neúspešné prihlásenia sú zvlášť, aby ich záplava nevytlačila akcie organizátorov.
        </p>
        <h3 className="font-pixel text-xs uppercase text-grey">
          Akcie organizátorov <span className="normal-case">(posledných {data.audit.actions.length})</span>
        </h3>
        <AuditTable entries={data.audit.actions} testId="audit-actions" />
        <h3 className="mt-2 font-pixel text-xs uppercase text-grey">Neúspešné prihlásenia</h3>
        <p className="text-xs" data-testid="audit-failed-24h">
          Za posledných 24 h:{" "}
          <strong className={data.audit.failedLast24h.attempts > 0 ? "text-pink" : "text-ink"}>
            {data.audit.failedLast24h.attempts}
          </strong>{" "}
          neúspešných pokusov z {data.audit.failedLast24h.sources} zariadení/IP. Opakované a zablokované pokusy sa do
          zoznamu nižšie zapisujú najviac raz za okno.
        </p>
        <AuditTable entries={data.audit.failures} testId="audit-failures" />
      </section>

      <section aria-labelledby="danger-h" className="border-4 border-[var(--red)] bg-shadow p-4 sm:p-6">
        <h2 id="danger-h" className="font-pixel text-xl uppercase text-pink">
          Danger zone
        </h2>
        <p className="mt-2 max-w-prose text-sm text-grey">
          Po skončení eventu (a vyhodnotení) vymaž všetky osobné údaje – registrácie, tímy, hráčov aj záznamy o
          prihláseniach. Akcia je nevratná. Najprv si stiahni export, ak ho ešte potrebuješ.
        </p>
        <ActionForm action={wipeAllData} className="mt-4 flex flex-wrap items-end gap-3" testId="wipe-form">
          <label className="flex flex-col gap-1 text-xs text-grey">
            Pre potvrdenie napíš <strong className="text-ink">VYMAZAŤ</strong>
            <input name="confirmText" autoComplete="off" required className={input} />
          </label>
          <SubmitButton variant="danger">Vymazať všetky dáta</SubmitButton>
        </ActionForm>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function SoloSection({ solo, teamOptions }: { solo: AdminParticipant[]; teamOptions: { id: string; label: string }[] }) {
  return (
    <section aria-labelledby="solo-h" className="flex flex-col gap-4" data-testid="solo-section">
      <h2 id="solo-h" className={h2}>
        Sólisti / nepriradení <span className="text-grey">({solo.length})</span>
      </h2>
      {solo.length === 0 ? (
        <p className="text-sm text-grey">Všetci hráči sú v tímoch.</p>
      ) : (
        <>
          <ActionForm
            action={createTeamFromParticipants}
            id="create-team-form"
            className="flex flex-col gap-3 border-2 border-lime bg-window p-4 shadow-[4px_4px_0_var(--shadow)]"
            testId="create-team-form"
          >
            <p className="text-sm">
              Zaškrtni hráčov nižšie (max. {EVENT.team.max}) a vytvor z nich nový tím, alebo každého priraď do
              existujúceho tímu.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-grey">
                Názov nového tímu
                <input name="name" required minLength={2} maxLength={40} className={input} />
              </label>
              <SubmitButton variant="primary">Vytvoriť tím z vybraných</SubmitButton>
            </div>
          </ActionForm>
          <ul className="grid gap-3 md:grid-cols-2">
            {solo.map((p) => (
              <li key={p.id} className={card} data-testid="solo-card" data-email={p.email ?? ""}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="participantIds[]"
                    value={p.id}
                    form="create-team-form"
                    aria-label={`Vybrať ${p.firstName} ${p.lastName} do nového tímu`}
                    className="mt-1 size-5 accent-lime"
                  />
                  <PersonDetails p={p} />
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t-2 border-dim pt-3">
                  <MoveForm participant={p} teamOptions={teamOptions} />
                  <DeletePersonForm participant={p} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function TeamCard({ team, teamOptions }: { team: AdminTeam; teamOptions: { id: string; label: string }[] }) {
  const full = team.members.length >= EVENT.team.max;
  const tooSmall = team.members.length < EVENT.team.min;
  const minors = team.members.filter((p) => p.age < ADULT_AGE).length;
  const allergies = team.members.filter((p) => p.allergies).length;
  // zbalený tím (predvolene) – v hlavičke ostane súhrn, detail sa rozbalí kliknutím; atribút `open`
  // nenastavujeme z Reactu, aby rozbalenie prežilo refresh po server action (viď ToggleAll)
  return (
    <details
      className="group border-4 border-violet bg-window shadow-[6px_6px_0_var(--shadow)]"
      data-collapsible
      data-testid="team-card"
      data-team-name={team.name}
    >
      <summary
        className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 bg-navy px-4 py-3 outline-none group-open:border-b-4 group-open:border-violet focus-visible:ring-4 focus-visible:ring-lime [&::-webkit-details-marker]:hidden [&:hover_h3]:text-lime"
        data-testid="team-summary"
      >
        <span aria-hidden className="font-pixel text-xs text-lime transition-transform group-open:rotate-90">
          ▶
        </span>
        <h3 id={`team-${team.id}`} className="min-w-0 font-pixel text-lg uppercase text-ink">
          {team.name}
        </h3>
        <span className="ml-auto flex flex-wrap gap-2">
          <Badge tone={team.origin === "admin" ? "lime" : "violet"}>
            {team.origin === "admin" ? "vytvoril admin" : "registrácia"}
          </Badge>
          <Badge tone={tooSmall ? "pink" : full ? "lime" : "grey"}>
            <span data-testid="team-size">
              {team.members.length}/{EVENT.team.max}
            </span>{" "}
            hráčov
          </Badge>
          {minors ? <Badge tone="pink">&lt;18: {minors}</Badge> : null}
          {allergies ? <Badge tone="gold">alergie: {allergies}</Badge> : null}
          {team.notes ? <Badge tone="grey">poznámka</Badge> : null}
        </span>
        {/* zoznam mien len v zbalenom stave – rýchly prehľad bez rozbaľovania */}
        <span className="w-full truncate pl-6 text-xs text-grey group-open:hidden" data-testid="team-members-preview">
          {team.members.length === 0
            ? "bez členov"
            : team.members.map((p) => `${p.firstName} ${p.lastName}${p.isLeader ? " (kapitán)" : ""}`).join(" · ")}
        </span>
      </summary>

      <div className="grid gap-3 p-4">
        {team.members.length === 0 ? <p className="text-sm text-grey">Tím nemá žiadnych členov.</p> : null}
        <ul className="grid gap-3 lg:grid-cols-2">
          {team.members.map((p) => (
            <li key={p.id} className={card} data-testid="member-card" data-email={p.email ?? ""}>
              <PersonDetails p={p} />
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t-2 border-dim pt-3">
                <MoveForm participant={p} teamOptions={teamOptions} />
                {!p.isLeader ? (
                  <ActionForm action={setLeader}>
                    <input type="hidden" name="participantId" value={p.id} />
                    <SubmitButton>Spraviť kapitánom</SubmitButton>
                  </ActionForm>
                ) : null}
                <DeletePersonForm participant={p} />
              </div>
            </li>
          ))}
        </ul>

        <div className="grid gap-4 border-t-4 border-dim pt-4 md:grid-cols-2">
          <ActionForm action={updateTeamNotes} className="flex flex-col gap-2">
            <input type="hidden" name="teamId" value={team.id} />
            <label className="flex flex-col gap-1 text-xs text-grey">
              Poznámky organizátorov
              <textarea name="notes" defaultValue={team.notes ?? ""} maxLength={2000} rows={3} className={input} />
            </label>
            <SubmitButton className="self-start">Uložiť poznámku</SubmitButton>
          </ActionForm>

          <div className="flex flex-col gap-4">
            <ActionForm action={renameTeam} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="teamId" value={team.id} />
              <label className="flex flex-col gap-1 text-xs text-grey">
                Premenovať tím
                <input name="name" defaultValue={team.name} required minLength={2} maxLength={40} className={input} />
              </label>
              <SubmitButton>Premenovať</SubmitButton>
            </ActionForm>

            <ActionForm action={deleteTeam} className="flex flex-col gap-2" testId="delete-team-form">
              <input type="hidden" name="teamId" value={team.id} />
              <fieldset className="flex flex-col gap-1 text-xs text-grey">
                <legend className="mb-1">Zmazať tím – čo s členmi?</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="members" value="unassign" defaultChecked className="accent-lime" />
                  presunúť medzi nepriradených
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="members" value="delete" className="accent-pink" />
                  zmazať aj členov (ich osobné údaje)
                </label>
              </fieldset>
              <ConfirmSubmit label="Zmazať tím" confirmLabel="Áno, zmazať tím" testId="delete-team" />
            </ActionForm>
          </div>
        </div>
      </div>
    </details>
  );
}

function PersonDetails({ p }: { p: AdminParticipant }) {
  const minor = p.age < ADULT_AGE;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold text-ink">
          {p.firstName} {p.lastName}
        </p>
        {p.isLeader ? <Badge tone="lime">kapitán</Badge> : null}
        {p.origin === "solo" ? <Badge tone="violet">sólo</Badge> : null}
        {minor ? <Badge tone="pink">&lt;18</Badge> : null}
        {p.allergies ? <Badge tone="gold">alergie</Badge> : null}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <Dt>Vek</Dt>
        <Dd>{p.age}</Dd>
        <Dt>Škola</Dt>
        <Dd>
          {p.schoolName} <span className="text-grey">({SCHOOL_TYPE_LABELS[p.schoolType]})</span>
        </Dd>
        <Dt>Zameranie</Dt>
        <Dd>
          {p.focus.map((f) => FOCUS_LABELS[f as keyof typeof FOCUS_LABELS] ?? f).join(", ")}
          {p.focusNote ? <span className="block text-grey">{p.focusNote}</span> : null}
        </Dd>
        <Dt>E-mail</Dt>
        <Dd>{p.email ? <a className="underline decoration-dim hover:text-lime" href={`mailto:${p.email}`}>{p.email}</a> : "—"}</Dd>
        <Dt>Alergie</Dt>
        <Dd className={p.allergies ? "text-[var(--gold)]" : ""}>{p.allergies ?? "—"}</Dd>
        {minor ? (
          <>
            <Dt>Zástupca</Dt>
            <Dd>
              {p.guardianName ?? "—"}
              {p.guardianContact ? <span className="block">{p.guardianContact}</span> : null}
              <span className={`block ${p.guardianConsent ? "text-lime" : "text-pink"}`}>
                {p.guardianConsent ? "súhlas udelený vo formulári" : "chýba súhlas"} – na mieste treba podpísaný súhlas
              </span>
            </Dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

function MoveForm({ participant, teamOptions }: { participant: AdminParticipant; teamOptions: { id: string; label: string }[] }) {
  const options = teamOptions.filter((t) => t.id !== participant.teamId);
  return (
    <ActionForm action={assignParticipant} className="flex flex-wrap items-end gap-2" testId="move-form">
      <input type="hidden" name="participantId" value={participant.id} />
      <label className="flex flex-col gap-1 text-xs text-grey">
        {participant.teamId ? "Presunúť do" : "Priradiť do tímu"}
        <select name="teamId" required defaultValue="" className={input}>
          <option value="" disabled>
            — vyber —
          </option>
          {participant.teamId ? <option value="none">medzi nepriradených</option> : null}
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton>{participant.teamId ? "Presunúť" : "Priradiť"}</SubmitButton>
    </ActionForm>
  );
}

function DeletePersonForm({ participant }: { participant: AdminParticipant }) {
  return (
    <ActionForm action={deleteParticipant} className="ml-auto">
      <input type="hidden" name="participantId" value={participant.id} />
      <ConfirmSubmit label="Zmazať" confirmLabel="Áno, zmazať hráča" testId="delete-person" />
    </ActionForm>
  );
}

/* ------------------------------------------------------------------ */

const fmtDate = new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava", dateStyle: "long" });
const fmtDateTime = new Intl.DateTimeFormat("sk-SK", {
  timeZone: "Europe/Bratislava",
  dateStyle: "short",
  timeStyle: "medium",
});

function AuditTable({ entries, testId }: { entries: AuditEntry[]; testId: string }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-grey" data-testid={testId}>
        Zatiaľ žiadne záznamy.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto border-2 border-dim">
      <table className="w-full min-w-[28rem] text-left text-xs" data-testid={testId}>
        <thead className="bg-navy font-pixel uppercase text-grey">
          <tr>
            <th scope="col" className="px-3 py-2">Čas</th>
            <th scope="col" className="px-3 py-2">Akcia</th>
            <th scope="col" className="px-3 py-2">Zariadenie</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((a) => (
            <tr key={a.id} className="border-t border-dim" data-action={a.action}>
              <td className="whitespace-nowrap px-3 py-1.5 text-grey">{fmtDateTime.format(a.createdAt)}</td>
              <td className="px-3 py-1.5">{a.label}</td>
              <td className="px-3 py-1.5 font-mono text-grey">{a.ip}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-grey">{children}</dt>;
}
function Dd({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <dd className={`min-w-0 break-words ${className}`}>{children}</dd>;
}
