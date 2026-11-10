import art from "@/assets/pixel-art.json";

/**
 * Pixel-art z plagátu vykreslený ako inline SVG (server components – JSON
 * sa nedostane do klientskeho bundlu).
 */

type Px = [number, number] | [number, number, string];
type Bitmap = { w: number; h: number; px: Px[]; c?: string };

export type IconName = keyof typeof art.icons;
export type SpriteName = "cursor" | "sprite" | "flag" | "heart" | "heartEmpty";

/** Zlúči pixely rovnakej farby do jednej cesty (menej DOM uzlov). */
function bitmapPaths(bmp: Bitmap, fallback: string) {
  const byColor = new Map<string, string>();
  for (const p of bmp.px) {
    const [x, y] = p;
    const c = (p.length === 3 ? p[2] : undefined) ?? bmp.c ?? fallback;
    byColor.set(c, (byColor.get(c) ?? "") + `M${x} ${y}h1v1h-1z`);
  }
  return [...byColor.entries()];
}

type BitmapProps = {
  bmp: Bitmap;
  /** Veľkosť jedného pixelu v CSS px. */
  scale?: number;
  className?: string;
  /** Prázdny = dekoratívne (aria-hidden). */
  label?: string;
  color?: string;
};

export function PixelBitmap({ bmp, scale = 3, className, label, color }: BitmapProps) {
  const paths = bitmapPaths(bmp, color ?? "currentColor");
  return (
    <svg
      viewBox={`0 0 ${bmp.w} ${bmp.h}`}
      width={bmp.w * scale}
      height={bmp.h * scale}
      shapeRendering="crispEdges"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {paths.map(([c, d]) => (
        <path key={c} d={d} fill={c} />
      ))}
    </svg>
  );
}

export function PixelIcon({ name, scale = 3, className, color }: { name: IconName; scale?: number; className?: string; color?: string }) {
  const icon = art.icons[name] as Bitmap;
  return <PixelBitmap bmp={color ? { ...icon, c: color } : icon} scale={scale} className={className} />;
}

export function PixelSprite({ name, scale = 3, className }: { name: SpriteName; scale?: number; className?: string }) {
  return <PixelBitmap bmp={art[name] as Bitmap} scale={scale} className={className} />;
}

/* ---------- Veľký nadpis GAME JAM + džem ---------- */

type Rect = { x: number; y: number; w: number; h: number; c: string; role: string; row?: number };
const r2 = (n: number) => Math.round(n * 100) / 100;
const rectPath = (r: Rect) => `M${r2(r.x)} ${r2(r.y)}h${r2(r.w)}v${r2(r.h)}h${r2(-r.w)}z`;

type Group = { key: string; c: string; role: string; row?: number; d: string };

/** Zlúči po sebe idúce obdĺžniky rovnakej farby/roly/riadku – zachová poradie vrstiev. */
function groupTitle(rects: Rect[]): Group[] {
  const out: Group[] = [];
  for (const r of rects) {
    const last = out[out.length - 1];
    if (last && last.c === r.c && last.role === r.role && last.row === r.row) last.d += rectPath(r);
    else out.push({ key: String(out.length), c: r.c, role: r.role, row: r.row, d: rectPath(r) });
  }
  return out;
}

const TITLE = art.title as { w: number; h: number; rows: number; rects: Rect[] };
/** Časť „jarshadow“ obdĺžnikov leží pri písmene E (horný riadok) – tie patria k tieňu nadpisu, nie k poskakujúcemu džemu. */
const JAR_TOP = 70;
const GROUPS = groupTitle(
  TITLE.rects.map((r) => (r.role === "jarshadow" && r.y < JAR_TOP ? { ...r, role: "tshadow" } : r)),
);
/** Svetelný „shimmer“ – jedna biela cesta na riadok písmen. */
const SHIMMER_ROWS = Array.from({ length: TITLE.rows }, (_, row) =>
  TITLE.rects
    .filter((r) => r.role === "title" && r.row === row)
    .map(rectPath)
    .join(""),
);

export function PixelTitle({ className }: { className?: string }) {
  const letters = GROUPS.filter((g) => g.role === "tshadow" || g.role === "title");
  const jar = GROUPS.filter((g) => g.role === "jarshadow" || g.role === "jar");
  return (
    <svg
      viewBox={`0 0 ${TITLE.w} ${TITLE.h}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label="GameJam 2027"
    >
      <g>
        {letters.map((g) => (
          <path key={g.key} d={g.d} fill={g.c} />
        ))}
      </g>
      <g className="title-shimmer" fill="#fff" aria-hidden="true">
        {SHIMMER_ROWS.map((d, row) => (
          <path key={row} d={d} style={{ "--row": row } as React.CSSProperties} />
        ))}
      </g>
      <g className="title-jar">
        {jar.map((g) => (
          <path key={g.key} d={g.d} fill={g.c} />
        ))}
      </g>
    </svg>
  );
}

/** Pixel „+“ iskra (5 px kríž). */
export function Spark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 5 5" width="15" height="15" shapeRendering="crispEdges" className={className} style={style} aria-hidden="true" focusable="false">
      <path d="M2 0h1v2h2v1h-2v2h-1v-2h-2v-1h2z" fill="currentColor" />
    </svg>
  );
}
