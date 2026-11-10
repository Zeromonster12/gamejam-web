"""Doplní do písma Silkscreen chýbajúce slovenské znaky (Ť Ď Ľ Č Ň Ĺ Ŕ …).

Silkscreen (OFL) z @fontsource má v latin-ext podsade len Š/Ž; ostatné písmená
s mäkčeňom a dĺžňom by prehliadač kreslil iným písmom. Skript poskladá chýbajúce
znaky z pôvodných glyfov (písmeno + mäkčeň/dĺžeň/apostrof) a uloží
public/fonts/silkscreen-sk.woff2.   Spustenie:  python3 scripts/build-pixel-font.py
(vyžaduje: pip install fonttools brotli)
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent

root = Path(__file__).resolve().parent.parent
src = root / "node_modules/@fontsource/silkscreen/files"
base = TTFont(src / "silkscreen-latin-400-normal.woff2")
ext = TTFont(src / "silkscreen-latin-ext-400-normal.woff2")
glyf, hmtx = base["glyf"], base["hmtx"]
gs = base.getGlyphSet()
order = list(base.getGlyphOrder())

def add_glyph(name, glyph, adv, lsb=0):
    if name not in order:
        order.append(name)
    glyf.glyphs[name] = glyph
    hmtx.metrics[name] = (adv, lsb)

def map_char(cp, name):
    for t in base["cmap"].tables:
        if t.isUnicode():
            t.cmap[cp] = name

# 1) Š Ž š ž z latin-ext (jednoduché glyfy)
ext_gs = ext.getGlyphSet()
for name in ["Scaron", "scaron", "Zcaron", "zcaron"]:
    pen = TTGlyphPen(None)
    ext_gs[name].draw(pen)
    add_glyph(name, pen.glyph(), ext["hmtx"].metrics[name][0])
for cp, name in [(0x160, "Scaron"), (0x161, "scaron"), (0x17D, "Zcaron"), (0x17E, "zcaron")]:
    map_char(cp, name)

# 2) mäkčeň = kontúry Š, ktoré ležia nad písmenom S
def contours(glyphset, name):
    rec = DecomposingRecordingPen(glyphset)
    glyphset[name].draw(rec)
    out, cur = [], []
    for op, args in rec.value:
        cur.append((op, args))
        if op in ("closePath", "endPath"):
            out.append(cur)
            cur = []
    return out

s_top = max(p[1] for c in contours(gs, "S") for op, a in c for p in a)
caron_pen = TTGlyphPen(None)
for c in contours(ext_gs, "Scaron"):
    ys = [p[1] for op, a in c for p in a]
    if ys and min(ys) >= s_top:
        for op, args in c:
            getattr(caron_pen, op)(*args)
add_glyph("caroncomb", caron_pen.glyph(), 0)
glyf["caroncomb"].recalcBounds(glyf)

def comp(name, parts, adv):
    g = Glyph()
    g.numberOfContours = -1
    g.components = []
    for gname, x, y in parts:
        c = GlyphComponent()
        c.glyphName, c.x, c.y, c.flags = gname, x, y, 0x4  # ROUND_XY_TO_GRID
        g.components.append(c)
    add_glyph(name, g, adv)

adv = lambda n: hmtx.metrics[n][0]
S_adv = adv("S")
A_adv = adv("A")
# apostrof pre ď ť ľ Ľ (slovenský „mäkčeň ako apostrof“)
apos = "quotesingle" if "quotesingle" in glyf.glyphs else "quoteright"
apos_w = glyf[apos].xMax - glyf[apos].xMin if hasattr(glyf[apos], "xMax") else 100

caron_above = {"Tcaron": ("T", 0x164), "Dcaron": ("D", 0x10E), "Ccaron": ("C", 0x10C), "ccaron": ("c", 0x10D),
               "Ncaron": ("N", 0x147), "ncaron": ("n", 0x148), "Ecaron": ("E", 0x11A), "ecaron": ("e", 0x11B),
               "Rcaron": ("R", 0x158), "rcaron": ("r", 0x159)}
for name, (b, cp) in caron_above.items():
    comp(name, [(b, 0, 0), ("caroncomb", round((adv(b) - S_adv) / 2), 0)], adv(b))
    map_char(cp, name)

acute_above = {"Lacute": ("L", 0x139), "lacute": ("l", 0x13A), "Racute": ("R", 0x154), "racute": ("r", 0x155)}
for name, (b, cp) in acute_above.items():
    comp(name, [(b, 0, 0), ("acutecomb", 125 + round((adv(b) - A_adv) / 2), 0)], adv(b))
    map_char(cp, name)

apostrophe = {"tcaron": ("t", 0x165), "dcaron": ("d", 0x10F), "Lcaron": ("L", 0x13D), "lcaron": ("l", 0x13E)}
for name, (b, cp) in apostrophe.items():
    bx = glyf[b].xMax
    ax = glyf[apos].xMin
    comp(name, [(b, 0, 0), (apos, bx - ax + 25, 0)], max(adv(b), bx + apos_w + 125))
    map_char(cp, name)

base.setGlyphOrder(order)
for tag in ("GSUB", "GPOS", "GDEF", "hdmx", "LTSH", "VDMX", "kern"):
    if tag in base:
        del base[tag]
base["maxp"].numGlyphs = len(order)
base.flavor = "woff2"
out = root / "public/fonts/silkscreen-sk.woff2"
base.save(out)
print("ok", out, len(order), "glyfov")
