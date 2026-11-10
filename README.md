# GameJam 2027 – registračný web

Jednostránkový registračný web v štýle pixel/HUD plagátu (GAME JAM + džem 2027) s admin rozhraním pre organizátorov.

- **Verejná stránka `/`**:
  - HUD s odpočtom do štartu, animovaný pixel nadpis, info o evente a výhrach.
  - Registrácia **tímu** (kapitán + 1–4 hráči) alebo **sóla** (organizátori ho priradia do tímu).
  - Pri hráčoch pod 18 rokov formulár pýta údaje a súhlas zákonného zástupcu.
  - Súhlas so spracovaním údajov podľa GDPR. Ak niekto uvedie alergie, pýta aj výslovný súhlas so spracovaním údajov o zdraví.
- **Admin `/admin`**:
  - Prehľad tímov a sólistov, priradenie sólistu do tímu alebo vytvorenie nového tímu zo sólistov.
  - Presuny hráčov, premenovanie tímu, zmena kapitána, poznámky, mazanie.
  - Export CSV (všetko alebo strava/alergie), audit log a vymazanie všetkých dát po evente.

## Stack

| Vrstva | Technológia |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Actions, Cache Components), React 19, TypeScript |
| UI | Tailwind CSS 4, vlastné CSS animácie (bez knižníc), self-hosted fonty Space Mono a Silkscreen (s doplnenými slovenskými znakmi) |
| Validácia | zod 4 – rovnaká schéma na klientovi aj serveri (`src/lib/validation.ts`) |
| Databáza | PostgreSQL cez Drizzle ORM; lokálne PGlite (Postgres vo WASM, nič netreba inštalovať) |
| Auth | heslo organizátora (scrypt) + podpísaná session v httpOnly cookie (JWT, jose) |
| Testy | Playwright E2E (49 testov) |

## Rýchly štart (lokálne)

```bash
npm install
cp .env.example .env.local
npm run admin:hash -- "tvoje-silne-heslo"   # výstup vlož do ADMIN_PASSWORD_HASH v .env.local
npm run dev                                  # http://localhost:3000, admin na /admin
```

Bez `DATABASE_URL` sa použije lokálna PGlite databáza v `./.data/pglite` a migrácie prebehnú automaticky.

## Nasadenie

Podrobný návod pre **Vercel + Neon** aj **Docker (docker compose + Postgres)** je v [`docs/DEPLOY.md`](docs/DEPLOY.md). Obsahuje aj nastavenie reverse proxy (nginx, Caddy, Cloudflare), premenné prostredia, export a mazanie dát.

## Čo treba doplniť pred spustením

Všetko je v **`src/lib/event.ts`**:

- `contactEmail` – kontakt na organizátorov (teraz `gamejam@example.com`),
- `dataController` – prevádzkovateľ osobných údajov (názov, adresa, IČO) do textu „Ako spracúvame tvoje údaje“,
- dátumy, miesto a výhry, ak sa zmenia. Ak sa zmenia, pregeneruj aj `src/app/opengraph-image.png`.

Odporúčam, aby text o spracúvaní údajov a súhlasy (najmä za spoluhráčov, údaje o zdraví a neplnoletých) skontroloval niekto zodpovedný za GDPR na fakulte.

## Štruktúra

```
src/app/page.tsx                 verejná stránka (HUD, hero, info, registrácia, floor)
src/components/                  pixel art, HUD, formulár (RegistrationForm, PersonCard…)
src/app/actions/register.ts      server action registrácie (validácia, rate limit, token formulára)
src/app/actions/admin.ts         admin akcie (každá overuje session)
src/app/admin/                   admin UI, login, CSV export
src/lib/                         event.ts, validation.ts, auth, CSP, IP, CSV, audit
src/db/                          Drizzle schéma a pripojenie (Postgres / PGlite)
drizzle/                         SQL migrácie
src/assets/pixel-art.json        vektorové pixel assety vyexportované z plagátu (Affinity)
public/partners, public/fonts    logá partnerov, pixel font
tests/                           Playwright E2E testy
```

## Testy

```bash
npm run typecheck && npm run lint
npm run test:e2e        # build + Playwright proti produkčnému serveru s čistou PGlite DB
```

`/__test/register` je pomocná stránka iba pre E2E testy. Funguje len pri `E2E=1`, inak vracia 404.

## Bezpečnosť (stručne)

- **Validácia:** všetky vstupy validuje server (zod); údaje o zástupcovi sa ukladajú len pri neplnoletých.
- **Ochrana registrácie:**
  - rate limit na úspešné aj neúspešné pokusy,
  - honeypot,
  - podpísaný token formulára, ktorý odmietne odoslanie za menej ako 3 s.
- **Admin:**
  - scrypt hash hesla,
  - brute-force ochrana (pokus sa zapíše pred overením, s limitom súbehu),
  - cookie `__Host-` (httpOnly, Secure, SameSite=Strict),
  - odhlásenie zneplatní tokeny,
  - každá stránka, akcia aj export overuje session na serveri.
- **Hlavičky:**
  - admin má CSP s nonce,
  - ďalej HSTS, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP,
  - admin a osobné údaje sa necachujú (`no-store`, `noindex`).
- **CSV export:** chránený proti formula injection.
- **Logy:** bez osobných údajov. IP sa ukladá iba ako HMAC odtlačok a po 30 dňoch sa anonymizuje.
- **Nezávislý review:** urobil ho samostatný audítor. Všetky nálezy (podvrhnutie IP cez X-Forwarded-For, súbehy pri brute-force, invalidácia session pri odhlásení, enumerácia e-mailov, token formulára, Postgres roly v Dockeri…) sú opravené a pokryté testami.
- **Voliteľné rozšírenia** (vyžadujú externú službu): CAPTCHA (Cloudflare Turnstile) a potvrdzovanie e-mailov (double opt-in). Pozri `docs/DEPLOY.md`.

## Licencie assetov

Pixel písmo Silkscreen je pod licenciou SIL OFL 1.1 (`public/fonts/SILKSCREEN-OFL.txt`) a je doplnené o slovenské znaky (`scripts/build-pixel-font.py`). Space Mono je tiež pod OFL. Logá partnerov patria ich vlastníkom.
