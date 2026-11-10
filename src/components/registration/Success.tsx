import { useEffect, useRef } from "react";
import type { RegisterResult } from "@/lib/validation";
import { EVENT } from "@/lib/event";
import { PixelWindow } from "@/components/PixelWindow";

const CONFETTI_COLORS = ["var(--pink)", "var(--violet)", "var(--lime)", "var(--ink)", "var(--gold)"];
/** Deterministické „náhodné“ konfety (bez Math.random v renderi). */
const CONFETTI = Array.from({ length: 28 }, (_, i) => {
  const h = (i * 37 + 11) % 100;
  return {
    left: `${(i * 53 + 7) % 100}%`,
    delay: `${((i * 0.13) % 1.2).toFixed(2)}s`,
    dur: `${1.6 + (h % 9) * 0.12}s`,
    size: 6 + (i % 3) * 3,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    drift: `${((i % 7) - 3) * 14}px`,
  };
});

export function Success({ result, onAgain }: { result: Extract<RegisterResult, { ok: true }>; onAgain: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const team = result.mode === "team";
  return (
    <PixelWindow tab="Stage clear" tabTone="lime" tone="pink" className="form-window success">
      <div className="confetti" aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            style={
              {
                left: c.left,
                width: c.size,
                height: c.size,
                background: c.color,
                animationDelay: c.delay,
                animationDuration: c.dur,
                "--drift": c.drift,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="success-body">
        <h2 ref={headingRef} tabIndex={-1} className="success-title">
          {team ? "Level complete!" : "Player ready!"}
        </h2>
        <p className="success-lead">
          {team ? (
            <>
              Tím <strong>„{result.teamName}“</strong> je zapísaný. Vitaj na štarte, {result.firstName}!
            </>
          ) : (
            <>
              <strong>{result.firstName}</strong>, si v hre! Do tímu ťa priradíme pred eventom.
            </>
          )}
        </p>
        <ul className="success-facts">
          <li>
            <span>Kedy</span> {EVENT.dateLabel} · {EVENT.startLabel}
          </li>
          <li>
            <span>Kde</span> {EVENT.venue}, {EVENT.venueCity}
          </li>
          <li>
            <span>Ďalej</span> Ozveme sa ti pred eventom na e-mail.
          </li>
        </ul>
        <button type="button" className="btn-start btn-start--small" onClick={onAgain}>
          <span className="btn-start-cursor" aria-hidden="true" />
          Registrovať ďalší tím
        </button>
      </div>
    </PixelWindow>
  );
}
