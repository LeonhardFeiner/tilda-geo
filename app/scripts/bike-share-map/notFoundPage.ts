/**
 * 404.html: GitHub Pages serves it for every missing path, on github.io (under /tilda-geo/) and
 * on the mirror's own domain (at /). A single word after the site root is read as a place name,
 * so `/schweitenkirchen` on a flyer opens that Gemeinde (index.html?ort=…, see applyOrtFromUrl in
 * generateViewerHtml.ts); anything else gets a plain "not found" with a link to the map.
 *
 * Self-contained on purpose: the page is served at the missing path, so relative links to icons
 * or scripts would point into a folder that does not exist.
 */
export function notFoundPageHtml() {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Seite nicht gefunden – Radinfra-Vergleich</title>
<script>
  (function () {
    // github.io serves the project under its first path segment; the mirror's domain at the root
    var parts = location.pathname.split('/').filter(Boolean);
    var base = '/';
    if (/\\.github\\.io$/.test(location.hostname) && parts.length) base = '/' + parts.shift() + '/';
    var word = '';
    try {
      word = parts.length === 1 ? decodeURIComponent(parts[0]) : '';
    } catch (e) {}
    // a name, not a missing file: no dot, no slash, not too long
    if (word && word.length <= 80 && !/[./?#]/.test(word)) {
      location.replace(base + 'index.html?ort=' + encodeURIComponent(word.toLowerCase()));
      return;
    }
    window.__radinfraHome = base;
  })();
</script>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; background: #f6f7f5; color: #1f2421;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  main { max-width: 36rem; margin: 0 auto; padding: 48px 20px; }
  a { color: #1b6e4b; font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>Seite nicht gefunden</h1>
  <p>Diese Adresse gibt es nicht. <a id="home" href="/">Zur Karte</a>, dort lässt sich jede Gemeinde suchen.</p>
</main>
<script>
  if (window.__radinfraHome) document.getElementById('home').setAttribute('href', window.__radinfraHome);
</script>
</body>
</html>
`
}
