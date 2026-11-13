import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName, verifySessionToken } from "@/lib/session-token";
import { buildCsp } from "@/lib/csp";

/**
 * Proxy (predtým middleware):
 *  1. Content-Security-Policy – na /admin prísna nonce politika (stránky sú dynamické),
 *     na verejných stránkach statická politika (static shell z Cache Components nemôže niesť nonce).
 *  2. Optimistická kontrola admin session (len redirect, bez DB). Autoritatívne overenie
 *     robí `verifySession()` v každej admin stránke, route handleri a server action.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isDev = process.env.NODE_ENV === "development";

  // dočasná E2E testovacia stránka – mimo testov neexistuje
  if (pathname.startsWith("/__test") && process.env.E2E !== "1") {
    return new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  if (isAdmin) {
    const isLogin = pathname === "/admin/login";
    const isServerAction = request.method === "POST" && request.headers.has("next-action");
    // server actions sa nepresmerujú – overujú session samy a vrátia redirect/chybu
    if (!isServerAction) {
      const authed = await verifySessionToken(request.cookies.get(sessionCookieName())?.value);
      if (!authed && !isLogin && pathname !== "/admin/export") {
        return withNoStore(NextResponse.redirect(new URL("/admin/login", request.url)));
      }
      // Z /admin/login proxy NEpresmerúva: nevidí odvolanie session (logout) v DB, takže by s DAL
      // (verifySession → /admin/login) vytvoril slučku. Prihláseného presmeruje login stránka sama.
    }

    const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
    const csp = buildCsp({ nonce, isDev });
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    // Next.js číta nonce z CSP hlavičky požiadavky a doplní ho do svojich <script> tagov
    requestHeaders.set("Content-Security-Policy", csp);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return withNoStore(res);
  }

  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", buildCsp({ nonce: null, isDev }));
  return res;
}

function withNoStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, max-age=0");
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res;
}

export const config = {
  matcher: [
    // /admin VŽDY (aj prefetch požiadavky) – CSP + no-store + auth redirect musí mať každá odpoveď
    "/admin",
    "/admin/:path*",
    // ostatné stránky: bez statických súborov a bez prefetchov (tie nie sú HTML dokumenty)
    {
      source: "/((?!admin(?:/|$)|_next/static|_next/image|favicon.ico|partners/|fonts/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|woff2?|txt|xml)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
