import type { ReactNode } from "react";

/** Zdieľané prvky admin UI (server komponenty) – /admin aj /admin/prehlad. */

export const h2 = "font-pixel text-xl uppercase text-lime sm:text-2xl";
export const card = "border-2 border-dim bg-card p-3 shadow-[3px_3px_0_var(--shadow)]";
export const input =
  "min-w-0 border-2 border-violet bg-bg px-2 py-1.5 font-mono text-sm text-ink outline-none focus:border-lime";
export const linkBtn =
  "inline-block border-2 border-violet bg-window px-3 py-1.5 font-pixel text-xs uppercase tracking-wide text-ink shadow-[3px_3px_0_var(--shadow)] hover:border-pink";

export function Stat({
  label,
  value,
  accent,
  testId,
  href,
}: {
  label: string;
  value: number | string;
  /** zvýrazní dlaždicu, ak je hodnota > 0 (niečo treba riešiť) */
  accent?: boolean;
  testId?: string;
  /** dlaždica je odkaz na detail */
  href?: string;
}) {
  const hot = accent && typeof value === "number" && value > 0;
  // odkaz je v <dt> a cez ::after pokrýva celú dlaždicu (<a> okolo <dt>/<dd> by bolo neplatné HTML)
  return (
    <div
      className={`relative border-4 bg-window p-3 shadow-[4px_4px_0_var(--shadow)] ${hot ? "border-pink" : "border-violet"} ${href ? "hover:border-lime focus-within:border-lime" : ""}`}
    >
      <dt className="text-xs text-grey">
        {href ? (
          <a href={href} className="outline-none after:absolute after:inset-0 hover:text-ink">
            {label} <span aria-hidden>→</span>
          </a>
        ) : (
          label
        )}
      </dt>
      <dd className="font-pixel text-3xl text-ink" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone: "lime" | "pink" | "violet" | "grey" | "gold" }) {
  const cls = {
    lime: "border-lime text-lime",
    pink: "border-pink text-pink",
    violet: "border-violet text-ink",
    grey: "border-dim text-grey",
    gold: "border-[var(--gold)] text-[var(--gold)]",
  }[tone];
  return <span className={`border-2 px-1.5 py-0.5 font-pixel text-[10px] uppercase leading-none ${cls}`}>{children}</span>;
}
