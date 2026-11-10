import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/** Hlavičky pre všetky odpovede (CSP nastavuje src/proxy.ts – potrebuje nonce pre /admin). */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Docker / vlastný server: .next/standalone/server.js. Na Verceli netreba (má vlastný výstup)
  // a PGlite (len lokálny vývoj/testy) sa tam nebalí do serverless funkcií.
  ...(process.env.VERCEL
    ? { outputFileTracingExcludes: { "*": ["node_modules/@electric-sql/pglite/**"] } }
    : { output: "standalone" as const }),
  poweredByHeader: false,
  // dev server inak loguje argumenty server actions → osobné údaje z registrácie v termináli
  logging: { serverFunctions: false },
  // PGlite (WASM) sa nemá bundlovať – načíta sa z node_modules za behu
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    serverActions: {
      // registrácia 5 ľudí je pár kB; malý limit = menšia plocha pre DoS
      bodySizeLimit: "64kb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
      {
        source: "/admin",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
