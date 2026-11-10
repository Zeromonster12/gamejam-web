"use client";

import { useState } from "react";
import { SubmitButton } from "./action-form";

/**
 * Dvojkrokové potvrdenie (bez window.confirm): prvý klik zobrazí „Naozaj?“,
 * až druhé tlačidlo odošle formulár s confirm=yes.
 */
export function ConfirmSubmit({ label, confirmLabel, testId }: { label: string; confirmLabel: string; testId?: string }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        data-testid={testId}
        className="border-2 border-dim bg-transparent px-3 py-1.5 font-pixel text-xs uppercase tracking-wide text-grey hover:border-[var(--red)] hover:text-ink"
      >
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-pixel text-xs text-pink">Naozaj?</span>
      <SubmitButton variant="danger" name="confirm" value="yes" data-testid={testId ? `${testId}-confirm` : undefined}>
        {confirmLabel}
      </SubmitButton>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="border-2 border-dim px-3 py-1.5 font-pixel text-xs uppercase text-grey hover:text-ink"
      >
        Zrušiť
      </button>
    </span>
  );
}
