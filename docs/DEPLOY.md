# Nasadenie a prevádzka – GameJam 2027

Aplikácia beží na **Verceli (Neon/Supabase Postgres)** aj v **Dockeri (docker compose + Postgres 17)**.
Lokálne sa dá vyvíjať bez inštalácie databázy (PGlite).

## Premenné prostredia

Kompletný vzor s komentármi je v [`.env.example`](../.env.example).

| Premenná | Povinná v produkcii | Popis |
| --- | --- | --- |
| `DATABASE_URL` | áno | `postgres://…` (Neon/Supabase/compose). Lokálne prázdne → PGlite v `./.data/pglite`. `pglite:./cesta` = PGlite explicitne. |
| `SESSION_SECRET` | áno | ≥ 32 znakov, podpis admin session (JWT HS256). `openssl rand -base64 48` |
| `ADMIN_PASSWORD_HASH` | áno | `npm run admin:hash -- "heslo"` (scrypt). |
| `IP_HASH_SECRET` | áno | ≥ 16 znakov, HMAC kľúč pre IP adresy (rate limit, brute-force). |
| `FORM_TOKEN_SECRET` | – | ≥ 16 znakov, podpis tokenu formulára (inak sa použije `IP_HASH_SECRET`). |
| `TRUST_PROXY` | – | `true` iba za reverse proxy (na Verceli automaticky). Pozri [IP klienta](#ip-klienta-a-reverse-proxy). |
| `TRUSTED_PROXY_HOPS` | – | počet dôveryhodných proxy (default 1) – IP = N-tý záznam `X-Forwarded-For` sprava. |
| `CLIENT_IP_HEADER` | – | hlavička s IP od tvojej proxy (`x-real-ip`, `cf-connecting-ip`), má prednosť pred XFF. |
| `REGISTRATION_OPEN` | – | `false` = registrácia uzavretá. |
| `DATABASE_URL_UNPOOLED` | – | priame spojenie pre migrácie (Neon). |
| `MIGRATION_DATABASE_URL` | – | spojenie vlastníka schémy len pre migrácie (má prednosť). |
| `POSTGRES_PASSWORD` | compose | heslo vlastníka DB `gamejam` (len migrácie; `[A-Za-z0-9]`). |
| `APP_DB_PASSWORD` | compose | heslo aplikačnej roly `gamejam_app` (len DML; `[A-Za-z0-9]`). |

Bez `SESSION_SECRET` alebo `DATABASE_URL` server v produkcii odmietne štartovať (chyba v logu).
Vývojové náhradné tajomstvá existujú **iba** v `next dev` (`NODE_ENV=development`); inde chýbajúci kľúč = chyba.
Bez platného `ADMIN_PASSWORD_HASH` je admin prihlásenie úplne vypnuté (verejná registrácia beží ďalej).

## Admin heslo

```bash
npm run admin:hash -- "silne-heslo-aspon-12-znakov"
# alebo bez histórie shellu:  npm run admin:hash   (heslo sa zadá na stdin)
```

Výstup (`scrypt:32768:8:1:…`) vlož do `ADMIN_PASSWORD_HASH`. Zmena hashu odhlási všetky admin sessions.
Admin je na `/admin` (prihlásenie `/admin/login`).

Ochrana prihlásenia:
- každý pokus sa zapíše **pred** overením hesla (v transakcii so zámkom) → ani paralelné pokusy neprekročia limit,
- spoľahlivá IP (`TRUST_PROXY=true`): po 5 neúspechoch / 15 min je IP zablokovaná (aj so správnym heslom),
- nespoľahlivá IP (`TRUST_PROXY=false`, všetci v jednom „buckete“): žiadny zámok (útočník by zamkol aj
  organizátorov), ale progresívne oneskorenie 2^(n−5) s, max. 30 s,
- viac ako 50 neúspechov / 15 min globálne → spomalenie pre všetkých; najviac 3 súbežné scrypt výpočty
  (pri preťažení „Server je práve vyťažený“).
- **Odhlásenie zneplatní všetky doteraz vydané admin tokeny** (aj u ostatných organizátorov – heslo je spoločné).

Admin má **audit log** (posledných 30 akcií: prihlásenia, exporty, presuny, mazania, wipe) – bez osobných údajov,
len skrátený HMAC odtlačok IP.

> Session cookie `__Host-gj_admin` je `Secure` → admin funguje len cez **HTTPS** (alebo `http://localhost`).

## Lokálny vývoj

```bash
cp .env.example .env.local        # stačí doplniť ADMIN_PASSWORD_HASH (ostatné má vývojové fallbacky)
npm run dev                       # PGlite v ./.data/pglite, migrácie sa aplikujú automaticky
```

PGlite je jednoprocesová – `npm run db:migrate` nespúšťaj, kým beží `npm run dev` nad tým istým adresárom.
Zmena schémy: uprav `src/db/schema.ts` → `npm run db:generate` → commitni nový súbor v `drizzle/`.

## Vercel + Neon

1. Vercel → Storage → **Neon** (alebo Neon účet a `DATABASE_URL` ručne). Použi **pooled** URL
   (`…-pooler…`), Neon integrácia nastaví aj `DATABASE_URL_UNPOOLED` (migrácie ho použijú).
2. Project Settings → Environment Variables: `SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, `IP_HASH_SECRET`
   (+ voliteľne `REGISTRATION_OPEN`). `TRUST_PROXY` netreba.
3. Migrácie – zvoľ jedno:
   - **Build command** `npm run vercel-build` (= `node scripts/migrate.mjs && next build`), DB premenné
     musia byť dostupné aj pri builde. Pozor: preview deploye by migrovali tú istú DB – pre preview
     nastav inú (Neon branch) alebo build command len pre Production.
   - **Ručne** pred deployom: `DATABASE_URL=… npm run db:migrate`.
4. Deploy. `output: "standalone"` sa na Verceli automaticky vypína (detekcia `VERCEL`).

Supabase: použi „Transaction pooler“ URL (port 6543); prepared statements sú vypnuté (`DATABASE_PREPARE`).

## Docker (vlastný server)

```bash
cp .env.example .env       # vyplň POSTGRES_PASSWORD, APP_DB_PASSWORD, SESSION_SECRET,
                           # ADMIN_PASSWORD_HASH, IP_HASH_SECRET a TRUST_PROXY=true (za reverse proxy)
docker compose up -d --build
docker compose logs migrate app   # „[db:migrate] Postgres – hotovo“ a „Ready“
```

- Obraz: `node:22-alpine`, multi-stage, beží ako neprivilegovaný používateľ `nextjs`, read-only FS,
  healthcheck na `/robots.txt`.
- Služby: `db` (Postgres 17) → `migrate` (jednorazovo, migrácie pod vlastníkom) → `app` (`SKIP_MIGRATIONS=true`).
- Aplikácia počúva na `127.0.0.1:3000` – pred ňu daj HTTPS reverse proxy (pozri nižšie) a `TRUST_PROXY=true`.

### Postgres role v Dockeri

| Rola | Heslo | Práva | Používa |
| --- | --- | --- | --- |
| `gamejam` | `POSTGRES_PASSWORD` | vlastník DB (superuser kontajnera) | iba služba `migrate` (`MIGRATION_DATABASE_URL`) |
| `gamejam_app` | `APP_DB_PASSWORD` | `CONNECT`, `USAGE` na `public`, `SELECT/INSERT/UPDATE/DELETE` na tabuľky (aj budúce) | aplikácia (`DATABASE_URL`) |

Rolu zakladá `docker/postgres-init/01-app-role.sh` – oficiálny obraz ho spúšťa **len pri prvej inicializácii
prázdneho volume**. Pri existujúcom volume ho spusti ručne:
```bash
docker compose exec -e APP_DB_PASSWORD="$APP_DB_PASSWORD" db sh /docker-entrypoint-initdb.d/01-app-role.sh
```
Aplikácia tak nemôže meniť schému (žiadne `CREATE/DROP/ALTER`) ani čítať tabuľku migrácií.
Na Verceli/Neone to isté dosiahneš rolou s DML právami v `DATABASE_URL` a vlastníkom v `MIGRATION_DATABASE_URL`.
- Databáza je len v internej sieti compose, dáta vo volume `pgdata`. Záloha:
  `docker compose exec db pg_dump -U gamejam gamejam > zaloha.sql`
- Viac inštancií: nastav rovnaký `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` na všetkých.

Bez Dockeru: `npm ci && npm run build && npm run db:migrate`, potom
`cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/` a `node .next/standalone/server.js`.

## IP klienta a reverse proxy

Rate limit registrácií a zámok prihlásenia stoja na IP klienta. Aplikácia jej verí, len ak `TRUST_PROXY=true`:

- **Vercel**: automaticky, používa `x-real-ip` (nastavuje Vercel edge).
- **X-Forwarded-For**: každá proxy pripisuje adresu, od ktorej prijala spojenie, **na koniec**. Ľavé záznamy
  si klient vymyslí, preto sa berie N-tý záznam sprava, N = `TRUSTED_PROXY_HOPS` (default 1 = jedna proxy).
- **`CLIENT_IP_HEADER`**: ak proxy nastavuje vlastnú hlavičku (napr. `X-Real-IP $remote_addr`), použije sa tá.
- IPv6 sa zlučuje na prefix /64 (jedna domácnosť/klient dostáva celý /64).
- Aplikácia nesmie byť dostupná obchádzkou proxy (v compose počúva len na `127.0.0.1`).

**Caddy** (od v2.5 prichádzajúce `X-Forwarded-For` od klientov mimo `trusted_proxies` ignoruje a nastaví skutočnú adresu klienta):
```
gamejam.example.sk {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```
`.env`: `TRUST_PROXY=true`, `TRUSTED_PROXY_HOPS=1`.

**nginx**:
```nginx
server {
    listen 443 ssl http2;
    server_name gamejam.example.sk;
    # ssl_certificate … / ssl_certificate_key …
    client_max_body_size 128k;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        # NEPRIPÁJAJ ku klientskej hodnote ($proxy_add_x_forwarded_for), ale prepíš ju:
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
`.env`: `TRUST_PROXY=true` a buď `TRUSTED_PROXY_HOPS=1`, alebo `CLIENT_IP_HEADER=x-real-ip`.

**Cloudflare pred nginx/Caddy**: `CLIENT_IP_HEADER=cf-connecting-ip` – iba ak je origin dostupný výhradne
z IP rozsahov Cloudflare (firewall), inak si hlavičku podvrhne ktokoľvek. Alternatíva: `TRUSTED_PROXY_HOPS=2`
s nginx `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` (Cloudflare → nginx → app).

Bez proxy (`TRUST_PROXY=false`) zdieľajú všetci jeden limit a server pri štarte zaloguje varovanie.

## Ochrana registrácie

- **Token formulára**: server pri renderi formulára vydá podpísaný čas (`formToken`); odoslanie skôr ako
  3 s alebo neskôr ako 24 h po otvorení, alebo s podvrhnutým tokenom, sa odmietne („obnov stránku“).
- **Honeypot** pole – vyplnené = predstieraný úspech, nič sa neuloží.
- **Rate limit**: max. 20 pokusov (aj neplatných/duplicitných – brzda proti zisťovaniu, či je e-mail
  zaregistrovaný) a 5 úspešných registrácií za hodinu z jednej IP.
- **Uchovávanie**: HMAC IP v registráciách a audite sa po 30 dňoch anonymizuje (`purged`), záznamy pokusov
  sa mažú po 24 h. Ku každej registrácii sa ukladá verzia textu súhlasov (`CONSENT_VERSION` v `src/lib/event.ts` –
  pri zmene textu súhlasu ju zvýš).
- **Voliteľné rozšírenia (zámerne nepoužité)**: CAPTCHA (napr. self-hosted ALTCHA/Friendly Captcha, Cloudflare
  Turnstile) a double opt-in potvrdenie e-mailom. Vyžadujú externú službu alebo odosielanie e-mailov –
  pri malom evente to nevyvažuje GDPR/UX náklady; zváž ich pri spame.

## Export dát

V admine tlačidlá **Export CSV** (`/admin/export`, všetci hráči) a **Export strava/alergie**
(`/admin/export?type=diet`). CSV je UTF-8 s BOM a oddeľovačom `;` → otvorí sa priamo v slovenskom Exceli.
Hodnoty začínajúce `= + - @` sú prefixnuté `'` (ochrana proti formula injection).
Export obsahuje osobné údaje – neposielaj ho e-mailom ďalej, po evente ho zmaž.

## Vymazanie dát (GDPR)

Po skončení eventu (a vyhodnotení) v admine → **Danger zone** → napíš `VYMAZAŤ` → vymažú sa všetky
registrácie, tímy, hráči aj záznamy o pokusoch (audit log bez osobných údajov ostáva, pribudne doň „wipe“).
Formulár sľubuje vymazanie do 3 mesiacov po evente – po `EVENT.endsAt` + 90 dní zobrazí admin varovný banner. Akcia je nevratná; zálohy DB (Neon point-in-time,
`pg_dump` súbory) treba zmazať/nechať expirovať samostatne.

## Testy

```bash
npm run typecheck && npm run lint
npm run test:e2e      # next build + Playwright proti standalone serveru s čistou PGlite DB (port 3202)
E2E_DATABASE_URL=postgres://…prázdna-testovacia-db… npx playwright test   # to isté proti Postgresu
```

E2E spúšťa dve inštancie: hlavnú (`TRUST_PROXY=true`, port 3202) a druhú bez dôveryhodnej proxy
(`TRUST_PROXY=false`, port 3204) pre testy spoločného bucketu. E2E server zapína `E2E=1`, ktoré sprístupní dočasnú stránku `/__test/register`
(`src/app/%5F_test/register`). **V produkcii `E2E` nikdy nenastavuj**; stránku možno po integrácii
verejného formulára zmazať.
