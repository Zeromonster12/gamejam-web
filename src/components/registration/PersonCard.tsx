import { FOCUS_LABELS, FOCUS_OPTIONS, SCHOOL_TYPE_LABELS, SCHOOL_TYPES } from "@/lib/validation";
import { CheckField, ChoiceGroup, TextField } from "./controls";
import { isMinor, type Person } from "./person";

type Props = {
  /** Prefix cesty chýb: „leader“ alebo „members.0“. */
  prefix: string;
  player: number;
  person: Person;
  onChange: (patch: Partial<Person>) => void;
  errors: Record<string, string>;
  onBlur: () => void;
  leader?: boolean;
  solo?: boolean;
  onRemove?: () => void;
  disabled?: boolean;
};

export function PersonCard({ prefix, player, person: p, onChange, errors, onBlur, leader, solo, onRemove, disabled }: Props) {
  const e = (k: string) => errors[`${prefix}.${k}`];
  const minor = isMinor(p);
  const headingId = `${prefix.replace(/\./g, "-")}-title`;

  return (
    <fieldset className={`player player--p${Math.min(player, 5)}`} aria-labelledby={headingId} disabled={disabled}>
      <div className="player-head">
        <h3 id={headingId} className="player-title">
          <span className="player-badge">Player {player}</span>
          <span className="player-role">{leader ? (solo ? "ty" : "ty – kapitán") : "člen tímu"}</span>
        </h3>
        {onRemove ? (
          <button type="button" className="btn-ghost" onClick={onRemove} aria-label={`Odobrať hráča ${player}`}>
            <span aria-hidden="true">✕</span> Odobrať
          </button>
        ) : null}
      </div>

      <div className="grid-2">
        <TextField
          path={`${prefix}.firstName`}
          label="Meno"
          value={p.firstName}
          onValue={(v) => onChange({ firstName: v })}
          onBlur={onBlur}
          error={e("firstName")}
          autoComplete={leader ? "given-name" : "off"}
          maxLength={60}
          firstField={leader}
        />
        <TextField
          path={`${prefix}.lastName`}
          label="Priezvisko"
          value={p.lastName}
          onValue={(v) => onChange({ lastName: v })}
          onBlur={onBlur}
          error={e("lastName")}
          autoComplete={leader ? "family-name" : "off"}
          maxLength={80}
        />
        <TextField
          path={`${prefix}.email`}
          label="E-mail"
          type="email"
          inputMode="email"
          value={p.email}
          onValue={(v) => onChange({ email: v })}
          onBlur={onBlur}
          error={e("email")}
          optional={!leader}
          autoComplete={leader ? "email" : "off"}
          spellCheck={false}
          maxLength={254}
          hint={leader ? "Na tento e-mail sa ti ozveme pred eventom." : "Na kontakt pred eventom – ak ho nevyplníš, info pošleme kapitánovi."}
        />
        <TextField
          path={`${prefix}.age`}
          label="Vek"
          type="number"
          inputMode="numeric"
          min={12}
          max={99}
          value={p.age}
          onValue={(v) => onChange({ age: v })}
          onBlur={onBlur}
          error={e("age")}
          className="field--age"
        />
        <ChoiceGroup
          path={`${prefix}.schoolType`}
          legend="Typ školy"
          type="radio"
          options={SCHOOL_TYPES}
          labels={SCHOOL_TYPE_LABELS}
          value={p.schoolType ? [p.schoolType] : []}
          onValue={(v) => {
            onChange({ schoolType: v[0] });
            onBlur();
          }}
          error={e("schoolType")}
        />
        <TextField
          path={`${prefix}.schoolName`}
          label="Názov školy"
          value={p.schoolName}
          onValue={(v) => onChange({ schoolName: v })}
          onBlur={onBlur}
          error={e("schoolName")}
          autoComplete="off"
          maxLength={120}
          placeholder={p.schoolType === "ss" ? "napr. Gymnázium Golianova, Nitra" : "napr. UKF v Nitre"}
        />
      </div>

      <ChoiceGroup
        path={`${prefix}.focus`}
        legend="Zameranie"
        type="checkbox"
        options={FOCUS_OPTIONS}
        labels={FOCUS_LABELS}
        value={p.focus}
        onValue={(v) => {
          onChange({ focus: v });
          onBlur();
        }}
        error={e("focus")}
        hint="Vyber aspoň jedno – môžeš aj viac."
      />

      <div className="grid-2">
        <TextField
          path={`${prefix}.focusNote`}
          label="Čo by si chcel robiť?"
          multiline
          optional
          value={p.focusNote}
          onValue={(v) => onChange({ focusNote: v })}
          onBlur={onBlur}
          error={e("focusNote")}
          maxLength={300}
          placeholder="napr. Unity, pixel art, chiptune…"
        />
        <TextField
          path={`${prefix}.allergies`}
          label="Alergie / strava"
          multiline
          optional
          value={p.allergies}
          onValue={(v) => onChange({ allergies: v })}
          onBlur={onBlur}
          error={e("allergies")}
          maxLength={300}
          placeholder="napr. orechy, laktóza, bezlepková strava"
          hint="Kvôli jedlu a bezpečnosti počas 24 h."
        />
      </div>

      {minor ? (
        <div className="unfold">
          <div className="unfold-inner">
            <div className="guardian" role="group" aria-labelledby={`${headingId}-guardian`}>
              <p id={`${headingId}-guardian`} className="guardian-title">
                <span className="guardian-badge" aria-hidden="true">
                  !
                </span>
                Hráč je mladší ako 18 rokov
              </p>
              <div className="grid-2">
                <TextField
                  path={`${prefix}.guardianName`}
                  label="Meno zákonného zástupcu"
                  value={p.guardianName}
                  onValue={(v) => onChange({ guardianName: v })}
                  onBlur={onBlur}
                  error={e("guardianName")}
                  autoComplete="off"
                  maxLength={120}
                />
                <TextField
                  path={`${prefix}.guardianContact`}
                  label="Kontakt (telefón alebo e-mail)"
                  value={p.guardianContact}
                  onValue={(v) => onChange({ guardianContact: v })}
                  onBlur={onBlur}
                  error={e("guardianContact")}
                  autoComplete="off"
                  maxLength={120}
                />
              </div>
              <CheckField
                path={`${prefix}.guardianConsent`}
                checked={p.guardianConsent}
                onChecked={(v) => {
                  onChange({ guardianConsent: v });
                  onBlur();
                }}
                error={e("guardianConsent")}
              >
                Zákonný zástupca je informovaný a súhlasí s účasťou. Podpísaný súhlas prinesiem na event.
              </CheckField>
            </div>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
