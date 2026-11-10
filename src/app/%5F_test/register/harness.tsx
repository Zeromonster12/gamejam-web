"use client";

import { useState } from "react";
import { registerAction } from "@/app/actions/register";
import type { RegisterResult } from "@/lib/validation";

/**
 * Pošle JSON z textarea do skutočnej server action a zobrazí výsledok.
 * Ak payload neobsahuje `formToken`, použije token, ktorý server vydal pri renderi stránky.
 */
export function RegisterHarness({ formToken }: { formToken: string }) {
  const [result, setResult] = useState<RegisterResult | { thrown: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [seq, setSeq] = useState(0);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setResult(null);
        const text = new FormData(e.currentTarget).get("payload") as string;
        try {
          const payload = JSON.parse(text);
          if (payload && typeof payload === "object" && !("formToken" in payload)) payload.formToken = formToken;
          setResult(await registerAction(payload));
        } catch (err) {
          setResult({ thrown: String(err) });
        } finally {
          setBusy(false);
          setSeq((n) => n + 1);
        }
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor="payload">Payload (JSON)</label>
      <textarea id="payload" name="payload" rows={10} className="bg-bg text-ink border-2 border-violet" />
      <button type="submit" disabled={busy}>
        Odoslať
      </button>
      <pre data-testid="result" data-seq={seq}>
        {result ? JSON.stringify(result) : ""}
      </pre>
    </form>
  );
}
