import { createHmac } from "node:crypto";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/** Rovnaké hodnoty nastavuje scripts/e2e-server.mjs. */
export const E2E_FORM_TOKEN_SECRET = "e2e-form-token-secret-0123456789";
export const E2E_IP_HASH_SECRET = "e2e-ip-hash-secret-0123456789";
export const UNTRUSTED_BASE_URL = `http://localhost:${process.env.E2E_UNTRUSTED_PORT ?? 3204}`;

/** Token formulára tak, ako ho vydáva server (src/lib/form-token.ts) – s ľubovoľným vekom. */
export function formToken(ageMs = 15_000, secret = E2E_FORM_TOKEN_SECRET): string {
  const ts = String(Date.now() - ageMs);
  const sig = createHmac("sha256", secret).update(`form:v1:${ts}`).digest("base64url");
  return `v1.${ts}.${sig}`;
}

/** Krátky odtlačok IP, ako ho zobrazuje audit log v admine. */
export function ipFingerprint(ip: string): string {
  return createHmac("sha256", E2E_IP_HASH_SECRET).update(ip).digest("base64url").slice(0, 8);
}

export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "e2e-admin-heslo-123";

let ipCounter = 1;
/** Unikátna „IP“ pre každý kontext – server beží s TRUST_PROXY=true, takže rate limity sú izolované. */
export function freshIp(): string {
  ipCounter++;
  return `10.${(process.pid >> 8) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

export async function newContext(browser: Browser, ip = freshIp()): Promise<BrowserContext> {
  return browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip } });
}

/** Zachytáva CSP porušenia a JS chyby na stránke. */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

let uniq = 0;
export function uid(): string {
  uniq++;
  return `${Date.now().toString(36)}${uniq}`;
}

type Person = Record<string, unknown>;

export function person(overrides: Person = {}): Person {
  const id = uid();
  return {
    firstName: "Janko",
    lastName: "Hráč",
    email: `hrac.${id}@example.com`,
    age: 20,
    schoolType: "vs",
    schoolName: "UKF Nitra",
    focus: ["programovanie"],
    ...overrides,
  };
}

export function teamPayload(overrides: Person = {}, memberCount = 1): Person {
  return {
    mode: "team",
    teamName: `Tím ${uid()}`,
    leader: person(),
    members: Array.from({ length: memberCount }, () => person({ firstName: "Člen" })),
    gdprConsent: true,
    website: "",
    formToken: formToken(),
    ...overrides,
  };
}

export function soloPayload(overrides: Person = {}): Person {
  return {
    mode: "solo",
    leader: person({ firstName: "Sólo" }),
    gdprConsent: true,
    website: "",
    formToken: formToken(),
    ...overrides,
  };
}

export type Result =
  | { ok: true; mode: string; teamName?: string; firstName: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Odošle payload cez skutočnú server action (dočasná stránka /__test/register). */
export async function register(page: Page, payload: Person): Promise<Result> {
  if (!page.url().endsWith("/__test/register")) {
    await page.goto("/__test/register");
    await expect(page.getByLabel("Payload (JSON)")).toBeVisible();
  }
  const out = page.getByTestId("result");
  const seq = Number(await out.getAttribute("data-seq"));
  await page.getByLabel("Payload (JSON)").fill(JSON.stringify(payload));
  await page.getByRole("button", { name: "Odoslať" }).click();
  await expect(out).toHaveAttribute("data-seq", String(seq + 1), { timeout: 20_000 });
  const text = (await out.textContent()) ?? "";
  return JSON.parse(text) as Result;
}

export async function login(page: Page, password = ADMIN_PASSWORD) {
  await page.goto("/admin/login");
  await page.getByLabel("Heslo organizátora").fill(password);
  // počkaj na odpoveď server action (inak by test videl starú hlášku z predchádzajúceho pokusu)
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/admin/login"),
    page.getByRole("button", { name: "Prihlásiť" }).click(),
  ]);
}

export const loginError = (page: Page) => page.locator("#login-error");
