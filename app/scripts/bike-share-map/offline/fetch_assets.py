"""Fonts (glyph ranges) and sprites of the OpenFreeMap Positron style, into <out>/fonts and
<out>/sprites, for the offline copy of the viewer (README.md). Standard library only.

  fetch_assets.py <out folder>
"""
import concurrent.futures
import os
import sys
import urllib.error
import urllib.request

BASE = 'https://tiles.openfreemap.org'
FONTS = ['Noto Sans Regular', 'Noto Sans Italic', 'Noto Sans Bold']
SPRITES = ['ofm.json', 'ofm.png', 'ofm@2x.json', 'ofm@2x.png']


def fetch(path, out):
    target = os.path.join(out, *path.split('/'))
    if os.path.exists(target):
        return
    os.makedirs(os.path.dirname(target), exist_ok=True)
    url = BASE + '/' + urllib.request.quote(path)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'radwege-offline/1.0'}), timeout=60) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return
        raise
    with open(target, 'wb') as f:
        f.write(data)


def main():
    out = sys.argv[1]
    paths = [f'sprites/ofm_f384/{s}' for s in SPRITES]
    paths += [f'fonts/{font}/{i * 256}-{i * 256 + 255}.pbf' for font in FONTS for i in range(256)]
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        list(pool.map(lambda p: fetch(p, out), paths))
    print('done', len(paths), 'paths')


if __name__ == '__main__':
    main()
