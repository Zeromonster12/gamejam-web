import { expect, test } from "@playwright/test";
import { newContext, watchConsole } from "./helpers";

const common = (h: Record<string, string>) => {
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["permissions-policy"]).toContain("microphone=()");
  expect(h["permissions-policy"]).toContain("geolocation=()");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-powered-by"]).toBeUndefined();
  const csp = h["content-security-policy"];
  expect(csp).toBeTruthy();
  for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "default-src 'self'"]) {
    expect(csp).toContain(d);
  }
  return csp;
};

test("bezpečnostné hlavičky – verejná stránka", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status()).toBe(200);
  const csp = common(res.headers());
  expect(csp).not.toContain("unsafe-eval");
});

test("bezpečnostné hlavičky – admin (nonce CSP, no-store, noindex)", async ({ request }) => {
  const res = await request.get("/admin/login");
  expect(res.status()).toBe(200);
  const h = res.headers();
  const csp = common(h);
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp).not.toContain("'unsafe-inline' 'nonce");
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  expect(h["cache-control"]).toContain("no-store");
  expect(h["x-robots-tag"]).toContain("noindex");
  // nonce je pri každej požiadavke iný
  const res2 = await request.get("/admin/login");
  expect(res2.headers()["content-security-policy"]).not.toBe(csp);
});

test("aj prefetch požiadavky na /admin majú CSP, no-store a auth redirect", async ({ request }) => {
  const variants: Record<string, string>[] = [{ purpose: "prefetch" }, { "next-router-prefetch": "1" }, { "sec-purpose": "prefetch" }];
  for (const headers of variants) {
    const res = await request.get("/admin/login", { headers });
    const h = res.headers();
    expect(h["content-security-policy"], JSON.stringify(headers)).toMatch(/script-src 'self' 'nonce-/);
    expect(h["cache-control"]).toContain("no-store");
    expect(h["x-robots-tag"]).toContain("noindex");
    const adm = await request.get("/admin", { headers, maxRedirects: 0 });
    expect(adm.status()).toBe(307);
    expect(adm.headers()["location"]).toMatch(/\/admin\/login$/);
  }
});

test("robots.txt zakazuje /admin", async ({ request }) => {
  const txt = await (await request.get("/robots.txt")).text();
  expect(txt).toMatch(/Disallow: \/admin/);
});

test("prehliadač nehlási CSP porušenia na / ani /admin/login", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const problems = watchConsole(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  // hydratácia prebehla (React spracoval formulár) → skripty neboli zablokované
  await expect(page.getByRole("button", { name: "Prihlásiť" })).toBeEnabled();
  expect(await page.evaluate(() => typeof (window as unknown as { next?: unknown }).next)).toBe("object");
  expect(problems).toEqual([]);
  await ctx.close();
});
