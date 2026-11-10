import { createHash } from "node:crypto";

/**
 * Content-Security-Policy (nastavuje src/proxy.ts).
 *
 * ADMIN (nonce != null) – stránky sa renderujú pri požiadavke, Next.js doplní nonce do všetkých
 * skriptov, ktoré generuje za behu (RSC payload, bootstrap). Cache Components však aj pre
 * dynamickú route predrenderuje „shell“ root layoutu, v ktorom sú:
 *   - externé chunky z /_next/static bez nonce → povolené cez 'self' (preto NIE 'strict-dynamic'),
 *   - jeden konštantný inline skript Reactu (časovač pre Suspense) → povolený presným hashom.
 * Akýkoľvek iný inline skript (napr. XSS cez dáta z registrácie) je zablokovaný.
 *
 * VEREJNÉ stránky (nonce == null) – sú úplne statické (prerender pri builde), inline <script>
 * s RSC payloadom vznikajú pri builde a nonce mať nemôžu → 'self' 'unsafe-inline'.
 * Verejná stránka nerenderuje žiadne uložené používateľské dáta, ostatné direktívy sú prísne
 * (bez externých zdrojov, pluginov, <base>, iframov; formuláre len na vlastný origin).
 *
 * style-src potrebuje 'unsafe-inline' všade: React a next/image renderujú style="" atribúty
 * (inline SVG, animácie), na ktoré sa nonce nevzťahuje.
 */

/** Konštantný inline skript, ktorý React (Fizz) vkladá do prerenderovaného shellu. */
export const REACT_SHELL_INLINE_SCRIPTS = ["requestAnimationFrame(function(){$RT=performance.now()});"];

const shellHashes = REACT_SHELL_INLINE_SCRIPTS.map(
  (s) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`,
).join(" ");

export function buildCsp({ nonce, isDev }: { nonce: string | null; isDev: boolean }): string {
  const script = nonce ? `'self' 'nonce-${nonce}' ${shellHashes}` : `'self' 'unsafe-inline'`;
  const directives = [
    `default-src 'self'`,
    `script-src ${script}${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    `media-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
  ];
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
