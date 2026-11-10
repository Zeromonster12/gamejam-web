"use client";

/** ▶ PRESS START – zroluje na formulár a dá focus prvému poľu (bez JS funguje ako kotva). */
export function PressStart() {
  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const section = document.getElementById("registracia");
    if (!section) return;
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    const target =
      section.querySelector<HTMLElement>("[data-first-field]:not(:disabled)") ??
      section.querySelector<HTMLElement>("[data-focus-target]") ??
      section;
    target.focus({ preventScroll: true });
    history.replaceState(null, "", "#registracia");
  }

  return (
    <a href="#registracia" className="press-start" onClick={onClick}>
      <span className="press-start-cursor" aria-hidden="true" />
      <span className="press-start-text">Press start</span>
      <span className="sr-only"> – prejsť na registráciu</span>
    </a>
  );
}
