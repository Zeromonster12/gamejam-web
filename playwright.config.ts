import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3202);

// V tomto prostredí je Chromium predinštalovaný mimo verzie Playwrightu → použi ho, ak existuje.
const systemChromium = ["/opt/pw-browsers/chromium_headless_shell", "/opt/pw-browsers/chromium"].find((p) =>
  fs.existsSync(p),
);
const executablePath = process.env.PW_CHROMIUM_PATH ?? systemChromium;

/**
 * E2E testy proti produkčnému buildu (`next build` → standalone server.js) s PGlite.
 *   npm run test:e2e
 * Testy zdieľajú jednu databázu → beží sa sériovo (1 worker).
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `http://localhost:${PORT}/robots.txt`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
