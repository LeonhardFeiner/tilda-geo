/**
 * Visit counting with GoatCounter (https://www.goatcounter.com): no cookies, no local storage, no
 * stored IP addresses, so no consent banner. The Datenschutz section in legalPage.ts describes it;
 * change both together.
 *
 * Counts only on the BFS subdomain. The same build is served on github.io, where the loader does
 * nothing, so debugging a build there never shows up in the numbers.
 */

/** Site code of the GoatCounter account: the dashboard is https://<code>.goatcounter.com. */
export const GOATCOUNTER_CODE = 'radweg-bfs'

/** The only host that counts. Matches MIRROR_DOMAIN in .github/workflows/pages-viewer.yml. */
export const COUNTED_HOST = 'radweg.bfschweitenkirchen.de'

/**
 * `<script>` for a page's `<head>`. ES5 so it parses wherever the error banner in the viewer head
 * does. count.js takes the path from the page's `<link rel="canonical">` when one points at the
 * same host, so the viewer counts as "/" whatever region its query string selects.
 */
export function visitCounterHeadScript() {
  const endpoint = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`
  return `<script>
    if (location.hostname === ${JSON.stringify(COUNTED_HOST)}) {
      (function () {
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://gc.zgo.at/count.js';
        s.setAttribute('data-goatcounter', ${JSON.stringify(endpoint)});
        document.head.appendChild(s);
      })();
    }
  </script>`
}
