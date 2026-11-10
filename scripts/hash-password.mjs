#!/usr/bin/env node
// Vygeneruje hodnotu pre ADMIN_PASSWORD_HASH.
//   npm run admin:hash -- "moje-silne-heslo"
//   (bez argumentu sa heslo načíta zo stdin, aby neostalo v histórii shellu)
// Formát: scrypt:N:r:p:saltB64:hashB64 – rovnaký overuje src/lib/auth.ts.
// (oddeľovač „:“ namiesto „$“, lebo $ by rozbila interpolácia v .env (Next.js) aj v docker compose)
import { randomBytes, scrypt } from "node:crypto";

const N = 2 ** 15, r = 8, p = 1, KEYLEN = 64;

async function readStdin() {
  if (process.stdin.isTTY) process.stderr.write("Zadaj heslo a stlač Enter: ");
  let data = "";
  for await (const chunk of process.stdin) {
    data += chunk;
    if (process.stdin.isTTY && data.includes("\n")) break;
  }
  return data.replace(/\r?\n$/, "");
}

const password = process.argv[2] ?? (await readStdin());
if (!password || password.length < 12) {
  console.error("Heslo musí mať aspoň 12 znakov.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = await new Promise((resolve, reject) =>
  scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r, p, maxmem: 256 * N * r * p }, (e, k) =>
    e ? reject(e) : resolve(k),
  ),
);
const value = `scrypt:${N}:${r}:${p}:${salt.toString("base64")}:${hash.toString("base64")}`;
console.log(value);
console.error("\nVlož do .env / Vercel env ako ADMIN_PASSWORD_HASH=<hodnota vyššie>.");
