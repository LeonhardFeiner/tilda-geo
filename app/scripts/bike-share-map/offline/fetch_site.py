"""Download the deployed viewer (GitHub Pages) file by file into <out>, for the offline copy
(README.md). The list of paths comes from site-files.txt, written from a Pages artifact with
`find . -type f ! -path './r/*.png'` (the share preview images are left out: 376 MB, only used by
social media link previews). Files already there are skipped; delete <out> to get a fresh copy.
Standard library only.

  fetch_site.py <out folder> [<list> [<base url>]]
"""
import concurrent.futures
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = 'https://leonhardfeiner.github.io/tilda-geo/'


def fetch(base, out, path):
    target = os.path.join(out, *path.split('/'))
    if os.path.isfile(target) and os.path.getsize(target) > 0:
        return 'skip'
    os.makedirs(os.path.dirname(target), exist_ok=True)
    url = base + urllib.parse.quote(path)
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'radwege-offline/1.0'})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return 'missing'
            if i == 3:
                raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if i == 3:
                raise
        time.sleep(2 * (i + 1))
    with open(target + '.part', 'wb') as f:
        f.write(data)
    os.replace(target + '.part', target)
    return 'ok'


def main():
    out = sys.argv[1]
    listing = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'site-files.txt')
    base = sys.argv[3] if len(sys.argv) > 3 else BASE
    paths = [p.strip() for p in open(listing, encoding='utf-8') if p.strip()]
    counts = {}
    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        for i, result in enumerate(pool.map(lambda p: fetch(base, out, p), paths), 1):
            counts[result] = counts.get(result, 0) + 1
            if i % 1000 == 0:
                print(f'{i}/{len(paths)}', flush=True)
    print('site:', counts)


if __name__ == '__main__':
    main()
