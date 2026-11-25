"""HTTP GET for the offline fetchers: one kept-alive connection per thread and host (one DNS
lookup and TLS handshake instead of one per file), patient retries (WSL's DNS and home
connections drop out for a while), redirects followed. Standard library only.
"""
import http.client
import threading
import time
import urllib.parse

UA = 'radwege-offline/1.0'


class GiveUp(Exception):
    pass


class Fetcher:
    def __init__(self, headers=None, tries=12):
        self.headers = {'User-Agent': UA, **(headers or {})}
        self.tries = tries
        self.local = threading.local()

    def conn(self, scheme, host):
        conns = self.local.__dict__.setdefault('conns', {})
        key = (scheme, host)
        if key not in conns:
            cls = http.client.HTTPSConnection if scheme == 'https' else http.client.HTTPConnection
            conns[key] = cls(host, timeout=120)
        return conns[key]

    def drop(self, scheme, host):
        c = self.local.__dict__.get('conns', {}).pop((scheme, host), None)
        if c:
            c.close()

    def get(self, url):
        """Body bytes; None for 404/204; GiveUp after all retries (wait up to ~10 minutes)."""
        last = None
        for i in range(self.tries):
            target = url
            try:
                for _ in range(6):  # redirects
                    u = urllib.parse.urlsplit(target)
                    path = u.path + ('?' + u.query if u.query else '')
                    c = self.conn(u.scheme, u.netloc)
                    c.request('GET', path, headers=self.headers)
                    r = c.getresponse()
                    body = r.read()
                    if r.status in (301, 302, 303, 307, 308) and r.getheader('Location'):
                        target = urllib.parse.urljoin(target, r.getheader('Location'))
                        continue
                    if r.status in (404, 204):
                        return None
                    if r.status == 200:
                        return body
                    last = f'HTTP {r.status}'
                    if r.status < 500 and r.status != 429:
                        raise GiveUp(f'{url}: {last}')
                    break
            except GiveUp:
                raise
            except (OSError, http.client.HTTPException) as e:
                last = repr(e)
                self.drop(urllib.parse.urlsplit(target).scheme, urllib.parse.urlsplit(target).netloc)
            time.sleep(min(60, 2 ** i))
        raise GiveUp(f'{url}: {last}')
