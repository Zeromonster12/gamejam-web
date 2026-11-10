import { Suspense } from "react";
import { connection } from "next/server";
import { adminPasswordConfigured } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="border-4 border-violet bg-window p-6 shadow-[6px_6px_0_var(--shadow)]">
        <p className="font-pixel text-xs uppercase tracking-widest text-lime">GameJam 2027</p>
        <h1 className="mb-6 font-pixel text-2xl uppercase text-pink">Admin login</h1>
        <Suspense fallback={<p className="text-sm text-grey">Načítavam…</p>}>
          <DynamicLogin />
        </Suspense>
      </div>
    </main>
  );
}

/** Dynamický render → Next.js doplní CSP nonce do skriptov (viď src/proxy.ts). */
async function DynamicLogin() {
  await connection();
  if (!adminPasswordConfigured()) {
    return (
      <p role="alert" className="text-sm text-pink" data-testid="login-disabled">
        Prihlásenie je vypnuté: na serveri nie je nastavené ADMIN_PASSWORD_HASH (npm run admin:hash).
      </p>
    );
  }
  return <LoginForm />;
}
