/**
 * Kontrola konfigurácie pri štarte servera (nie počas buildu).
 * V produkcii chýbajúca/slabá konfigurácia = jasná chyba v logu hneď po štarte,
 * nie až pri prvej registrácii/prihlásení.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { sessionSecretProblem } = await import("./lib/session-token");
  const problems: string[] = [];
  const s = sessionSecretProblem();
  if (s) problems.push(s);
  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL nie je nastavené");
  if (!process.env.IP_HASH_SECRET || process.env.IP_HASH_SECRET.length < 16)
    problems.push("IP_HASH_SECRET musí mať aspoň 16 znakov");
  if (!/^scrypt[:$]\d+[:$]\d+[:$]\d+[:$][^:$]+[:$][^:$]+$/.test(process.env.ADMIN_PASSWORD_HASH?.trim() ?? ""))
    problems.push("ADMIN_PASSWORD_HASH chýba alebo má zlý formát (npm run admin:hash) – admin login je vypnutý");
  if (process.env.FORM_TOKEN_SECRET && process.env.FORM_TOKEN_SECRET.length < 16)
    problems.push("FORM_TOKEN_SECRET musí mať aspoň 16 znakov");

  const { ipConfigFromEnv } = await import("./lib/client-ip");
  const ip = ipConfigFromEnv();
  if (!ip.trustProxy) {
    console.warn(
      "[config] TRUST_PROXY=false: IP klientov nepoznáme → všetci zdieľajú jeden limit registrácií a prihlásenie " +
        "sa pri útoku len spomaľuje (nie zamyká per IP). Za reverse proxy nastav TRUST_PROXY=true (docs/DEPLOY.md).",
    );
  } else {
    console.info(
      `[config] IP klienta: ${ip.clientIpHeader ? `hlavička ${ip.clientIpHeader}` : ip.vercel ? "x-real-ip (Vercel)" : `X-Forwarded-For, ${ip.hops}. záznam sprava`}`,
    );
  }

  if (problems.length) {
    const msg = `[config] Neplatná konfigurácia: ${problems.join("; ")}. Pozri .env.example a docs/DEPLOY.md.`;
    console.error(msg);
    // SESSION_SECRET a DATABASE_URL sú kritické → server nesmie bežať s polovičnou konfiguráciou
    if (s || !process.env.DATABASE_URL) throw new Error(msg);
  }
}
