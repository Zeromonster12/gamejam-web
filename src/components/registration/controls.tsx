/**
 * Prístupné formulárové prvky v pixel štýle (používajú ich klientske komponenty).
 * Konvencia ID: cesta chyby „members.1.email“ → id „f-members-1-email“.
 */

export const fieldId = (path: string) => `f-${path.replace(/\./g, "-")}`;

function describedBy(id: string, hint?: React.ReactNode, error?: string) {
  const ids = [hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ");
  return ids || undefined;
}

export function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${id}-err`} className="field-error">
      <span aria-hidden="true">✕ </span>
      {error}
    </p>
  );
}

type TextFieldProps = {
  path: string;
  label: string;
  value: string;
  onValue: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  multiline?: boolean;
  className?: string;
  firstField?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur" | "className">;

export function TextField({
  path,
  label,
  value,
  onValue,
  onBlur,
  error,
  hint,
  optional,
  multiline,
  className = "",
  firstField,
  ...input
}: TextFieldProps) {
  const id = fieldId(path);
  const common = {
    id,
    name: path,
    value,
    onBlur,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy(id, hint, error),
    "aria-required": optional ? undefined : true,
    "data-first-field": firstField ? "" : undefined,
    className: "input",
  };
  return (
    <div className={`field ${error ? "field--error" : ""} ${className}`}>
      <label htmlFor={id} className="field-label">
        {label}
        {optional ? <span className="field-opt">voliteľné</span> : null}
      </label>
      {multiline ? (
        <textarea
          {...common}
          rows={2}
          maxLength={input.maxLength}
          placeholder={input.placeholder}
          onChange={(e) => onValue(e.target.value)}
        />
      ) : (
        <input {...input} {...common} onChange={(e) => onValue(e.target.value)} />
      )}
      {hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
      <FieldError id={id} error={error} />
    </div>
  );
}

/** Pixel checkbox s labelom (súhlasy, sólo režim). */
export function CheckField({
  path,
  checked,
  onChecked,
  children,
  error,
  hint,
  className = "",
  big,
}: {
  path: string;
  checked: boolean;
  onChecked: (v: boolean) => void;
  children: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  big?: boolean;
}) {
  const id = fieldId(path);
  return (
    <div className={`check ${big ? "check--big" : ""} ${error ? "field--error" : ""} ${className}`}>
      <input
        type="checkbox"
        id={id}
        name={path}
        checked={checked}
        onChange={(e) => onChecked(e.target.checked)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className="check-input"
      />
      <label htmlFor={id} className="check-label">
        <span className="check-box" aria-hidden="true" />
        <span className="check-text">{children}</span>
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="field-hint check-hint">
          {hint}
        </p>
      ) : null}
      <FieldError id={id} error={error} />
    </div>
  );
}

/** Skupina volieb (radio / multi-select „chips“) vo fieldsete s legendou. */
export function ChoiceGroup<T extends string>({
  path,
  legend,
  type,
  options,
  labels,
  value,
  onValue,
  error,
  hint,
  className = "",
}: {
  path: string;
  legend: string;
  type: "radio" | "checkbox";
  options: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onValue: (v: T[]) => void;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
}) {
  const id = fieldId(path);
  return (
    <fieldset
      id={id}
      className={`choices choices--${type} ${error ? "field--error" : ""} ${className}`}
      aria-describedby={describedBy(id, hint, error)}
    >
      <legend className="field-label">{legend}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
      <div className="choices-list">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <label key={o} className="chip">
              <input
                type={type}
                name={path}
                value={o}
                checked={on}
                aria-invalid={error ? true : undefined}
                onChange={(e) => {
                  if (type === "radio") onValue([o]);
                  else onValue(e.target.checked ? [...value, o] : value.filter((v) => v !== o));
                }}
                className="chip-input"
              />
              <span className="chip-face">
                <span className="chip-mark" aria-hidden="true" />
                {labels[o]}
              </span>
            </label>
          );
        })}
      </div>
      <FieldError id={id} error={error} />
    </fieldset>
  );
}
