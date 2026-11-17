from PIL import Image, ImageDraw, ImageEnhance, ImageFont
"""Check images: assigned route lines (colour per route, with names) and unassigned plan lines
(black) over the faded Lageplan raster. Usage: render_check.py <work> <assigned.geojson> <outdir>"""
import json, sys, colorsys, hashlib

W, F, OUT = sys.argv[1:4]
G = json.load(open(f'{W}/georef.json'))
A, B, TX, TY = G['a'], G['b'], G['tx'], G['ty']
f = 110 / 72

def ll2px(lon, lat):
    E, N = to_utm.transform(lon, lat)
    E, N = E - TX, N - TY; d = A * A + B * B
    X, Y = (A * E + B * N) / d, (-B * E + A * N) / d
    return ((0.11994 * X + 11.334341) * f, (5677.823326 - 0.11994 * Y) * f)

feats = json.load(open(F))['features']
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
except Exception: font = ImageFont.load_default()
for plan in ('kurz', 'lang'):
    for netz in ('haupt', 'ergaenzend'):
        base = Image.open(f'{W}/{plan}-1.png').convert('RGB')
        base = ImageEnhance.Contrast(base).enhance(0.35)
        dr = ImageDraw.Draw(base)
        mids = {}
        for ft in feats:
            p = ft['properties']
            if p.get('plan') != plan or p.get('netz') != netz: continue
            pts = [tuple(c) for c in ft['geometry']['coordinates']]
            if p.get('unassigned'):
                dr.line(pts, fill=(0, 0, 0), width=5); continue
            h = int(hashlib.md5(p['routeId'].encode()).hexdigest()[:6], 16) / 0xFFFFFF
            col = tuple(int(255 * v) for v in colorsys.hsv_to_rgb(h, 0.9, 0.85))
            dr.line(pts, fill=col, width=4 if p.get('ausbau') != 'bestand-weg' else 2)
            mids.setdefault(p['routeId'], (pts[len(pts) // 2], col))
        for rid, (pt, col) in mids.items():
            dr.text((pt[0] + 4, pt[1] - 6), rid, fill=col, font=font, stroke_width=2, stroke_fill=(255, 255, 255))
        base.crop((60, 20, 1640, 2071)).save(f'{OUT}/check-{plan}-{netz}.png')
print('ok')
