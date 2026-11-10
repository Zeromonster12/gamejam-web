import { EVENT } from "@/lib/event";
import { PixelTitle, Spark } from "@/components/pixel/pixel";
import { PressStart } from "./PressStart";

/** Deterministické pozície iskier (server render = rovnaké pri každom načítaní). */
const SPARKS: { x: number; y: number; c: "pink" | "lime" | "violet" | "grey"; d: number; s?: number }[] = [
  { x: 6, y: 18, c: "lime", d: 0 },
  { x: 92, y: 9, c: "pink", d: 1.1 },
  { x: 95, y: 56, c: "lime", d: 2.3 },
  { x: 3, y: 64, c: "pink", d: 0.6 },
  { x: 14, y: 86, c: "violet", d: 1.7 },
  { x: 86, y: 82, c: "grey", d: 2.9 },
  { x: 30, y: 1, c: "grey", d: 3.4, s: 0.7 },
  { x: 70, y: 94, c: "violet", d: 0.3, s: 0.8 },
];

const DUST: [number, number][] = [
  [10, 8], [37, 6], [63, 11], [81, 4], [4, 40], [97, 34], [22, 52], [76, 47], [8, 77], [55, 90], [91, 70], [30, 97], [67, 70],
];

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-bg" aria-hidden="true">
        {DUST.map(([x, y], i) => (
          <span key={i} className="dust" style={{ left: `${x}%`, top: `${y}%` }} />
        ))}
        {SPARKS.map((s, i) => (
          <Spark
            key={i}
            className={`spark spark--${s.c}`}
            style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${s.d}s`, scale: s.s }}
          />
        ))}
      </div>

      <p className="hero-presenter">
        <span>Hra bez HRAníc</span> uvádza
      </p>

      <div className="hero-frame">
        <span className="bracket bracket--tl" aria-hidden="true" />
        <span className="bracket bracket--tr" aria-hidden="true" />
        <span className="bracket bracket--bl" aria-hidden="true" />
        <span className="bracket bracket--br" aria-hidden="true" />
        <h1 id="hero-title" className="hero-title">
          <PixelTitle className="hero-title-svg" />
        </h1>
      </div>

      <p className="tagline">
        <span className="typewriter" style={{ "--n": EVENT.tagline.length } as React.CSSProperties}>
          {EVENT.tagline}
        </span>
      </p>
      <p className="subtagline">{EVENT.subTagline}</p>

      <PressStart />

      <p className="hero-date">
        {EVENT.dateLabel} · {EVENT.venue}, {EVENT.venueCity}
      </p>
    </section>
  );
}
