"""Stroked paths of a Lageplan SVG (pdftocairo -svg), grouped by stroke colour|width, in the
raw CAD coordinates of the path data (about 1.06 m per unit; the shared transform is dropped).

Usage: parse_svg.py <plan.svg> <out-strokes.json>
"""
import re, sys, json, collections
src, out = sys.argv[1], sys.argv[2]
s = open(src).read()
pat = re.compile(r'<path style="([^"]*)" d="([^"]*)"(?: transform="matrix\(([^)]*)\)")?')
res = collections.defaultdict(list); tr = collections.Counter()
for m in pat.finditer(s):
    st, d, t = m.groups()
    if 'fill:none' not in st: continue
    sk = re.search(r'stroke:(rgb\([^)]*\))', st); sw = re.search(r'stroke-width:([0-9.]+)', st)
    if not sk: continue
    key = sk.group(1) + '|' + (sw.group(1) if sw else '-') + ('|dash' if 'dasharray' in st else '')
    tr[t] += 1
    nums = re.findall(r'([MLC])|(-?[0-9.]+)', d)
    pts = []; cur=[]
    toks = re.findall(r'[MLCZ]|-?[0-9.]+', d)
    i=0; cmd=None; polys=[]
    while i < len(toks):
        if toks[i] in 'MLCZ':
            cmd = toks[i]; i+=1
            if cmd=='M':
                if len(cur)>1: polys.append(cur)
                cur=[]
            if cmd=='Z': continue
            continue
        if cmd=='C':
            x,y = float(toks[i+4]), float(toks[i+5]); i+=6
        else:
            x,y = float(toks[i]), float(toks[i+1]); i+=2
        cur.append((x,y))
    if len(cur)>1: polys.append(cur)
    for p in polys: res[key].append([t, p])
print(tr.most_common(5))
json.dump(res, open(out,'w'))
