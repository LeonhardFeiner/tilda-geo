"""Text blocks of both plans (pdftotext -bbox-layout) with their colour read from the 110 dpi
render: blue = Haupttrasse label, cyan = ergänzende Trasse, dark = place names.

Usage: labels.py <work dir>   (reads {kurz,lang}-bbox.html and -1.png, writes {kurz,lang}-labels.json)
"""
import re, sys, json, html
from PIL import Image
S=sys.argv[1]
for k in ['kurz','lang']:
    s=open(f'{S}/{k}-bbox.html').read()
    im=Image.open(f'{S}/{k}-1.png').convert('RGB'); f=110/72
    out=[]
    for blk in re.finditer(r'<block xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</block>', s, re.S):
        x0,y0,x1,y1=map(float,blk.groups()[:4])
        lines=[]
        for ln in re.finditer(r'<line[^>]*>(.*?)</line>', blk.group(5), re.S):
            words=[html.unescape(w) for w in re.findall(r'<word[^>]*>(.*?)</word>', ln.group(1))]
            lines.append(' '.join(words))
        # colour: count saturated pixels inside bbox
        cnt={'blue':0,'cyan':0,'other':0,'dark':0}
        for X in range(int(x0*f),int(x1*f)+1):
            for Y in range(int(y0*f),int(y1*f)+1):
                r,g,b=im.getpixel((min(X,im.width-1),min(Y,im.height-1)))
                if b>150 and r<90 and g<90: cnt['blue']+=1
                elif b>150 and g>150 and r<120: cnt['cyan']+=1
                elif r<80 and g<80 and b<80: cnt['dark']+=1
        col=max(['blue','cyan','dark'],key=lambda c:cnt[c])
        if x0 > 1000: continue  # legend and title block
        out.append(dict(text=' / '.join(lines), bbox=[x0,y0,x1,y1], color=col, cnt=cnt))
    json.dump(out,open(f'{S}/{k}-labels.json','w'),ensure_ascii=False,indent=0)
    print('==',k,len(out))
    for o in out:
        if o['color'] in ('blue','cyan'): print(o['color'],round(o['bbox'][0]),round(o['bbox'][1]),o['text'])
