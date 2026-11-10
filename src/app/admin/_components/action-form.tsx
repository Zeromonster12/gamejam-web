"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { AdminActionState } from "@/app/actions/admin";

type Action = (prev: AdminActionState, formData: FormData) => Promise<AdminActionState>;

/** Formulár pre admin server action so stavovou hláškou (aria-live). */
export function ActionForm({
  action,
  children,
  className,
  id,
  testId,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  id?: string;
  testId?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className} id={id} data-testid={testId}>
      {children}
      <p
        role="status"
        aria-live="polite"
        className={`min-h-0 text-xs empty:hidden ${state?.ok ? "text-lime" : "text-pink"}`}
      >
        {state?.message ?? ""}
      </p>
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "default",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger" }) {
  const { pending } = useFormStatus();
  const styles =
    variant === "primary"
      ? "border-lime bg-lime text-bg hover:bg-ink hover:border-ink"
      : variant === "danger"
        ? "border-[var(--red)] bg-[var(--red)] text-ink hover:bg-pink hover:border-pink"
        : "border-violet bg-window text-ink hover:border-pink";
  return (
    <button
      type="submit"
      disabled={pending || rest.disabled}
      aria-busy={pending}
      className={`border-2 px-3 py-1.5 font-pixel text-xs uppercase tracking-wide shadow-[3px_3px_0_var(--shadow)] transition-colors disabled:cursor-wait disabled:opacity-60 ${styles} ${className}`}
      {...rest}
    >
      {pending ? "…" : children}
    </button>
  );
}
