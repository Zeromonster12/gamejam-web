"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/admin";
import { SubmitButton } from "../_components/action-form";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <label htmlFor="password" className="font-pixel text-sm uppercase text-grey">
        Heslo organizátora
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        maxLength={256}
        aria-invalid={state && !state.ok ? true : undefined}
        aria-describedby={state && !state.ok ? "login-error" : undefined}
        className="border-2 border-violet bg-bg px-3 py-2 font-mono text-ink outline-none focus:border-lime"
      />
      {state && !state.ok ? (
        <p id="login-error" role="alert" className="text-sm text-pink">
          {state.message}
        </p>
      ) : null}
      <SubmitButton variant="primary" className="self-start">
        Prihlásiť
      </SubmitButton>
    </form>
  );
}
