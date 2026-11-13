import { expect, test } from "@playwright/test";
import { csvCell, toCsv } from "../src/lib/csv";
import { DEVICE_TTL_SECONDS, readDeviceToken, signDeviceToken } from "../src/lib/device-token";

// Unit testy čistej logiky (bežia v Node procese Playwrightu, bez prehliadača a servera).

/** Rozdelí riadok CSV podľa oddeľovača; úvodzovky platia len na začiatku poľa (ako Excel/RFC 4180). */
function splitCsvLine(line: string, delim: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let v = "";
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { v += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else v += line[i++];
      }
      while (i < line.length && line[i] !== delim) v += line[i++];
      fields.push(v);
    } else {
      const end = line.indexOf(delim, i);
      fields.push(end < 0 ? line.slice(i) : line.slice(i, end));
      if (end < 0) break;
      i = end;
    }
    i++;
  }
  return fields;
}

const PAYLOADS = [
  "X,=1+1,Y",
  "A\t=1+1\tB",
  "orechy, -laktóza",
  "a;@SUM(A1)",
  "riadok\n=1+1",
  "=HYPERLINK(\"http://evil\")",
  " =1+1",
  "-laktóza",
  "+cmd",
  "\r=1",
];

test.describe("CSV export – ochrana proti formula injection", () => {
  test("žiadne pole nezačína vzorcom pri delení podľa ; , ani TAB", () => {
    const csv = toCsv(["tím", "a", "b"], PAYLOADS.map((p) => ["Tím", p, "z"]));
    const lines = csv.replace(/^﻿/, "").split("\r\n").filter(Boolean);
    for (const delim of [";", ",", "\t"]) {
      for (const line of lines) {
        for (const field of splitCsvLine(line, delim)) {
          expect(field, `delim ${JSON.stringify(delim)} line ${JSON.stringify(line)}`).not.toMatch(/^\s*[=+\-@]/);
        }
      }
    }
  });

  test("bežné hodnoty ostávajú čitateľné", () => {
    expect(csvCell("Ján Novák")).toBe("Ján Novák");
    expect(csvCell("Anna-Mária")).toBe("Anna-Mária");
    expect(csvCell("orechy, laktóza")).toBe('"orechy, laktóza"');
    expect(csvCell("-laktóza")).toBe("'-laktóza");
    expect(csvCell("X,=1+1,Y")).toBe("\"X,'=1+1,Y\"");
    expect(csvCell("A\tB")).toBe("A B");
    expect(csvCell(null)).toBe("");
  });
});

test.describe("cookie zapamätaného zariadenia", () => {
  const env = { ...process.env };
  test.beforeEach(() => {
    process.env.SESSION_SECRET = "unit-test-session-secret-0123456789abcdef";
    process.env.ADMIN_PASSWORD_HASH = "scrypt:16384:8:1:AAAAAAAAAAAAAAAAAAAAAA==:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  });
  test.afterEach(() => {
    for (const k of ["SESSION_SECRET", "ADMIN_PASSWORD_HASH"] as const) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
  });

  test("podpísaná cookie sa overí a vráti ID zariadenia", () => {
    const token = signDeviceToken();
    const id = readDeviceToken(token);
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(token).toContain(`.${id}.`);
    const exp = Number(token.split(".")[2]);
    expect(exp - Date.now()).toBeGreaterThan((DEVICE_TTL_SECONDS - 60) * 1000);
  });

  test("podvrhnutá, upravená alebo expirovaná cookie neplatí", () => {
    const token = signDeviceToken();
    const [v, id, exp, mac] = token.split(".");
    expect(readDeviceToken(`${v}.${id}.${exp}.${"A".repeat(43)}`)).toBeNull();
    expect(readDeviceToken(`${v}.${"B".repeat(22)}.${exp}.${mac}`)).toBeNull();
    expect(readDeviceToken(`${v}.${id}.${Number(exp) + 1000}.${mac}`)).toBeNull();
    expect(readDeviceToken(`${v}.${id}.${Date.now() - 1000}.${mac}`)).toBeNull();
    expect(readDeviceToken(undefined)).toBeNull();
    expect(readDeviceToken("garbage")).toBeNull();
  });

  test("zmena admin hesla zneplatní zapamätané zariadenia", () => {
    const token = signDeviceToken();
    process.env.ADMIN_PASSWORD_HASH = "scrypt:16384:8:1:BBBBBBBBBBBBBBBBBBBBBB==:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
    expect(readDeviceToken(token)).toBeNull();
  });

  test("iný SESSION_SECRET → cookie neplatí", () => {
    const token = signDeviceToken();
    process.env.SESSION_SECRET = "other-unit-test-session-secret-0123456789";
    expect(readDeviceToken(token)).toBeNull();
  });
});
