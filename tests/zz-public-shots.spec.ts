import { test } from "@playwright/test";
test.skip(!process.env.SHOTS_DIR, "len pre screenshoty");
test("verejné screenshoty", async ({ page }) => {
  const dir = process.env.SHOTS_DIR!;
  for (const [n, w, h] of [["pub_desktop", 1440, 900], ["pub_mobile", 390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${dir}/${n}_hero.png` });
    for (let y = 0; y < 6000; y += 400) { await page.mouse.wheel(0, 400); await page.waitForTimeout(150); }
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${dir}/${n}_full.png`, fullPage: true });
  }
});
