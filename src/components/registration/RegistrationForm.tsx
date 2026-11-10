"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { flushSync } from "react-dom";
import { getFormToken, registerAction } from "@/app/actions/register";
import { EVENT } from "@/lib/event";
import { registrationSchema, toFieldErrors, type RegisterResult, type RegistrationInput } from "@/lib/validation";
import { PixelWindow } from "@/components/PixelWindow";
import { CheckField, TextField, fieldId } from "./controls";
import { PersonCard } from "./PersonCard";
import { PERSON_KEYS, emptyPerson, hasAllergies, isMinor, personInput, type Person } from "./person";
import { Success } from "./Success";

type Member = { id: number; p: Person };
type FormState = {
  solo: boolean;
  teamName: string;
  leader: Person;
  members: Member[];
  gdprConsent: boolean;
  healthConsent: boolean;
  website: string;
};

const initialForm = (): FormState => ({
  solo: false,
  teamName: "",
  leader: emptyPerson(),
  members: [],
  gdprConsent: false,
  healthConsent: false,
  website: "",
});

const MAX_MEMBERS = EVENT.team.max - 1;
const HIDDEN_KEYS = new Set(["website", "formToken"]);

function peopleOf(f: FormState) {
  return f.solo ? [f.leader] : [f.leader, ...f.members.map((m) => m.p)];
}

function buildInput(f: FormState, formToken: string): RegistrationInput {
  const base = {
    leader: personInput(f.leader),
    gdprConsent: f.gdprConsent,
    healthConsent: peopleOf(f).some(hasAllergies) ? f.healthConsent : undefined,
    website: f.website,
    formToken,
  };
  const input = f.solo
    ? { mode: "solo" as const, ...base }
    : { mode: "team" as const, teamName: f.teamName, members: f.members.map((m) => personInput(m.p)), ...base };
  return input as RegistrationInput;
}

function validate(f: FormState, formToken: string) {
  const r = registrationSchema.safeParse(buildInput(f, formToken || "-"));
  const out = r.success ? {} : toFieldErrors(r.error);
  if (r.success) return out;
  // zod spúšťa doplnkové pravidlá (superRefine) až keď prejde zvyšok objektu –
  // aby používateľ videl všetky chyby naraz, doplníme ich rovnakými hláškami.
  // Zdrojom pravdy ostáva schéma (a server).
  const people = [
    { prefix: "leader", p: f.leader },
    ...(f.solo ? [] : f.members.map((m, i) => ({ prefix: `members.${i}`, p: m.p }))),
  ];
  const add = (k: string, msg: string) => {
    if (!out[k]) out[k] = msg;
  };
  for (const { prefix, p } of people) {
    if (!isMinor(p)) continue;
    if (!p.guardianName.trim()) add(`${prefix}.guardianName`, "Pri veku pod 18 rokov vyplň meno zákonného zástupcu");
    if (!p.guardianContact.trim())
      add(`${prefix}.guardianContact`, "Pri veku pod 18 rokov vyplň kontakt (telefón alebo e-mail) na zákonného zástupcu");
    if (!p.guardianConsent) add(`${prefix}.guardianConsent`, "Zákonný zástupca musí s účasťou súhlasiť");
  }
  if (peopleOf(f).some(hasAllergies) && !f.healthConsent)
    add("healthConsent", "Ak uvádzaš alergie, potrebujeme výslovný súhlas so spracovaním týchto údajov");
  return out;
}

/** Hodnota v objekte podľa cesty „members.1.email“. */
function at(obj: unknown, path: string): string {
  let cur: unknown = obj;
  for (const k of path.split(".")) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined;
  return JSON.stringify(cur ?? null);
}

/** Ľudský názov poľa pre súhrn chýb. */
function where(path: string) {
  if (path === "teamName") return "Tím";
  if (path === "members") return "Tím";
  if (path === "gdprConsent" || path === "healthConsent") return "Súhlasy";
  if (path === "_form") return "Formulár";
  if (path.startsWith("leader.")) return "Player 1";
  const m = /^members\.(\d+)/.exec(path);
  if (m) return `Player ${Number(m[1]) + 2}`;
  return "";
}

type Snap = { form: FormState; checked: FormState | null };
type ServerErr = { error?: string; fieldErrors: Record<string, string>; submitted: FormState };

/** `formToken` = podpísaný čas otvorenia formulára od servera (src/lib/form-token.ts). */
export function RegistrationForm({ formToken }: { formToken: string }) {
  const [snap, setSnap] = useState<Snap>(() => ({ form: initialForm(), checked: null }));
  const [nextId, setNextId] = useState(1);
  const [server, setServer] = useState<ServerErr | null>(null);
  const [result, setResult] = useState<Extract<RegisterResult, { ok: true }> | null>(null);
  const [pending, startTransition] = useTransition();
  const token = useRef(formToken);
  const submitting = useRef(false);
  const pointerDown = useRef(false);
  const checkAfterPointer = useRef(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const joinRef = useRef<HTMLButtonElement>(null);

  const f = snap.form;

  useEffect(() => {
    const down = () => {
      pointerDown.current = true;
    };
    const up = () => {
      pointerDown.current = false;
      if (!checkAfterPointer.current) return;
      checkAfterPointer.current = false;
      // až po dokončení kliku (click beží v tej istej úlohe ako pointerup)
      window.setTimeout(() => setSnap((s) => (s.checked ? { ...s, checked: s.form } : s)), 0);
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, []);

  /* ---------- chyby: klientske (zo snapshotu pri blur/odoslaní) + serverové ---------- */
  const clientErrors = useMemo(() => (snap.checked ? validate(snap.checked, "-") : {}), [snap.checked]);

  const errors = useMemo(() => {
    const out: Record<string, string> = { ...clientErrors };
    if (server) {
      const nowInput = buildInput(f, "-");
      const thenInput = buildInput(server.submitted, "-");
      for (const [k, v] of Object.entries(server.fieldErrors)) {
        // serverová chyba zmizne, keď používateľ dané pole zmení
        if (!out[k] && at(nowInput, k) === at(thenInput, k)) out[k] = v;
      }
    }
    // chyby polí, ktoré práve nie sú vo formulári, nezobrazujeme
    const people = [
      { prefix: "leader", p: f.leader },
      ...(f.solo ? [] : f.members.map((m, i) => ({ prefix: `members.${i}`, p: m.p }))),
    ];
    for (const { prefix, p } of people) {
      if (!isMinor(p)) for (const k of ["guardianName", "guardianContact", "guardianConsent"]) delete out[`${prefix}.${k}`];
    }
    for (const k of HIDDEN_KEYS) delete out[k];
    return out;
  }, [clientErrors, server, f]);

  const order = useMemo(() => {
    const keys = ["_form", "teamName", ...PERSON_KEYS.map((k) => `leader.${k}`)];
    f.members.forEach((_, i) => keys.push(...PERSON_KEYS.map((k) => `members.${i}.${k}`)));
    keys.push("members", "healthConsent", "gdprConsent");
    return keys;
  }, [f.members]);

  const errorList = useMemo(() => {
    const keys = Object.keys(errors);
    return keys
      .sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999))
      .map((k) => ({ key: k, msg: errors[k], where: where(k) }));
  }, [errors, order]);

  /* ---------- úpravy stavu ---------- */
  const update = (fn: (f: FormState) => FormState) => setSnap((s) => ({ ...s, form: fn(s.form) }));
  /**
   * Po prvom pokuse o odoslanie: prevaliduj pri opustení poľa.
   * Ak blur vznikol stlačením myši/prsta, počkáme na jeho uvoľnenie – inak by
   * zmena chýb posunula layout pod kurzorom a klik by trafil vedľa.
   */
  const recheck = () => {
    if (pointerDown.current) {
      checkAfterPointer.current = true;
      return;
    }
    setSnap((s) => (s.checked ? { ...s, checked: s.form } : s));
  };

  const setLeader = (patch: Partial<Person>) => update((x) => ({ ...x, leader: { ...x.leader, ...patch } }));
  const setMember = (id: number, patch: Partial<Person>) =>
    update((x) => ({ ...x, members: x.members.map((m) => (m.id === id ? { ...m, p: { ...m.p, ...patch } } : m)) }));

  function addMember() {
    if (f.members.length >= MAX_MEMBERS) return;
    const id = nextId;
    flushSync(() => {
      setNextId(id + 1);
      update((x) => ({ ...x, members: [...x.members, { id, p: emptyPerson() }] }));
    });
    document.getElementById(fieldId(`members.${f.members.length}.firstName`))?.focus();
  }

  function removeMember(id: number) {
    flushSync(() => {
      update((x) => ({ ...x, members: x.members.filter((m) => m.id !== id) }));
      recheck();
    });
    joinRef.current?.focus();
  }

  function focusField(key: string) {
    const el = document.getElementById(fieldId(key)) ?? (key === "members" ? joinRef.current : null);
    if (!el) return;
    const target =
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement
        ? el
        : el.querySelector<HTMLElement>("input, textarea, button");
    target?.focus();
    el.scrollIntoView({ block: "center", behavior: "auto" });
  }

  /* ---------- odoslanie ---------- */
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || submitting.current) return;
    const current = f;
    const errs = validate(current, token.current);
    flushSync(() => {
      setSnap((s) => ({ ...s, checked: s.form }));
      setServer(null);
    });
    const visible = Object.keys(errs).filter((k) => !HIDDEN_KEYS.has(k));
    if (visible.length > 0) {
      summaryRef.current?.focus();
      return;
    }
    submitting.current = true;
    startTransition(async () => {
      let res: RegisterResult;
      try {
        res = await registerAction(buildInput(current, token.current));
      } catch {
        res = { ok: false, error: "Spojenie so serverom zlyhalo. Skontroluj internet a skús to znova." };
      }
      submitting.current = false;
      if (res.ok) {
        setResult(res);
        return;
      }
      setServer({ error: res.error, fieldErrors: res.fieldErrors ?? {}, submitted: current });
      requestAnimationFrame(() => summaryRef.current?.focus());
    });
  }

  function reset() {
    flushSync(() => {
      setSnap({ form: initialForm(), checked: null });
      setServer(null);
      setResult(null);
    });
    // nový formulár = nový token (starý by mal čas otvorenia predchádzajúceho formulára)
    getFormToken()
      .then((t) => {
        token.current = t;
      })
      .catch(() => {});
    document.getElementById("registracia")?.scrollIntoView({ block: "start" });
    document.querySelector<HTMLElement>("[data-first-field]")?.focus({ preventScroll: true });
  }

  if (result) return <Success result={result} onAgain={reset} />;

  const anyAllergies = peopleOf(f).some(hasAllergies);
  const showSummary = errorList.length > 0 || !!server?.error;
  const teamCount = 1 + f.members.length;

  return (
    <PixelWindow tab={f.solo ? "New game · solo" : "New game · tím"} className="form-window">
      <form className="reg-form" onSubmit={onSubmit} noValidate aria-labelledby="reg-title" aria-busy={pending}>
        <div className="form-head">
          <h2 id="reg-title" className="form-title">
            <span className="form-cursor" aria-hidden="true" />
            {f.solo ? "Registruj sa" : "Registruj tím"}
          </h2>
          <p className="form-lead">
            Tím {EVENT.team.min}–{EVENT.team.max} ľudí, alebo príď sám a tím ti nájdeme. Polia bez označenia „voliteľné“ sú povinné.
          </p>
        </div>

        <div
          ref={summaryRef}
          tabIndex={-1}
          className={`summary ${showSummary ? "" : "summary--empty"}`}
          aria-labelledby={showSummary ? "summary-title" : undefined}
          role={showSummary ? "alert" : undefined}
          data-focus-target=""
        >
          {showSummary ? (
            <>
              <p id="summary-title" className="summary-title">
                <span aria-hidden="true">▲ </span>
                {server?.error && errorList.length === 0
                  ? server.error
                  : `Ešte nie si pripravený – oprav ${errorList.length === 1 ? "1 pole" : errorList.length < 5 ? `${errorList.length} polia` : `${errorList.length} polí`}:`}
              </p>
              {errorList.length > 0 ? (
                <ul className="summary-list">
                  {errorList.map((er) => (
                    <li key={er.key}>
                      <a
                        href={`#${fieldId(er.key)}`}
                        onClick={(e) => {
                          e.preventDefault();
                          focusField(er.key);
                        }}
                      >
                        {er.where ? <span className="summary-where">{er.where}</span> : null}
                        {er.msg}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>

        {/* Honeypot – pre ľudí neviditeľný, boti ho radi vyplnia. */}
        <div className="hp" aria-hidden="true">
          <label htmlFor="f-website">Web stránka</label>
          <input
            id="f-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={f.website}
            onChange={(e) => update((x) => ({ ...x, website: e.target.value }))}
          />
        </div>

        <CheckField
          path="solo"
          big
          className="solo-toggle"
          checked={f.solo}
          onChecked={(v) => {
            update((x) => ({ ...x, solo: v }));
            recheck();
          }}
          hint="Nemáš tím? Nevadí – organizátori ťa priradia k ďalším hráčom."
        >
          Registrujem sa sám – priraďte ma do tímu
        </CheckField>

        <fieldset className="team-box" disabled={f.solo} data-off={f.solo || undefined} aria-describedby={f.solo ? "team-off" : undefined}>
          <legend className="section-legend">
            <span className="section-legend-tag">Tím</span>
            <span className="team-count">
              <span className="sr-only">
                Hráči {f.solo ? 1 : teamCount} z {EVENT.team.max}
              </span>
              {Array.from({ length: EVENT.team.max }, (_, i) => (
                <span key={i} className={`team-pip ${i < (f.solo ? 1 : teamCount) ? "team-pip--on" : ""}`} aria-hidden="true" />
              ))}
              <span aria-hidden="true">
                {f.solo ? 1 : teamCount}/{EVENT.team.max}
              </span>
            </span>
          </legend>
          {f.solo ? (
            <p id="team-off" className="team-off">
              Sólo režim: tímové polia sú vypnuté.
            </p>
          ) : null}
          <TextField
            path="teamName"
            label="Názov tímu"
            value={f.teamName}
            onValue={(v) => update((x) => ({ ...x, teamName: v }))}
            onBlur={recheck}
            error={f.solo ? undefined : errors.teamName}
            maxLength={40}
            autoComplete="off"
            placeholder="napr. Pixel Pirates"
          />
        </fieldset>

        <PersonCard
          prefix="leader"
          player={1}
          person={f.leader}
          onChange={setLeader}
          errors={errors}
          onBlur={recheck}
          leader
          solo={f.solo}
        />

        {!f.solo
          ? f.members.map((m, i) => (
              <PersonCard
                key={m.id}
                prefix={`members.${i}`}
                player={i + 2}
                person={m.p}
                onChange={(patch) => setMember(m.id, patch)}
                errors={errors}
                onBlur={recheck}
                onRemove={() => removeMember(m.id)}
              />
            ))
          : null}

        <div className={`join ${f.solo ? "join--off" : ""} ${!f.solo && errors.members ? "field--error" : ""}`}>
          {f.members.length < MAX_MEMBERS ? (
            <button
              ref={joinRef}
              id={fieldId("members")}
              type="button"
              className="join-btn"
              onClick={addMember}
              disabled={f.solo}
              aria-describedby={!f.solo && errors.members ? `${fieldId("members")}-err` : "join-hint"}
            >
              <span className="join-plus" aria-hidden="true">
                +
              </span>
              <span>Player {f.solo ? 2 : f.members.length + 2} join</span>
            </button>
          ) : (
            <p className="join-full">
              Tím je plný · {EVENT.team.max}/{EVENT.team.max}
            </p>
          )}
          <p id="join-hint" className="field-hint">
            {f.solo
              ? "V sólo režime ťa do tímu priradia organizátori."
              : f.members.length === 0
                ? `Pridaj aspoň jedného spoluhráča (tím má ${EVENT.team.min}–${EVENT.team.max} ľudí).`
                : f.members.length < MAX_MEMBERS
                  ? `Môžeš pridať ešte ${MAX_MEMBERS - f.members.length}.`
                  : "Viac hráčov sa do tímu nezmestí."}
          </p>
          {!f.solo && errors.members ? (
            <p id={`${fieldId("members")}-err`} className="field-error">
              <span aria-hidden="true">✕ </span>
              {errors.members}
            </p>
          ) : null}
        </div>

        <fieldset className="consents">
          <legend className="section-legend">
            <span className="section-legend-tag">Súhlasy</span>
          </legend>

          <CheckField
            path="gdprConsent"
            checked={f.gdprConsent}
            onChecked={(v) => {
              update((x) => ({ ...x, gdprConsent: v }));
              recheck();
            }}
            error={errors.gdprConsent}
          >
            Súhlasím so spracovaním osobných údajov na účel organizácie {EVENT.name}.
            {!f.solo ? " Potvrdzujem, že ostatní členovia tímu o registrácii vedia a súhlasia so spracovaním svojich údajov." : null}
          </CheckField>

          <details className="gdpr">
            <summary>Ako spracúvame tvoje údaje</summary>
            <div className="gdpr-body">
              <p>
                <strong>Prevádzkovateľ:</strong> {EVENT.dataController}
              </p>
              <p>
                <strong>Účel:</strong> organizácia {EVENT.name} – registrácia, zostavenie tímov, kontakt pred eventom, strava a bezpečnosť počas
                eventu.
              </p>
              <p>
                <strong>Rozsah:</strong> meno, priezvisko, e-mail, vek, škola, zameranie a poznámka; pri neplnoletých meno a kontakt zákonného
                zástupcu; alergie iba s tvojím výslovným súhlasom.
              </p>
              <p>
                <strong>Právny základ:</strong> súhlas (čl. 6 ods. 1 písm. a) GDPR), pri údajoch o zdraví výslovný súhlas (čl. 9 ods. 2 písm. a)
                GDPR).
              </p>
              <p>
                <strong>Uchovávanie:</strong> najdlhšie 3 mesiace po skončení eventu, potom údaje vymažeme. Neposkytujeme ich tretím stranám a
                nepoužívame na marketing.
              </p>
              <p>
                <strong>Tvoje práva:</strong> prístup k údajom, oprava, vymazanie, obmedzenie spracúvania, prenosnosť, odvolanie súhlasu
                kedykoľvek (bez vplyvu na predchádzajúce spracúvanie) a sťažnosť na Úrade na ochranu osobných údajov SR.
              </p>
              <p>
                <strong>Kontakt:</strong> <a href={`mailto:${EVENT.contactEmail}`}>{EVENT.contactEmail}</a>
              </p>
            </div>
          </details>

          {anyAllergies ? (
            <div className="unfold">
              <div className="unfold-inner">
                <CheckField
                  path="healthConsent"
                  checked={f.healthConsent}
                  onChecked={(v) => {
                    update((x) => ({ ...x, healthConsent: v }));
                    recheck();
                  }}
                  error={errors.healthConsent}
                >
                  Výslovne súhlasím so spracovaním údajov o zdraví (alergie) výlučne na zabezpečenie stravy a bezpečnosti počas eventu.
                </CheckField>
              </div>
            </div>
          ) : null}
        </fieldset>

        <div className="submit-row">
          <button type="submit" className="btn-start" disabled={pending} aria-describedby={pending ? "saving" : undefined}>
            <span className="btn-start-cursor" aria-hidden="true" />
            {pending ? "Saving…" : f.solo ? "Zaregistrovať sa" : "Zaregistrovať tím"}
          </button>
          <div id="saving" className={`saving ${pending ? "saving--on" : ""}`} role="status" aria-live="polite">
            {pending ? (
              <>
                <span className="saving-label">Saving…</span>
                <span className="saving-bar" aria-hidden="true">
                  {Array.from({ length: 12 }, (_, i) => (
                    <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
                  ))}
                </span>
                <span className="sr-only">Ukladám registráciu, chvíľu strpenia.</span>
              </>
            ) : null}
          </div>
        </div>
      </form>
    </PixelWindow>
  );
}
