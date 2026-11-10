import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { issueFormToken } from "@/lib/form-token";
import { RegisterHarness } from "./harness";

/**
 * DOČASNÁ testovacia stránka pre E2E testy registrácie (/__test/register).
 * Dostupná iba pri E2E=1 (inak 404 – v proxy aj tu). Po integrácii verejného formulára ju možno zmazať.
 */
export default function TestRegisterPage() {
  return (
    <main className="p-4">
      <Suspense fallback={null}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  await connection();
  if (process.env.E2E !== "1") notFound();
  return <RegisterHarness formToken={issueFormToken()} />;
}
