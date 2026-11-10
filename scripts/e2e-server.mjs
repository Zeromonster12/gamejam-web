#!/usr/bin/env node
// Spustí produkčný build (standalone server.js) s čistou PGlite DB pre E2E testy.
// Používa ho playwright.config.ts (webServer). Predpokladá hotový `next build`.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { scryptSync, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("[e2e] Chýba .next/standalone/server.js – najprv spusti `npm run build`.");
  process.exit(1);
}

const dataDir = path.join(root, ".data", "pglite-e2e");
fs.rmSync(dataDir, { recursive: true, force: true });

// statické súbory (ako v Dockerfile)
fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
fs.cpSync(path.join(root, "drizzle"), path.join(standalone, "drizzle"), { recursive: true });

const password = process.env.E2E_ADMIN_PASSWORD ?? "e2e-admin-heslo-123";
const N = 2 ** 14, r = 8, p = 1; // nižšie N len pre rýchlosť testov
const salt = randomBytes(16);
const hash = scryptSync(password.normalize("NFKC"), salt, 64, { N, r, p, maxmem: 256 * N * r * p });

const base = {
  ...process.env,
  NODE_ENV: "production",
  HOSTNAME: "127.0.0.1",
  SESSION_SECRET: "e2e-session-secret-0123456789abcdef-0123456789",
  IP_HASH_SECRET: "e2e-ip-hash-secret-0123456789",
  // rovnaký kľúč pozná tests/helpers.ts → testy si vedia vyrobiť token s ľubovoľným vekom
  FORM_TOKEN_SECRET: "e2e-form-token-secret-0123456789",
  ADMIN_PASSWORD_HASH: `scrypt:${N}:${r}:${p}:${salt.toString("base64")}:${hash.toString("base64")}`,
  REGISTRATION_OPEN: "true",
  E2E: "1",
  NEXT_TELEMETRY_DISABLED: "1",
};

// hlavná inštancia: za „proxy“ (TRUST_PROXY, 1 hop → posledný záznam X-Forwarded-For)
const env = {
  ...base,
  PORT: process.env.E2E_PORT ?? "3202",
  // E2E_DATABASE_URL=postgres://… → testy proti skutočnému Postgresu (DB musí byť prázdna/testovacia!)
  DATABASE_URL: process.env.E2E_DATABASE_URL || `pglite:${dataDir}`,
  TRUST_PROXY: "true",
  TRUSTED_PROXY_HOPS: "1",
};

// druhá inštancia bez dôveryhodnej proxy (TRUST_PROXY=false) – testy spoločného „unknown“ bucketu
const untrustedDir = path.join(root, ".data", "pglite-e2e-untrusted");
fs.rmSync(untrustedDir, { recursive: true, force: true });
const envUntrusted = {
  ...base,
  PORT: process.env.E2E_UNTRUSTED_PORT ?? "3204",
  DATABASE_URL: `pglite:${untrustedDir}`,
  TRUST_PROXY: "false",
};

const migrate = (e) =>
  execFileSync(process.execPath, [path.join(root, "scripts", "migrate.mjs")], { env: e, stdio: "inherit", cwd: root });
migrate(env);
migrate(envUntrusted);

const children = [];
const start = (e) => {
  const c = spawn(process.execPath, ["server.js"], { cwd: standalone, env: e, stdio: "inherit" });
  children.push(c);
  c.on("exit", (code) => {
    for (const o of children) if (o !== c) o.kill("SIGTERM");
    process.exit(code ?? 0);
  });
  return c;
};

async function waitFor(url, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* ešte nebeží */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`[e2e] ${url} nenaštartoval`);
}

// najprv vedľajšia inštancia, až potom hlavná (Playwright čaká na hlavnú → obe bežia)
start(envUntrusted);
await waitFor(`http://127.0.0.1:${envUntrusted.PORT}/robots.txt`);
start(env);

const stop = () => children.forEach((c) => c.kill("SIGTERM"));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
