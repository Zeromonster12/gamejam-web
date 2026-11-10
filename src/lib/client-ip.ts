import { isIP } from "node:net";

/**
 * Čistá logika zistenia IP klienta z hlavičiek (bez Next.js API → dá sa unit-testovať).
 *
 * Pravidlá:
 *  - `trustProxy === false` → IP nepoznáme (hlavičky môže poslať ktokoľvek).
 *  - `clientIpHeader` (CLIENT_IP_HEADER, napr. `x-real-ip`, `cf-connecting-ip`) → hodnota tejto
 *    hlavičky, ktorú nastavuje NAŠA proxy (klient ju nemôže podvrhnúť, proxy ju prepisuje).
 *  - Vercel → `x-real-ip` (nastavuje ho Vercel edge).
 *  - inak `X-Forwarded-For`: berie sa N-tý záznam ZPRAVA (N = TRUSTED_PROXY_HOPS, default 1).
 *    Každá proxy pripisuje adresu, od ktorej spojenie prijala, na koniec – ľavé záznamy
 *    môže klient vymyslieť ľubovoľne, preto sa im neverí.
 *  - IPv6 sa normalizuje na /64 (jeden klient bežne vlastní celý /64 prefix).
 */
export type IpConfig = {
  trustProxy: boolean;
  hops: number;
  clientIpHeader?: string;
  vercel: boolean;
};

export type HeaderGetter = (name: string) => string | null | undefined;

export function ipConfigFromEnv(env: NodeJS.ProcessEnv = process.env): IpConfig {
  const v = env.TRUST_PROXY?.trim().toLowerCase();
  const vercel = env.VERCEL === "1";
  const trustProxy = v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : vercel;
  const hopsRaw = Number.parseInt(env.TRUSTED_PROXY_HOPS ?? "", 10);
  const hops = Number.isInteger(hopsRaw) && hopsRaw >= 1 && hopsRaw <= 10 ? hopsRaw : 1;
  const clientIpHeader = env.CLIENT_IP_HEADER?.trim().toLowerCase() || undefined;
  return { trustProxy, hops, clientIpHeader, vercel };
}

/** Odstráni port / hranaté zátvorky / zone id a vráti platnú IP, inak null. */
export function parseIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s || s.length > 100) return null;
  // "[2001:db8::1]:443" → "2001:db8::1"
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (bracket) s = bracket[1];
  // "203.0.113.5:1234" → "203.0.113.5"
  const v4port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(s);
  if (v4port) s = v4port[1];
  s = s.replace(/%.*$/, ""); // fe80::1%eth0
  const kind = isIP(s);
  if (kind === 4) return s;
  if (kind === 6) return normalizeIpv6(s);
  return null;
}

function normalizeIpv6(ip: string): string {
  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:1.2.3.4) → IPv4
  const mapped = /^(?:0{0,4}:){0,5}ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower) ?? /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];
  const groups = expandIpv6(lower);
  if (!groups) return lower;
  return `${groups.slice(0, 4).join(":")}::/64`;
}

/** "2001:db8::1" → ["2001","db8","0","0","0","0","0","1"] (bez úvodných núl) */
function expandIpv6(ip: string): string[] | null {
  let s = ip;
  // vložená IPv4 na konci (napr. 64:ff9b::1.2.3.4) → dve skupiny
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (v4) {
    const parts = v4[1].split(".").map(Number);
    s = s.slice(0, -v4[1].length) + `${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : null;
  const groups = t === null ? h : [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  if (groups.length !== 8) return null;
  return groups.map((g) => (parseInt(g || "0", 16) || 0).toString(16));
}

/** Vráti normalizovanú IP klienta alebo null (nevieme/nedôveryhodné). */
export function clientIpFromHeaders(get: HeaderGetter, cfg: IpConfig): string | null {
  if (!cfg.trustProxy) return null;

  if (cfg.clientIpHeader) {
    const v = get(cfg.clientIpHeader);
    // ak by hlavička predsa obsahovala zoznam, rozhoduje posledný (pripísaný našou proxy)
    return parseIp(v?.split(",").map((x) => x.trim()).filter(Boolean).at(-1));
  }

  if (cfg.vercel) {
    const real = parseIp(get("x-real-ip"));
    if (real) return real;
  }

  const xff = get("x-forwarded-for");
  if (!xff) return null;
  const list = xff
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!list.length) return null;
  return parseIp(list.at(-Math.min(cfg.hops, list.length)));
}
