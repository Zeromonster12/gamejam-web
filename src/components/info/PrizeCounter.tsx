"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Počítadlo výhry 000 → 500, keď príde do viewportu.
 * Server aj hydratácia renderujú cieľovú hodnotu (bez JS/SEO je vidieť 500);
 * animácia sa spustí až pri vstupe do viewportu.
 */
export function PrizeCounter({ value, digits = 3 }: { value: number; digits?: number }) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const dur = 1400;
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / dur);
          // „herné“ krokovanie po 20 bodoch, ease-out
          const eased = 1 - Math.pow(1 - p, 3);
          setShown(p >= 1 ? value : Math.floor((eased * value) / 20) * 20);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        setShown(0);
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <span ref={ref} className="prize-value" aria-hidden="true">
      {String(shown).padStart(digits, "0")}
    </span>
  );
}
