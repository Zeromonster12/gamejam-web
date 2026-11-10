import { getExportRows } from "@/lib/admin-data";
import { isAuthenticated } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { audit } from "@/lib/maintenance";
import { getClientIpHash } from "@/lib/security";
import { ADULT_AGE, FOCUS_LABELS, SCHOOL_TYPE_LABELS } from "@/lib/validation";

/**
 * GET /admin/export            → všetci hráči (CSV pre Excel)
 * GET /admin/export?type=diet  → strava/alergie (pre catering)
 * Overuje session sám (proxy je len optimistický) – bez session 401.
 */
export async function GET(request: Request) {
  if (!(await isAuthenticated())) {
    return new Response("Neautorizované", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const type = new URL(request.url).searchParams.get("type") === "diet" ? "diet" : "all";
  const rows = await getExportRows();
  await audit(type === "diet" ? "export_diet" : "export", (await getClientIpHash()).ipHash);
  const yn = (b: boolean) => (b ? "áno" : "nie");
  const date = new Date().toISOString().slice(0, 10);
  const fmt = new Intl.DateTimeFormat("sk-SK", { timeZone: "Europe/Bratislava", dateStyle: "short", timeStyle: "short" });

  let csv: string;
  if (type === "diet") {
    const withAllergies = rows.filter((r) => r.allergies);
    csv = toCsv(
      ["Tím", "Meno", "Priezvisko", "Alergie / strava"],
      withAllergies.map((r) => [r.teamName ?? "(nepriradený)", r.firstName, r.lastName, r.allergies]),
    );
  } else {
    csv = toCsv(
      [
        "Tím",
        "Kapitán",
        "Prihlásenie",
        "Meno",
        "Priezvisko",
        "E-mail",
        "Vek",
        "Mladistvý",
        "Typ školy",
        "Škola",
        "Zameranie",
        "Poznámka k zameraniu",
        "Alergie",
        "Zákonný zástupca",
        "Kontakt na zástupcu",
        "Súhlas zástupcu (formulár)",
        "Registrované",
      ],
      rows.map((r) => {
        const minor = r.age < ADULT_AGE;
        return [
          r.teamName ?? "(nepriradený)",
          yn(r.isLeader),
          r.origin === "solo" ? "sólo" : "tím",
          r.firstName,
          r.lastName,
          r.email,
          r.age,
          yn(minor),
          SCHOOL_TYPE_LABELS[r.schoolType],
          r.schoolName,
          r.focus.map((f) => FOCUS_LABELS[f as keyof typeof FOCUS_LABELS] ?? f),
          r.focusNote,
          r.allergies,
          minor ? r.guardianName : "",
          minor ? r.guardianContact : "",
          minor ? yn(r.guardianConsent) : "",
          fmt.format(r.createdAt),
        ];
      }),
    );
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gamejam-${type === "diet" ? "strava" : "hraci"}-${date}.csv"`,
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
