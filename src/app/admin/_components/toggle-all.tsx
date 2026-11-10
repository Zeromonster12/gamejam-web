"use client";

import { linkBtn } from "./ui";

/**
 * Rozbalí/zbalí všetky <details data-collapsible> v kontajneri `targetId` (tímy v admine).
 * Atribút `open` React nespravuje (nie je v props), takže stav prežije aj refresh() po server action.
 */
export function ToggleAll({ targetId }: { targetId: string }) {
  const setAll = (open: boolean) => {
    document
      .getElementById(targetId)
      ?.querySelectorAll<HTMLDetailsElement>("details[data-collapsible]")
      .forEach((d) => {
        d.open = open;
      });
  };
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={linkBtn} onClick={() => setAll(true)} data-testid="expand-all">
        Rozbaliť všetko
      </button>
      <button type="button" className={linkBtn} onClick={() => setAll(false)} data-testid="collapse-all">
        Zbaliť všetko
      </button>
    </div>
  );
}
