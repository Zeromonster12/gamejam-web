import { expect, test, type Page } from "@playwright/test";
import { formToken, freshIp, newContext, person, register, soloPayload, teamPayload, uid, watchConsole } from "./helpers";

test.describe("registrácia (server action)", () => {
  let page: Page;
  let problems: string[];

  test.beforeEach(async ({ browser }) => {
    const ctx = await newContext(browser);
    page = await ctx.newPage();
    problems = watchConsole(page);
  });

  test.afterEach(async () => {
    expect(problems, "CSP porušenia / JS chyby").toEqual([]);
    await page.context().close();
  });

  test("úspešná tímová registrácia", async () => {
    const payload = teamPayload({}, 2);
    const res = await register(page, payload);
    expect(res).toEqual({ ok: true, mode: "team", teamName: payload.teamName, firstName: "Janko" });
  });

  test("úspešná sólo registrácia", async () => {
    const res = await register(page, soloPayload());
    expect(res).toMatchObject({ ok: true, mode: "solo", firstName: "Sólo" });
    expect(res.ok && res.teamName).toBeFalsy();
  });

  test("duplicitný e-mail (bez ohľadu na veľkosť písmen)", async () => {
    const first = teamPayload();
    expect((await register(page, first)).ok).toBe(true);
    const email = String((first.leader as { email: string }).email).toUpperCase();
    const res = await register(page, soloPayload({ leader: person({ email }) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.["leader.email"]).toBe("Tento e-mail je už zaregistrovaný");

    // aj e-mail člena tímu
    const memberEmail = (first.members as { email: string }[])[0].email;
    const res2 = await register(page, teamPayload({ members: [person({ email: memberEmail })] }));
    expect(res2.ok).toBe(false);
    if (!res2.ok) expect(res2.fieldErrors?.["members.0.email"]).toBe("Tento e-mail je už zaregistrovaný");
  });

  test("duplicitný názov tímu", async () => {
    const name = `Pixel ${uid()}`;
    expect((await register(page, teamPayload({ teamName: name }))).ok).toBe(true);
    const res = await register(page, teamPayload({ teamName: `  ${name.toLowerCase()} ` }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.teamName).toBe("Tím s týmto názvom už existuje");
  });

  test("mladistvý bez súhlasu zákonného zástupcu → chyba", async () => {
    const res = await register(page, soloPayload({ leader: person({ age: 16, guardianName: "Mama Hráčová" }) }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.fieldErrors?.["leader.guardianConsent"]).toBeTruthy();
      expect(res.fieldErrors?.["leader.guardianContact"]).toBeTruthy();
    }
    const ok = await register(
      page,
      soloPayload({
        leader: person({ age: 16, guardianName: "Mama Hráčová", guardianContact: "+421 900 000 000", guardianConsent: true }),
      }),
    );
    expect(ok.ok).toBe(true);
  });

  test("alergie bez súhlasu so spracovaním zdravotných údajov → chyba", async () => {
    const res = await register(page, soloPayload({ leader: person({ allergies: "arašidy" }) }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.healthConsent).toBeTruthy();
  });

  test("honeypot → predstieraný úspech, nič sa neuloží", async () => {
    const payload = soloPayload({ website: "http://spam.example" });
    const res = await register(page, payload);
    expect(res).toMatchObject({ ok: true, mode: "solo" });
    // ten istý e-mail sa dá potom normálne zaregistrovať → bot nič neuložil
    const again = await register(page, { ...payload, website: "" });
    expect(again.ok).toBe(true);
  });

  test("token formulára: príliš rýchle / budúce / staré / podvrhnuté → generická chyba", async () => {
    const bad = [
      formToken(0), // práve vydaný (< 3 s)
      formToken(-60_000), // z budúcnosti
      formToken(25 * 60 * 60 * 1000), // starší ako 24 h
      formToken(15_000, "iny-kluc-utocnika-0123456789"), // zlý podpis
      `v1.${Date.now() - 15_000}.${"A".repeat(43)}`,
      "nonsense",
    ];
    for (const t of bad) {
      const res = await register(page, soloPayload({ formToken: t }));
      expect(res.ok, t).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/skús to znova/);
        expect(res.fieldErrors).toBeUndefined();
      }
    }
    // chýbajúci token
    const { formToken: _omit, ...noToken } = soloPayload();
    void _omit;
    const missing = await register(page, { ...noToken, formToken: undefined } as never);
    expect(missing.ok).toBe(false);
    // čas od klienta (starý startedAt) sa ignoruje – rozhoduje len token
    const res = await register(page, soloPayload({ startedAt: Date.now() - 60_000, formToken: formToken(0) }));
    expect(res.ok).toBe(false);
  });

  test("token vydaný serverom pri renderi stránky funguje až po 3 s", async () => {
    await page.goto("/__test/register");
    const { formToken: _t, ...payload } = soloPayload();
    void _t;
    const fast = await register(page, payload); // harness doplní serverový token (práve vydaný)
    expect(fast.ok).toBe(false);
    await page.waitForTimeout(3_200);
    const ok = await register(page, payload);
    expect(ok.ok).toBe(true);
  });

  test("neplatný vstup nevracia interné detaily", async () => {
    const res = await register(page, { mode: "hack", leader: "x" } as never);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Skontroluj zvýraznené polia.");
  });

  test("rate limit – max 5 registrácií za hodinu z jednej IP", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await register(page, soloPayload())).ok, `registrácia ${i + 1}`).toBe(true);
    }
    const res = await register(page, soloPayload());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/priveľa registrácií/);
  });

  test("rate limit pokusov – aj neúspešné pokusy (enumerácia e-mailov) sa počítajú", async () => {
    const taken = soloPayload();
    expect((await register(page, taken)).ok).toBe(true); // 1. pokus
    // 19 ďalších pokusov s obsadeným e-mailom → hláška o duplicite
    for (let i = 0; i < 19; i++) {
      const res = await register(page, soloPayload({ leader: taken.leader }));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.fieldErrors?.["leader.email"]).toBe("Tento e-mail je už zaregistrovaný");
    }
    // 21. pokus (aj úplne platný) → limit pokusov
    const res = await register(page, soloPayload());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/priveľa registrácií/);
      expect(res.fieldErrors).toBeUndefined();
    }
  });

  test("X-Forwarded-For: rotovanie ľavého záznamu neobíde limit (berie sa posledný hop)", async () => {
    const proxyHop = freshIp();
    for (let i = 0; i < 6; i++) {
      // „klient“ si vymýšľa ľavé záznamy, posledný pripísala naša proxy
      await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.113.${i + 1}, 198.51.100.${i + 7}, ${proxyHop}` });
      const res = await register(page, soloPayload());
      if (i < 5) expect(res.ok, `registrácia ${i + 1}`).toBe(true);
      else {
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toMatch(/priveľa registrácií/);
      }
    }
  });

  test("IPv6 adresy z jedného /64 zdieľajú limit", async () => {
    const prefix = `2001:db8:${(Date.now() % 65535).toString(16)}:7`;
    for (let i = 0; i < 6; i++) {
      await page.setExtraHTTPHeaders({ "x-forwarded-for": `${prefix}::${(i + 1).toString(16)}` });
      const res = await register(page, soloPayload());
      expect(res.ok, `registrácia ${i + 1}`).toBe(i < 5);
    }
  });
});
