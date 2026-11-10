import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, newContext, uid, watchConsole } from "./helpers";

/**
 * Celý tok cez skutočnú verejnú stránku: vyplnenie formulára → uloženie → viditeľné v admine.
 * (Formulár má ochranu proti botom – odoslanie skôr ako ~3 s po otvorení sa odmietne, preto čakáme.)
 */
test("verejný formulár: tím s mladistvým a alergiami → úspech → v admine", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const problems = watchConsole(page);
  const id = uid();
  const teamName = `Pixel Pirates ${id}`;

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.locator("#f-teamName").fill(teamName);
  await page.locator("#f-leader-firstName").fill("Kapitán");
  await page.locator("#f-leader-lastName").fill("Test");
  await page.locator("#f-leader-email").fill(`kapitan.${id}@example.com`);
  await page.locator("#f-leader-age").fill("21");
  await page.locator("#f-leader-schoolName").fill("UKF Nitra");
  const leader = page.locator("fieldset.player").first();
  await leader.getByText("Vysoká škola", { exact: true }).click();
  await leader.getByText("Programovanie", { exact: true }).click();

  await page.getByRole("button", { name: /PLAYER 2/i }).click();
  await page.locator("#f-members-0-firstName").fill("Mladý");
  await page.locator("#f-members-0-lastName").fill("Hráč");
  await page.locator("#f-members-0-age").fill("16");
  await page.locator("#f-members-0-schoolName").fill("Gymnázium Golianova");
  const member = page.locator("fieldset.player").nth(1);
  await member.getByText("Stredná škola", { exact: true }).click();
  await member.getByText("Grafika / art", { exact: true }).click();
  await page.locator("#f-members-0-allergies").fill("arašidy");
  await page.locator("#f-members-0-guardianName").fill("Mama Hráčová");
  await page.locator("#f-members-0-guardianContact").fill("+421900000000");
  await page.locator(`label[for="f-members-0-guardianConsent"]`).click();
  await expect(page.locator("#f-members-0-guardianConsent")).toBeChecked();

  await page.locator(`label[for="f-gdprConsent"]`).click();
  await expect(page.locator("#f-gdprConsent")).toBeChecked();
  await page.locator(`label[for="f-healthConsent"]`).click();
  await expect(page.locator("#f-healthConsent")).toBeChecked();

  // token formulára, ktorý server vydal pri renderi (odchytený z požiadavky server action)
  const tokens: number[] = [];
  page.on("request", (r) => {
    if (r.method() !== "POST" || !r.headers()["next-action"]) return;
    const m = /"formToken":"v1\.(\d+)\./.exec(r.postData() ?? "");
    if (m) tokens.push(Number(m[1]));
  });

  await page.waitForTimeout(3500);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText(/LEVEL COMPLETE/i)).toBeVisible({ timeout: 15_000 });
  expect(problems, problems.join("\n")).toEqual([]);
  expect(tokens).toHaveLength(1);

  // „Registrovať ďalší tím“ → nový formulár s ČERSTVÝM tokenom (bez obnovenia stránky)
  const clicked = Date.now();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]),
    page.getByRole("button", { name: /Registrovať ďalší tím/i }).click(),
  ]);
  await page.locator(`label[for="f-solo"]`).click();
  await expect(page.locator("#f-solo")).toBeChecked();
  await page.locator("#f-leader-firstName").fill("Sólo");
  await page.locator("#f-leader-lastName").fill("Druhý");
  await page.locator("#f-leader-email").fill(`solo.${id}@example.com`);
  await page.locator("#f-leader-age").fill("19");
  await page.locator("#f-leader-schoolName").fill("UKF Nitra");
  await leader.getByText("Vysoká škola", { exact: true }).click();
  await leader.getByText("Testovanie", { exact: true }).click();
  await page.locator(`label[for="f-gdprConsent"]`).click();
  await page.waitForTimeout(3500);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText(/PLAYER READY/i)).toBeVisible({ timeout: 15_000 });
  expect(tokens).toHaveLength(2);
  expect(tokens[1]).toBeGreaterThanOrEqual(clicked - 1000);
  expect(tokens[1]).toBeGreaterThan(tokens[0]);
  expect(problems, problems.join("\n")).toEqual([]);

  // admin
  await page.goto("/admin/login");
  await page.getByLabel(/heslo/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /prihl/i }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const team = page.locator(`[data-testid="team-card"][data-team-name="${teamName}"]`);
  await expect(team).toBeVisible();
  // tímy sú predvolene zbalené – súhrn v hlavičke ukazuje alergie a mladistvých, detail po rozbalení
  await expect(team.getByTestId("team-summary")).toContainText("alergie: 1");
  await expect(team.getByTestId("team-summary")).toContainText("<18: 1");
  await team.getByTestId("team-summary").click();
  await expect(team.getByText("arašidy").first()).toBeVisible();
  await expect(team.getByText("Mama Hráčová").first()).toBeVisible();
  await expect(page.getByTestId("solo-card").filter({ hasText: "Sólo Druhý" })).toBeVisible();
  expect(problems, problems.join("\n")).toEqual([]);
  await ctx.close();
});
