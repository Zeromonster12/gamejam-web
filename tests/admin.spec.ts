import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_PASSWORD, freshIp, ipFingerprint, login, loginError, newContext, UNTRUSTED_BASE_URL, person, register, soloPayload, teamPayload, uid, watchConsole } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("admin – prístup bez session", () => {
  test("/admin presmeruje na prihlásenie, /admin/export vráti 401", async ({ browser }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin/prehlad");
    await expect(page).toHaveURL(/\/admin\/login$/);

    const exp = await ctx.request.get("/admin/export", { maxRedirects: 0 });
    expect(exp.status()).toBe(401);
    expect(await exp.text()).not.toContain(";");
    const diet = await ctx.request.get("/admin/export?type=diet", { maxRedirects: 0 });
    expect(diet.status()).toBe(401);
    await ctx.close();
  });

  test("podvrhnutá/neplatná session cookie je odmietnutá", async ({ browser }) => {
    const forged =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6NDEwMjQ0NDgwMH0.invalidsignature";
    const ctx = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": freshIp(), cookie: `__Host-gj_admin=${forged}` },
    });
    const page = await ctx.newPage();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    const exp = await ctx.request.get("/admin/export", { maxRedirects: 0 });
    expect(exp.status()).toBe(401);
    await ctx.close();
  });
});

test.describe("admin – prihlásenie", () => {
  test("zlé heslo → chybová hláška", async ({ browser }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await login(page, "zle-heslo-0000");
    await expect(loginError(page)).toContainText("Prihlásenie zlyhalo");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await ctx.close();
  });

  test("brute-force zámok po 5 neúspešných pokusoch (aj so správnym heslom)", async ({ browser }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    for (let i = 0; i < 5; i++) {
      await login(page, `zle-heslo-${i}-xyz`);
      await expect(loginError(page)).toContainText("Prihlásenie zlyhalo");
    }
    await login(page, ADMIN_PASSWORD);
    await expect(loginError(page)).toContainText("Prihlásenie zlyhalo");
    await expect(page).toHaveURL(/\/admin\/login$/);

    // iná IP sa prihlási normálne (zámok je per IP)
    const other = await newContext(browser);
    const p2 = await other.newPage();
    await login(p2, ADMIN_PASSWORD);
    await expect(p2).toHaveURL(/\/admin$/);
    await other.close();
    await ctx.close();
  });

  test("zapamätané zariadenie: zámok IP od niekoho na rovnakej sieti organizátora nezamkne", async ({ browser }) => {
    const ip = freshIp(); // napr. spoločná školská sieť (NAT)
    const org = await newContext(browser, ip);
    const op = await org.newPage();
    await login(op, ADMIN_PASSWORD);
    await expect(op).toHaveURL(/\/admin$/);
    const device = (await org.cookies()).find((c) => c.name === "__Host-gj_device");
    expect(device?.httpOnly).toBe(true);
    expect(device?.secure).toBe(true);
    expect(device?.sameSite).toBe("Strict");
    // session skončí (cookie zariadenia ostáva)
    await org.clearCookies({ name: "__Host-gj_admin" });

    // niekto iný z tej istej IP zadá 5× zlé heslo → IP je zamknutá (aj so správnym heslom)
    const att = await newContext(browser, ip);
    const ap = await att.newPage();
    for (let i = 0; i < 5; i++) {
      await login(ap, `zle-heslo-nat-${i}`);
      await expect(loginError(ap)).toContainText("Prihlásenie zlyhalo");
    }
    await login(ap, ADMIN_PASSWORD);
    await expect(loginError(ap)).toContainText("Prihlásenie zlyhalo");

    // organizátor so zapamätaným zariadením sa z tej istej IP prihlási
    await login(op, ADMIN_PASSWORD);
    await expect(op).toHaveURL(/\/admin$/);
    await att.close();
    await org.close();
  });
});

test.describe("admin – brute-force odolnosť", () => {
  test("paralelné pokusy neprekročia limit 5 (pokus sa zapisuje pred overením hesla)", async ({ browser }) => {
    const ip = freshIp();
    const ctx = await newContext(browser, ip);
    const page = await ctx.newPage();
    await page.goto("/admin/login");
    await page.getByLabel("Heslo organizátora").fill("zle-heslo-paralelne");
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]),
      page.getByRole("button", { name: "Prihlásiť" }).click(),
    ]);
    await expect(loginError(page)).toBeVisible();
    // 1 pokus už prebehol cez UI, ďalších 12 naraz
    const replay = () =>
      ctx.request.post("/admin/login", {
        headers: {
          "next-action": req.headers()["next-action"],
          "content-type": req.headers()["content-type"],
          origin: new URL(req.url()).origin,
          accept: "text/x-component",
        },
        data: req.postDataBuffer() ?? Buffer.alloc(0),
        maxRedirects: 0,
      });
    await Promise.all(Array.from({ length: 12 }, replay));
    // aj správne heslo je teraz zamknuté
    await login(page, ADMIN_PASSWORD);
    await expect(loginError(page)).toContainText("Prihlásenie zlyhalo");

    // audit (z inej IP): z tejto IP prešlo overením hesla najviac 5 pokusov, zvyšok zamknutý
    const admin = await newContext(browser);
    const ap = await admin.newPage();
    await login(ap, ADMIN_PASSWORD);
    await expect(ap).toHaveURL(/\/admin$/);
    await expect(ap.getByTestId("audit-log")).toBeVisible();
    const fp = ipFingerprint(ip);
    const rows = ap.getByTestId("audit-log").locator("tbody tr").filter({ hasText: fp });
    const fails = await rows.and(ap.locator('[data-action="login_fail"]')).count();
    const locked = await rows.and(ap.locator('[data-action="login_fail_locked"]')).count();
    expect(fails).toBeGreaterThanOrEqual(1);
    expect(fails).toBeLessThanOrEqual(5);
    // 13 pokusov (UI + 12 paralelne) + 1 správne heslo = 14; overením hesla prešlo najviac 5,
    // zamknuté pokusy sa do auditu zapíšu len raz za okno (anonym nesmie zahltiť audit)
    expect(locked).toBe(1);
    // neúspechy sú v samostatnej tabuľke – akcie organizátorov nevytlačia
    await expect(ap.getByTestId("audit-actions").locator('tr[data-action^="login_fail"]')).toHaveCount(0);
    await expect(ap.getByTestId("audit-actions").locator('tr[data-action="login_ok"]').first()).toBeVisible();
    expect(Number((await ap.getByTestId("audit-failed-24h").locator("strong").textContent()) ?? 0)).toBeGreaterThanOrEqual(5);
    await admin.close();
    await ctx.close();
  });

  test("záplava zamknutých pokusov nevytlačí z auditu prihlásenia a exporty", async ({ browser }) => {
    const admin = await newContext(browser);
    const ap = await admin.newPage();
    await login(ap, ADMIN_PASSWORD);
    await expect(ap).toHaveURL(/\/admin$/);
    expect((await ap.request.get("/admin/export")).status()).toBe(200);

    // útočník: 5 zlých hesiel → zámok, potom 40 zamknutých pokusov (spolu > 30 riadkov starého prehľadu)
    const ip = freshIp();
    const att = await newContext(browser, ip);
    const p = await att.newPage();
    await p.goto("/admin/login");
    await p.getByLabel("Heslo organizátora").fill("zle-heslo-flood");
    const [req] = await Promise.all([
      p.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]),
      p.getByRole("button", { name: "Prihlásiť" }).click(),
    ]);
    await expect(loginError(p)).toBeVisible();
    const replay = () =>
      att.request.post("/admin/login", {
        headers: {
          "next-action": req.headers()["next-action"],
          "content-type": req.headers()["content-type"],
          origin: new URL(req.url()).origin,
          accept: "text/x-component",
        },
        data: req.postDataBuffer() ?? Buffer.alloc(0),
        maxRedirects: 0,
      });
    for (let i = 0; i < 43; i++) await replay();

    await ap.reload();
    const fp = ipFingerprint(ip);
    const failures = ap.getByTestId("audit-failures").locator("tbody tr").filter({ hasText: fp });
    await expect(failures.and(ap.locator('[data-action="login_fail_locked"]'))).toHaveCount(1);
    expect(await failures.and(ap.locator('[data-action="login_fail"]')).count()).toBeLessThanOrEqual(5);
    const actions = ap.getByTestId("audit-actions");
    await expect(actions.locator('tr[data-action="login_ok"]').first()).toBeVisible();
    await expect(actions.locator('tr[data-action="export"]').first()).toBeVisible();
    await att.close();
    await admin.close();
  });

  test("bez spoľahlivej IP (TRUST_PROXY=false): žiadny tvrdý zámok, len progresívne spomalenie", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: UNTRUSTED_BASE_URL });
    const page = await ctx.newPage();
    for (let i = 0; i < 5; i++) {
      await login(page, `zle-heslo-${i}-untrusted`);
      await expect(loginError(page)).toContainText("Prihlásenie zlyhalo");
    }
    // 6. neúspech (n=5 → 1 s), 7. neúspech (n=6 → 2 s)
    let t = Date.now();
    await login(page, "zle-heslo-5-untrusted");
    expect(Date.now() - t).toBeGreaterThanOrEqual(900);
    t = Date.now();
    await login(page, "zle-heslo-6-untrusted");
    expect(Date.now() - t).toBeGreaterThanOrEqual(1_900);
    // útočník nezamkne organizátorov – správne heslo prejde (s oneskorením)
    t = Date.now();
    await login(page, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/admin$/);
    expect(Date.now() - t).toBeGreaterThanOrEqual(3_500);
    await ctx.close();
  });
});

test.describe("admin – správa registrácií", () => {
  let ctx: BrowserContext;
  let page: Page;
  let problems: string[];
  const teamName = `Pixel Pirates ${uid()}`;
  const solos = [
    person({ firstName: "Ada", lastName: "Sólová" }),
    person({ firstName: "Boris", lastName: "Sólo", age: 16, guardianName: "Otec Sólo", guardianContact: "+421 911 111 111", guardianConsent: true }),
    person({ firstName: "=HYPERLINK(\"http://evil\")", lastName: "+cmd", schoolName: "@SUM(A1)", allergies: "-laktóza" }),
  ];

  test.beforeAll(async ({ browser }) => {
    // dáta cez skutočnú registráciu (každá iná IP, aby nezasiahol rate limit)
    const reg = await newContext(browser);
    const rp = await reg.newPage();
    expect((await register(rp, teamPayload({ teamName }, 1))).ok).toBe(true);
    for (const leader of solos) {
      expect((await register(rp, soloPayload({ leader, healthConsent: true }))).ok).toBe(true);
    }
    await reg.close();

    ctx = await newContext(browser);
    page = await ctx.newPage();
    problems = watchConsole(page);
    await login(page);
    await expect(page).toHaveURL(/\/admin$/);
  });

  test.afterAll(async () => {
    expect(problems, "CSP porušenia / JS chyby v admine").toEqual([]);
    await ctx.close();
  });

  const soloCard = (firstName: string) => page.getByTestId("solo-card").filter({ hasText: firstName });
  const teamCard = (name: string) => page.locator(`[data-testid="team-card"][data-team-name="${name}"]`);
  const isOpen = (name: string) => teamCard(name).evaluate((d) => (d as HTMLDetailsElement).open);
  /** tímy sú predvolene zbalené – rozbaľ (ak ešte nie je) a vráť kartu */
  const openTeam = async (name: string) => {
    if (!(await isOpen(name))) await teamCard(name).getByTestId("team-summary").click();
    await expect.poll(() => isOpen(name)).toBe(true);
    return teamCard(name);
  };

  test("prehľad a detail tímu", async () => {
    await expect(page.getByRole("heading", { name: "Admin panel" })).toBeVisible();
    expect(Number(await page.getByTestId("stat-unassigned").textContent())).toBeGreaterThanOrEqual(3);
    expect(Number(await page.getByTestId("stat-minors").textContent())).toBeGreaterThanOrEqual(1);
    expect(Number(await page.getByTestId("stat-allergies").textContent())).toBeGreaterThanOrEqual(1);
    await expect(teamCard(teamName).getByTestId("team-size")).toHaveText("2/5");
    await expect(soloCard("Boris")).toContainText("Otec Sólo");
    // admin HTML: noindex
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("prehľad: alergie, mladiství, pokrytie rolí a registrácie v čase", async () => {
    const participants = await page.getByTestId("stat-participants").textContent();
    await expect(page.getByRole("link", { name: /S alergiami/ })).toHaveAttribute("href", "/admin/prehlad#alergie");
    await page.getByTestId("insights-link").click();
    await expect(page).toHaveURL(/\/admin\/prehlad$/);
    await expect(page.getByRole("heading", { name: "Prehľad", level: 1 })).toBeVisible();
    await expect(page.getByTestId("ins-participants")).toHaveText(participants!);

    // alergie: tabuľka aj súhrn položiek; text sa zobrazuje doslovne (žiadne HTML/formuly)
    const allergyRow = page.getByTestId("allergies-table").locator("tbody tr").filter({ hasText: "-laktóza" });
    await expect(allergyRow).toHaveCount(1);
    await expect(allergyRow).toContainText("nepriradený");
    await expect(page.getByTestId("allergy-items")).toContainText("-laktóza");

    // mladiství s kontaktom na zástupcu
    const boris = page.getByTestId("minors-table").locator("tbody tr").filter({ hasText: "Boris" });
    await expect(boris).toContainText("Otec Sólo");
    await expect(boris).toContainText("+421 911 111 111");
    await expect(boris).toContainText("áno");

    // pokrytie rolí: tím má dvoch programátorov, grafik chýba
    const row = page.locator(`[data-testid="coverage-row"][data-team-name="${teamName}"]`);
    await expect(row.locator('[data-role="programovanie"]')).toHaveText("2");
    await expect(row.locator('[data-role="grafika"]')).toContainText("chýba");

    expect(Number(await page.getByTestId("signups-7d").textContent())).toBeGreaterThanOrEqual(5);

    await page.getByTestId("back-to-admin").click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("priradenie sólistu do existujúceho tímu", async () => {
    const card = soloCard("Ada");
    await card.getByLabel("Priradiť do tímu").selectOption({ label: `${teamName} (2/5)` });
    await card.getByRole("button", { name: "Priradiť" }).click();
    await expect(teamCard(teamName).getByTestId("team-size")).toHaveText("3/5");
    await expect(teamCard(teamName)).toContainText("Ada Sólová");
    await expect(soloCard("Ada")).toHaveCount(0);
  });

  test("nový tím sa nedá poskladať z hráča, ktorý už je v tíme (server to odmietne)", async () => {
    const card = await openTeam(teamName);
    const memberId = await card.getByTestId("member-card").filter({ hasText: "Ada" }).locator('input[name="participantId"]').first().inputValue();
    // UI ponúka len sólistov – požiadavku upravíme priamo (ako by to spravil niekto s admin session)
    await soloCard("Boris").getByRole("checkbox").check();
    await page.evaluate((id) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "participantIds[]";
      input.value = id;
      input.setAttribute("form", "create-team-form");
      document.getElementById("create-team-form")!.appendChild(input);
    }, memberId);
    const form = page.getByTestId("create-team-form");
    await form.getByLabel("Názov nového tímu").fill(`Únos ${uid()}`);
    await form.getByRole("button", { name: "Vytvoriť tím z vybraných" }).click();
    await expect(form.getByRole("status")).toContainText("už je v tíme");
    await page.reload(); // zahodí podvrhnutý input
    await expect(teamCard(teamName).getByTestId("team-size")).toHaveText("3/5");
    await expect(soloCard("Boris")).toHaveCount(1);
  });

  test("vytvorenie nového tímu zo sólistov", async () => {
    const newName = `Sólo Squad ${uid()}`;
    await soloCard("Boris").getByRole("checkbox").check();
    await soloCard("HYPERLINK").getByRole("checkbox").check();
    const form = page.getByTestId("create-team-form");
    await form.getByLabel("Názov nového tímu").fill(newName);
    await form.getByRole("button", { name: "Vytvoriť tím z vybraných" }).click();
    await expect(teamCard(newName).getByTestId("team-size")).toHaveText("2/5");
    await expect(teamCard(newName)).toContainText("vytvoril admin");
    await expect(soloCard("Boris")).toHaveCount(0);
  });

  test("tímy sú predvolene zbalené – rozbalenie jedného aj všetkých naraz", async () => {
    const cards = page.getByTestId("team-card");
    expect(await cards.count()).toBeGreaterThanOrEqual(2);
    const openStates = () => cards.evaluateAll((els) => els.map((d) => (d as HTMLDetailsElement).open));
    expect(await openStates()).not.toContain(true);
    // zbalený tím ukazuje súhrn (počet, mená), detail (formuláre) je skrytý
    await expect(teamCard(teamName).getByTestId("team-members-preview")).toContainText("Janko Hráč (kapitán)");
    await expect(teamCard(teamName).getByLabel("Poznámky organizátorov")).toBeHidden();

    await openTeam(teamName);
    await expect(teamCard(teamName).getByLabel("Poznámky organizátorov")).toBeVisible();
    await expect(teamCard(teamName).getByTestId("team-members-preview")).toBeHidden();
    await teamCard(teamName).getByTestId("team-summary").click();
    await expect.poll(() => isOpen(teamName)).toBe(false);

    await page.getByTestId("expand-all").click();
    await expect.poll(openStates).not.toContain(false);
    await page.getByTestId("collapse-all").click();
    await expect.poll(openStates).not.toContain(true);
  });

  test("poznámka k tímu (rozbalený tím ostane rozbalený aj po uložení)", async () => {
    const card = await openTeam(teamName);
    await card.getByLabel("Poznámky organizátorov").fill("Potrebujú predlžovačku <script>alert(1)</script>");
    await card.getByRole("button", { name: "Uložiť poznámku" }).click();
    await expect(card.getByRole("status").filter({ hasText: "Poznámka uložená." })).toBeVisible();
    expect(await isOpen(teamName)).toBe(true);
    await expect(card.getByTestId("team-summary")).toContainText("poznámka");
    await page.reload();
    await expect(teamCard(teamName).getByLabel("Poznámky organizátorov")).toHaveValue(/predlžovačku <script>/);
  });

  test("CSV export: BOM, ; oddeľovač, ochrana proti formula injection", async () => {
    const res = await page.request.get("/admin/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="gamejam-hraci-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers()["cache-control"]).toContain("no-store");
    const body = await res.body();
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = body.toString("utf8").slice(1);
    const [header, ...lines] = text.trim().split("\r\n");
    expect(header.split(";")).toContain("Priezvisko");
    expect(header.split(";").length).toBe(17);
    const evil = lines.find((l) => l.includes("HYPERLINK"))!;
    expect(evil).toBeTruthy();
    expect(evil).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(evil).toContain(";'+cmd;");
    expect(evil).toContain(";'@SUM(A1);");
    expect(evil).toContain(";'-laktóza;");
    expect(evil).not.toMatch(/;[=+@-]/);

    const diet = await page.request.get("/admin/export?type=diet");
    expect(diet.status()).toBe(200);
    const dietText = (await diet.body()).toString("utf8");
    expect(dietText.charCodeAt(0)).toBe(0xfeff);
    expect(dietText).toContain("'-laktóza");
    expect(dietText).not.toContain("@example.com");
  });

  test("presun hráča medzi nepriradených a zmazanie (dvojkrokové potvrdenie)", async () => {
    const member = (await openTeam(teamName)).getByTestId("member-card").filter({ hasText: "Ada" });
    await member.getByLabel("Presunúť do").selectOption({ label: "medzi nepriradených" });
    await member.getByRole("button", { name: "Presunúť" }).click();
    await expect(soloCard("Ada")).toHaveCount(1);

    const card = soloCard("Ada");
    await card.getByTestId("delete-person").click();
    await expect(card.getByText("Naozaj?")).toBeVisible();
    await card.getByTestId("delete-person-confirm").click();
    await expect(soloCard("Ada")).toHaveCount(0);
  });

  test("zmazanie tímu – členovia sa presunú medzi nepriradených", async () => {
    const card = await openTeam(teamName);
    await card.getByTestId("delete-team").click();
    await card.getByTestId("delete-team-confirm").click();
    await expect(teamCard(teamName)).toHaveCount(0);
    await expect(page.getByTestId("solo-card").filter({ hasText: "Janko" }).first()).toBeVisible();
  });

  test("danger zone vyžaduje presný text VYMAZAŤ; server action bez session nič nezmaže", async ({ browser }) => {
    const form = page.getByTestId("wipe-form");
    await form.getByLabel(/Pre potvrdenie napíš/).fill("vymazat");
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]),
      form.getByRole("button", { name: "Vymazať všetky dáta" }).click(),
    ]);
    await expect(form.getByRole("status")).toContainText("VYMAZAŤ");
    const before = Number(await page.getByTestId("stat-participants").textContent());
    expect(before).toBeGreaterThan(0);

    // replay tej istej server action (už so správnym textom) z kontextu BEZ session cookie
    const body = (req.postData() ?? "").replace("vymazat", "VYMAZAŤ");
    expect(body).toContain("VYMAZAŤ");
    const anon = await newContext(browser);
    const res = await anon.request.post(new URL(req.url()).pathname, {
      headers: {
        "next-action": req.headers()["next-action"],
        "content-type": req.headers()["content-type"],
        origin: new URL(req.url()).origin,
        accept: "text/x-component",
      },
      data: Buffer.from(body, "utf8"),
      maxRedirects: 0,
    });
    expect(await res.text()).not.toContain("boli vymazané");
    await anon.close();
    await page.reload();
    await expect(page.getByTestId("stat-participants")).toHaveText(String(before));
  });

  test("audit log zaznamenal akcie (bez osobných údajov)", async () => {
    await page.reload();
    const log = page.getByTestId("audit-log");
    const actions = page.getByTestId("audit-actions");
    for (const a of ["login_ok", "export", "export_diet", "assign", "create_team", "delete_participant", "delete_team"]) {
      await expect(actions.locator(`tr[data-action="${a}"]`).first(), a).toBeVisible();
    }
    await expect(actions.locator('tr[data-action^="login_fail"]')).toHaveCount(0);
    const text = (await log.textContent()) ?? "";
    expect(text).not.toContain("@example.com");
    expect(text).not.toContain("Ada");
  });

  test("odhlásenie zneplatní aj skopírovaný token (/admin/export → 401)", async ({ browser }) => {
    const cookie = (await ctx.cookies()).find((c) => c.name === "__Host-gj_admin");
    expect(cookie?.value).toBeTruthy();
    // pred odhlásením token funguje aj v inom kontexte
    const thief = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": freshIp(), cookie: `__Host-gj_admin=${cookie!.value}` },
    });
    expect((await thief.request.get("/admin/export", { maxRedirects: 0 })).status()).toBe(200);

    // prihlásený na /admin/login → späť do adminu (rozhoduje stránka, nie proxy)
    await page.goto("/admin/login");
    await expect(page).toHaveURL(/\/admin$/);

    await page.getByTestId("logout").click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    expect((await thief.request.get("/admin/export", { maxRedirects: 0 })).status()).toBe(401);
    const tp = await thief.newPage();
    await tp.goto("/admin");
    await expect(tp).toHaveURL(/\/admin\/login$/);
    // odvolaný (ale podpisom platný) token nesmie spôsobiť slučku /admin/login ↔ /admin
    await expect(tp.getByLabel("Heslo organizátora")).toBeVisible();
    await tp.waitForTimeout(1500);
    await expect(tp).toHaveURL(/\/admin\/login$/);
    const direct = await thief.request.get("/admin/login", { maxRedirects: 0 });
    expect(direct.status()).toBe(200);
    await thief.close();
  });

  test("po odhlásení je admin nedostupný", async () => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    const exp = await page.request.get("/admin/export", { maxRedirects: 0 });
    expect(exp.status()).toBe(401);
  });
});

test.describe("admin – vymazanie všetkých dát (beží posledné)", () => {
  test("VYMAZAŤ zmaže všetko", async ({ browser }) => {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await login(page);
    await expect(page).toHaveURL(/\/admin$/);
    const form = page.getByTestId("wipe-form");
    await form.getByLabel(/Pre potvrdenie napíš/).fill("VYMAZAŤ");
    await form.getByRole("button", { name: "Vymazať všetky dáta" }).click();
    await expect(page.getByTestId("stat-participants")).toHaveText("0");
    await expect(page.getByTestId("stat-teams")).toHaveText("0");
    await ctx.close();
  });
});
