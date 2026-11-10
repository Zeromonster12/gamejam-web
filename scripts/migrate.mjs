#!/usr/bin/env node
// Aplikuje SQL migrácie z ./drizzle.
//   DATABASE_URL=postgres://…   → Postgres (Neon, Supabase, docker-compose)
//   DATABASE_URL=pglite:./dir   → PGlite v danom adresári
//   bez DATABASE_URL (mimo produkcie) → PGlite v ./.data/pglite
// Používa ho `npm run db:migrate`, Docker entrypoint aj Vercel build command.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsFolder = path.join(root, "drizzle");

// .env pre lokálne spustenie (Node 20.12+/22 má process.loadEnvFile)
for (const f of [".env.local", ".env"]) {
  const p = path.join(root, f);
  if (!process.env.DATABASE_URL && !process.env.MIGRATION_DATABASE_URL && fs.existsSync(p) && typeof process.loadEnvFile === "function") {
    try { process.loadEnvFile(p); } catch { /* ignore */ }
  }
}

// Migrácie bežia pod VLASTNÍKOM schémy: MIGRATION_DATABASE_URL (Docker – app beží pod rolou bez DDL),
// inak DATABASE_URL_UNPOOLED (Neon priame spojenie), inak DATABASE_URL.
const url = (
  process.env.MIGRATION_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL_UNPOOLED?.trim() ||
  process.env.DATABASE_URL?.trim()
) || undefined;
const started = Date.now();

if (url && !url.startsWith("pglite:")) {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const migrationUrl = url;
  const client = postgres(migrationUrl, { max: 1, onnotice: () => {}, connect_timeout: 15 });
  try {
    // advisory lock – dva paralelné deploye nezmigrujú naraz
    await client`select pg_advisory_lock(727274201)`;
    await migrate(drizzle(client), { migrationsFolder });
    await client`select pg_advisory_unlock(727274201)`;
  } finally {
    await client.end({ timeout: 5 });
  }
  console.log(`[db:migrate] Postgres – hotovo za ${Date.now() - started} ms`);
} else {
  if (!url && process.env.NODE_ENV === "production") {
    console.error("[db:migrate] DATABASE_URL / MIGRATION_DATABASE_URL nie je nastavené (v produkcii povinné).");
    process.exit(1);
  }
  const rel = url ? url.slice("pglite:".length).replace(/^\/\/(?=\.|\/)/, "") || "./.data/pglite" : "./.data/pglite";
  const dataDir = path.resolve(process.cwd(), rel);
  fs.mkdirSync(dataDir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await PGlite.create({ dataDir });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.close();
  }
  console.log(`[db:migrate] PGlite (${path.relative(process.cwd(), dataDir) || "."}) – hotovo za ${Date.now() - started} ms`);
}
