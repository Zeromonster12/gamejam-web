import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Admin – GameJam 2027",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

/**
 * Admin sa renderuje vždy pri požiadavke: `connection()` mimo <Suspense> zámerne blokuje
 * celý segment (žiadny obsah adminu v build-time prerendere, nič sa nekešuje) a všetky
 * skripty s RSC payloadom tak dostanú CSP nonce z src/proxy.ts (viď src/lib/csp.ts).
 * `instant = false` vypína validáciu instant navigácie / static shellu pre /admin.
 */
export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await connection();
  return <div className="min-h-dvh bg-bg text-ink font-mono">{children}</div>;
}
