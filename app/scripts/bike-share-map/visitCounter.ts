/**
 * Visit counting with GoatCounter (https://www.goatcounter.com): no cookies, no local storage, no
 * stored IP addresses. The Datenschutz section in legalPage.ts describes it; change both together.
 *
 * GoatCounter's own count.js is not loaded: it reads the screen width, page title, a localStorage
 * flag and navigator.webdriver in the browser, which a strict reading of § 25 TDDDG treats as access
 * to the device (needing consent). Instead the page sends one request to the count endpoint with
 * only the path and an external referrer. Browser, OS and country GoatCounter derives server-side
 * from the request headers.
 *
 * Counts only on the BFS subdomain. The same build is served on github.io, where the script does
 * nothing, so debugging a build there never shows up in the numbers.
 */

/** Site code of the GoatCounter account: the dashboard is https://<code>.goatcounter.com. */
export const GOATCOUNTER_CODE = 'radweg-bfs'

/** The only host that counts. Matches MIRROR_DOMAIN in .github/workflows/pages-viewer.yml. */
export const COUNTED_HOST = 'radweg.bfschweitenkirchen.de'

export const GOATCOUNTER_ENDPOINT = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`

/**
 * `<script>` for a page's `<head>`, in ES5 so it runs wherever the error banner in the viewer head
 * does. Sends:
 * - p: the path without query string, so the viewer counts as "/" whichever region it shows;
 *   "/index.html" is folded into "/".
 * - r: the referrer, only when it is another site (internal navigation is not a source).
 * - rnd: cache buster, as count.js sends it.
 * Skipped while the page is only prerendered (count.js does the same).
 */
export function visitCounterHeadScript() {
  return `<script>
    if (location.hostname === ${JSON.stringify(COUNTED_HOST)} && document.visibilityState !== 'prerender') {
      (function () {
        var path = location.pathname.replace(/\\/index\\.html$/, '/') || '/';
        var ref = document.referrer;
        if (ref && ref.indexOf('https://' + location.hostname + '/') === 0) ref = '';
        var url = ${JSON.stringify(GOATCOUNTER_ENDPOINT)} +
          '?p=' + encodeURIComponent(path) +
          (ref ? '&r=' + encodeURIComponent(ref) : '') +
          '&rnd=' + Math.random().toString(36).slice(2, 7);
        try {
          if (navigator.sendBeacon && navigator.sendBeacon(url)) return;
        } catch (e) {}
        new Image().src = url;
      })();
    }
  </script>`
}
