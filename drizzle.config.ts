import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit sa používa len na generovanie SQL migrácií (`npm run db:generate`).
 * Migrácie sa aplikujú skriptom `npm run db:migrate` (Postgres aj PGlite).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
