import { expect, test } from "@playwright/test";
import { clientIpFromHeaders, ipConfigFromEnv, parseIp, type IpConfig } from "../src/lib/client-ip";
import { uniqueViolationResult } from "../src/lib/registration-errors";

// Unit testy čistej logiky (bežia v Node procese Playwrightu, bez prehliadača a servera).

const h = (headers: Record<string, string>) => (name: string) => headers[name.toLowerCase()];
const cfg = (c: Partial<IpConfig> = {}): IpConfig => ({ trustProxy: true, hops: 1, vercel: false, ...c });

test.describe("client IP", () => {
  test("bez TRUST_PROXY sa hlavičkám neverí", () => {
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "1.2.3.4" }), cfg({ trustProxy: false }))).toBeNull();
  });

  test("X-Forwarded-For: berie sa N-tý záznam sprava", () => {
    const xff = "6.6.6.6, 203.0.113.9, 10.0.0.2";
    expect(clientIpFromHeaders(h({ "x-forwarded-for": xff }), cfg({ hops: 1 }))).toBe("10.0.0.2");
    expect(clientIpFromHeaders(h({ "x-forwarded-for": xff }), cfg({ hops: 2 }))).toBe("203.0.113.9");
    // menej záznamov ako hopov → najľavejší (pripísala ho naša prvá proxy)
    expect(clientIpFromHeaders(h({ "x-forwarded-for": "203.0.113.9" }), cfg({ hops: 3 }))).toBe("203.0.113.9");
    // rotovanie ľavej časti nič nemení
    for (const spoof of ["1.1.1.1", "8.8.8.8, 9.9.9.9", "garbage"]) {
      expect(clientIpFromHeaders(h({ "x-forwarded-for": `${spoof}, 198.51.100.4` }), cfg())).toBe("198.51.100.4");
    }
  });

  test("neplatné hodnoty → null", () => {
    for (const v of ["", "evil", "1.2.3", "999.1.1.1", "<script>", "a".repeat(200)]) {
      expect(clientIpFromHeaders(h({ "x-forwarded-for": v }), cfg()), v).toBeNull();
    }
  });

  test("CLIENT_IP_HEADER má prednosť (nginx x-real-ip, Cloudflare cf-connecting-ip)", () => {
    const headers = h({ "x-forwarded-for": "6.6.6.6", "cf-connecting-ip": "203.0.113.50", "x-real-ip": "10.1.1.1" });
    expect(clientIpFromHeaders(headers, cfg({ clientIpHeader: "cf-connecting-ip" }))).toBe("203.0.113.50");
    expect(clientIpFromHeaders(headers, cfg({ clientIpHeader: "x-real-ip" }))).toBe("10.1.1.1");
    expect(clientIpFromHeaders(h({}), cfg({ clientIpHeader: "x-real-ip" }))).toBeNull();
  });

  test("Vercel → x-real-ip", () => {
    const headers = h({ "x-forwarded-for": "6.6.6.6, 7.7.7.7", "x-real-ip": "203.0.113.77" });
    expect(clientIpFromHeaders(headers, cfg({ vercel: true }))).toBe("203.0.113.77");
  });

  test("normalizácia: port, IPv4-mapped, IPv6 → /64", () => {
    expect(parseIp("203.0.113.5:4433")).toBe("203.0.113.5");
    expect(parseIp("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(parseIp("[2001:db8:1:2::1]:443")).toBe("2001:db8:1:2::/64");
    expect(parseIp("2001:0DB8:0001:0002:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(parseIp("2001:db8:1:2::ffff")).toBe(parseIp("2001:db8:1:2:9::1"));
    expect(parseIp("2001:db8:1:3::1")).not.toBe(parseIp("2001:db8:1:2::1"));
    expect(parseIp("::1")).toBe("0:0:0:0::/64");
  });

  test("konfigurácia z env", () => {
    expect(ipConfigFromEnv({ NODE_ENV: "production" })).toMatchObject({ trustProxy: false, hops: 1 });
    expect(ipConfigFromEnv({ NODE_ENV: "production", VERCEL: "1" })).toMatchObject({ trustProxy: true, vercel: true });
    expect(ipConfigFromEnv({ NODE_ENV: "production", TRUST_PROXY: "true", TRUSTED_PROXY_HOPS: "2" }).hops).toBe(2);
    expect(ipConfigFromEnv({ NODE_ENV: "production", TRUST_PROXY: "true", TRUSTED_PROXY_HOPS: "x" }).hops).toBe(1);
    expect(ipConfigFromEnv({ NODE_ENV: "production", CLIENT_IP_HEADER: "CF-Connecting-IP" }).clientIpHeader).toBe(
      "cf-connecting-ip",
    );
  });
});

test.describe("unique violation → pole formulára", () => {
  const people = [
    { email: "lider@example.com", key: "leader" },
    { email: "clen@example.com", key: "members.0" },
    { email: null, key: "members.1" },
  ];
  test("e-mail člena aj lídra podľa detailu chyby", () => {
    expect(
      uniqueViolationResult(
        { constraint: "participants_email_lower_uq", detail: "Key (lower(email))=(clen@example.com) already exists." },
        people,
      ),
    ).toMatchObject({ ok: false, fieldErrors: { "members.0.email": "Tento e-mail je už zaregistrovaný" } });
    expect(
      uniqueViolationResult(
        { constraint: "participants_email_lower_uq", detail: "Key (lower(email))=(LIDER@example.com) already exists." },
        people,
      ),
    ).toMatchObject({ fieldErrors: { "leader.email": "Tento e-mail je už zaregistrovaný" } });
  });
  test("názov tímu", () => {
    expect(uniqueViolationResult({ constraint: "teams_name_lower_uq" }, people)).toMatchObject({
      fieldErrors: { teamName: "Tím s týmto názvom už existuje" },
    });
  });
  test("neznáme → všeobecná hláška bez poľa", () => {
    const r = uniqueViolationResult({ constraint: "participants_email_lower_uq" }, people);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors).toBeUndefined();
    expect(uniqueViolationResult({}, people)).toMatchObject({ ok: false });
  });
});
