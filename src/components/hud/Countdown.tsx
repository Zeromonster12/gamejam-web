"use client";

import { useSyncExternalStore } from "react";

/** Tik raz za sekundu; snapshot = aktuálna sekunda (stabilná hodnota pre React). */
function subscribe(cb: () => void) {
  const id = window.setInterval(cb, 1000);
  return () => window.clearInterval(id);
}
const getSecond = () => Math.floor(Date.now() / 1000);
/** Na serveri a počas hydratácie nemáme čas → placeholder (žiadny hydration mismatch). */
const getServerSecond = () => null;

const pad = (n: number) => String(n).padStart(2, "0");

export function formatCountdown(nowSec: number, startSec: number, endSec: number) {
  if (nowSec >= endSec) return { text: "GAME OVER", state: "over" as const };
  if (nowSec >= startSec) return { text: "LIVE", state: "live" as const };
  const diff = startSec - nowSec;
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return { text: `${d}D ${pad(h)}:${pad(m)}:${pad(s)}`, state: "count" as const, d, h, m };
}

export function Countdown({ startsAt, endsAt }: { startsAt: string; endsAt: string }) {
  const now = useSyncExternalStore(subscribe, getSecond, getServerSecond);
  const start = Math.floor(Date.parse(startsAt) / 1000);
  const end = Math.floor(Date.parse(endsAt) / 1000);

  if (now === null) {
    return (
      <span className="hud-time" aria-hidden="true">
        --D --:--:--
      </span>
    );
  }
  const r = formatCountdown(now, start, end);
  const sr =
    r.state === "count"
      ? `Do štartu zostáva ${r.d} dní, ${r.h} hodín a ${r.m} minút`
      : r.state === "live"
        ? "GameJam práve prebieha"
        : "GameJam sa skončil";
  return (
    <>
      <span className={`hud-time hud-time--${r.state}`} aria-hidden="true">
        {r.text}
      </span>
      <span className="sr-only">{sr}</span>
    </>
  );
}
