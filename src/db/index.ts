import "server-only";

import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Prístup k databáze.
 *
 * - `DATABASE_URL=postgres://…` → Postgres cez postgres.js (Vercel + Neon/Supabase, Docker).
 * - `DATABASE_URL=pglite:./cesta` → PGlite v danom adresári (lokálne testy aj s `next start`).
 * - bez `DATABASE_URL` mimo produkcie → PGlite v `./.data/pglite` (lokálny vývoj bez inštalácie DB).
 * - bez `DATABASE_URL` v produkcii → jasná chyba.
 *
 * PGlite sa pri štarte automaticky zmigruje. Postgres sa migruje skriptom `npm run db:migrate`
 * (Docker entrypoint ho spúšťa sám, na Verceli je súčasťou build commandu – viď docs/DEPLOY.md).
 */

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type DbTarget = { kind: "postgres"; url: string } | { kind: "pglite"; dataDir: string };

export function resolveDbTarget(env: NodeJS.ProcessEnv = process.env): DbTarget {
  const url = env.DATABASE_URL?.trim();
  if (url) {
    if (url.startsWith("pglite:")) {
      const dir = url.slice("pglite:".length).replace(/^\/\/(?=\.|\/)/, "") || "./.data/pglite";
      return { kind: "pglite", dataDir: path.resolve(/* turbopackIgnore: true */ process.cwd(), dir) };
    }
    return { kind: "postgres", url };
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL nie je nastavené. V produkcii je povinné (postgres://…). Pozri .env.example a docs/DEPLOY.md.",
    );
  }
  return { kind: "pglite", dataDir: path.resolve(/* turbopackIgnore: true */ process.cwd(), ".data/pglite") };
}

const globalForDb = globalThis as unknown as { __gamejamDb?: Promise<Db> };

async function createDb(): Promise<Db> {
  const target = resolveDbTarget();

  if (target.kind === "postgres") {
    const [{ default: postgres }, { drizzle }] = await Promise.all([
      import("postgres"),
      import("drizzle-orm/postgres-js"),
    ]);
    const client = postgres(target.url, {
      // serverless (Vercel) → málo spojení na inštanciu; pooler (Neon/Supabase) rieši zvyšok
      max: Number(process.env.DATABASE_POOL_MAX ?? (process.env.VERCEL ? 1 : 10)),
      idle_timeout: 20,
      connect_timeout: 10,
      // Neon/Supabase transaction pooler (PgBouncer) nepodporuje prepared statements
      prepare: process.env.DATABASE_PREPARE === "true",
      onnotice: () => {},
    });
    return drizzle(client, { schema }) as unknown as Db;
  }

  const [{ PGlite }, { drizzle }, { migrate }, fs] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
    import("node:fs/promises"),
  ]);
  await fs.mkdir(target.dataDir, { recursive: true });
  const client = await PGlite.create({ dataDir: target.dataDir });
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.join(/* turbopackIgnore: true */ process.cwd(), "drizzle"),
  });
  return db as unknown as Db;
}

/** Singleton (prežije HMR v dev režime vďaka globalThis). */
export function getDb(): Promise<Db> {
  if (!globalForDb.__gamejamDb) {
    globalForDb.__gamejamDb = createDb().catch((err) => {
      // pri chybe nekešuj odmietnutý promise – ďalší request to skúsi znova
      globalForDb.__gamejamDb = undefined;
      throw err;
    });
  }
  return globalForDb.__gamejamDb;
}

export { schema };
