import type { Metadata, Viewport } from "next";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
// Silkscreen s doplnenými slovenskými znakmi (scripts/build-pixel-font.py) – @font-face v globals.css
import "./globals.css";
import { EVENT } from "@/lib/event";

const description = `Tímy študentov. 24 hodín. Jedna hra. Zaregistruj svoj tím na ${EVENT.name} – ${EVENT.dateLabel}, ${EVENT.venue}, ${EVENT.venueCity}. Hlavná výhra ${EVENT.prizes.main} ${EVENT.currency}.`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://gamejam.ukf.sk"),
  title: `${EVENT.name} – registrácia`,
  description,
  openGraph: {
    type: "website",
    locale: "sk_SK",
    title: `${EVENT.name} – registrácia`,
    description,
    siteName: EVENT.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${EVENT.name} – registrácia`,
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#1c141e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: rozšírenia prehliadača (napr. webcrx) pridávajú atribúty na <html>/<body>
    // pred hydratáciou. Platí len pre atribúty týchto dvoch elementov, nie pre ich obsah.
    <html lang="sk" suppressHydrationWarning>
      <body className="min-h-dvh antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
