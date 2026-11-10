import { Suspense } from "react";
import { connection } from "next/server";
import { EVENT } from "@/lib/event";
import { isRegistrationOpen } from "@/lib/registration-status";
import { issueFormToken } from "@/lib/form-token";
import { PixelWindow } from "@/components/PixelWindow";
import { Reveal } from "@/components/Reveal";
import { RegistrationForm } from "./RegistrationForm";

/** Stav registrácie a token formulára vznikajú pri požiadavke (nie pri builde) – preto connection() + Suspense. */
async function RegistrationGate() {
  await connection();
  if (!isRegistrationOpen()) return <Closed />;
  // podpísaný čas otvorenia formulára – server ho pri odoslaní overí (ochrana proti botom)
  return <RegistrationForm formToken={issueFormToken()} />;
}

function Closed() {
  return (
    <PixelWindow tab="Game over" tabTone="pink" tone="pink" className="form-window closed">
      <div className="closed-body">
        <h2 className="closed-title" tabIndex={-1} data-focus-target="">
          Registrácia uzavretá
        </h2>
        <p>Kapacita je naplnená alebo registrácia skončila. Ďakujeme za záujem!</p>
        <p>
          Máš otázku? Napíš nám na{" "}
          <a href={`mailto:${EVENT.contactEmail}`} className="floor-link">
            {EVENT.contactEmail}
          </a>
          .
        </p>
      </div>
    </PixelWindow>
  );
}

function Loading() {
  return (
    <PixelWindow tab="Loading" className="form-window form-window--loading">
      <div className="loading-body" role="status">
        <span className="saving-bar" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
        </span>
        <span className="sr-only">Načítavam registračný formulár…</span>
      </div>
    </PixelWindow>
  );
}

export function RegistrationSection() {
  return (
    <section id="registracia" className="registration" aria-label="Registrácia" tabIndex={-1}>
      <Reveal>
        <Suspense fallback={<Loading />}>
          <RegistrationGate />
        </Suspense>
      </Reveal>
    </section>
  );
}
