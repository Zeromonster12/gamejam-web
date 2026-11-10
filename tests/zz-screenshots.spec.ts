import { test } from "@playwright/test";
import { login, newContext, person, register, soloPayload, teamPayload } from "./helpers";

// Pomocný „test“ len na screenshoty admina (spúšťa sa iba so SHOTS_DIR).
test.skip(!process.env.SHOTS_DIR, "len pre screenshoty");

test("admin screenshoty", async ({ browser }) => {
  const dir = process.env.SHOTS_DIR!;
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await register(page, teamPayload({ teamName: "Pixel Pirates", leader: person({ firstName: "Lucia", lastName: "Nováková", focus: ["game-design", "pribeh"], allergies: "laktóza, orechy" }), members: [person({ firstName: "Marek", focus: ["programovanie", "testovanie"] }), person({ firstName: "Tomáš", focus: ["grafika"], allergies: "bezlepková strava" }), person({ firstName: "Zuzana", age: 22, focus: ["programovanie"], allergies: "Laktóza" })], healthConsent: true }));
  await register(page, teamPayload({ teamName: "Null Pointers", members: [person({ firstName: "Peter", lastName: "Malý", age: 16, schoolType: "ss", schoolName: "Gymnázium Golianova", guardianName: "Eva Malá", guardianContact: "+421 900 123 456", guardianConsent: true, allergies: "arašidy" })], healthConsent: true }));
  await register(page, soloPayload({ leader: person({ firstName: "Adam", lastName: "Sólový", focus: ["grafika", "zvuk-hudba"] }) }));
  await register(page, soloPayload({ leader: person({ firstName: "Bea", lastName: "Kreatívna", age: 17, schoolType: "ss", schoolName: "SPŠ Nitra", guardianName: "Ján Kreatívny", guardianContact: "jan@example.com", guardianConsent: true }) }));
  await login(page);
  await page.waitForURL(/\/admin$/);
  await page.locator("h1, h2").first().waitFor();
  await page.waitForTimeout(1500);
  await page.waitForLoadState("networkidle");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: `${dir}/admin_desktop.png`, fullPage: true });
  await page.getByTestId("expand-all").click();
  await page.screenshot({ path: `${dir}/admin_desktop_expanded.png`, fullPage: true });
  await page.getByTestId("collapse-all").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${dir}/admin_mobile.png`, fullPage: true });
  await page.goto("/admin/prehlad");
  await page.getByRole("heading", { name: "Prehľad", level: 1 }).waitFor();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: `${dir}/admin_prehlad_desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${dir}/admin_prehlad_mobile.png`, fullPage: true });
  await page.goto("/admin/login");
  await ctx.close();
});
