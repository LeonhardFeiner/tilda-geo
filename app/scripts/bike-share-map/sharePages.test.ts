import { describe, expect, test } from 'vitest'
import {
  buildShareRegionSummaries,
  comparisonGroupKey,
  groupLocationPhrase,
  shareDescription,
  shareHeadline,
  shareOgSvg,
  shareRankPhrase,
  shareRedirectParams,
  shareStubHtml,
  slugForId,
  type ShareRegionInput,
} from './sharePages'

const lkNames = new Map([
  ['relation/62371', 'Pfaffenhofen an der Ilm'],
  ['relation/2145268', 'Bayern'],
])

function gemeinde(
  id: string,
  name: string,
  roadSumKm: number,
  bikelaneSumKm: number,
): ShareRegionInput {
  return {
    id,
    name,
    level: '8',
    roadSumKm,
    bikelaneSumKm,
    bikeSharePct: roadSumKm > 0 ? (bikelaneSumKm / roadSumKm) * 100 : null,
    landkreisId: 'relation/62371',
    bundeslandId: 'relation/2145268',
  }
}

describe('comparisonGroupKey', () => {
  test('groups Gemeinden by Landkreis, Landkreise by Bundesland, Bundesländer nationwide', () => {
    expect(comparisonGroupKey({ level: '8', landkreisId: 'relation/1', bundeslandId: '' })).toBe(
      'lk:relation/1',
    )
    expect(comparisonGroupKey({ level: '6', landkreisId: '', bundeslandId: 'relation/2' })).toBe(
      'bl:relation/2',
    )
    expect(comparisonGroupKey({ level: '4', landkreisId: '', bundeslandId: '' })).toBe('de')
  })

  test('a Gemeinde without a known Landkreis gets no group', () => {
    expect(comparisonGroupKey({ level: '8', landkreisId: '', bundeslandId: '' })).toBeNull()
  })

  test('an unknown level gets no group', () => {
    expect(comparisonGroupKey({ level: '9', landkreisId: '', bundeslandId: '' })).toBeNull()
  })
})

describe('buildShareRegionSummaries', () => {
  const regions = [
    gemeinde('relation/396557', 'Schweitenkirchen', 316.9, 5.2), // ~1.64 %, last
    gemeinde('relation/380979', 'Münchsmünster', 123.2, 17.5), // ~14.2 %, leader
    gemeinde('relation/396556', 'Pfaffenhofen an der Ilm', 542.4, 46.0), // ~8.48 %, ~median
    gemeinde('relation/387285', 'Manching', 288.3, 32.5), // ~11.27 %
  ]

  test('ranks the group, computes the gap to the median, and names the leader', () => {
    const summaries = buildShareRegionSummaries(regions, lkNames)
    const sk = summaries.get('relation/396557')
    expect(sk).toBeDefined()
    expect(sk?.rank).toBe(4)
    expect(sk?.total).toBe(4)
    expect(sk?.behind).toBe(true)
    expect(sk?.groupName).toBe('Pfaffenhofen an der Ilm')
    expect(sk?.leaderName).toBe('Münchsmünster')
    expect(sk?.gapKm).toBeGreaterThan(0)

    const leader = summaries.get('relation/380979')
    expect(leader?.rank).toBe(1)
    expect(leader?.leaderName).toBeNull() // the leader is never its own "catch up to" target
    expect(leader?.behind).toBe(false)
  })

  test('drops a region with no comparable peers', () => {
    const summaries = buildShareRegionSummaries(
      [gemeinde('relation/1', 'Alleinstehend', 10, 1)],
      lkNames,
    )
    expect(summaries.size).toBe(0)
  })

  test('drops regions without road data from the group entirely', () => {
    const withoutRoads: ShareRegionInput = {
      ...gemeinde('relation/9', 'Ohne Straßendaten', 0, 0),
      bikeSharePct: null,
    }
    const summaries = buildShareRegionSummaries([...regions, withoutRoads], lkNames)
    expect(summaries.has('relation/9')).toBe(false)
    expect(summaries.get('relation/396557')?.total).toBe(4)
  })
})

describe('shareRankPhrase / groupLocationPhrase', () => {
  test('last place reads as "letzter Platz" instead of "Platz N von N"', () => {
    expect(shareRankPhrase({ rank: 19, total: 19 })).toBe('letzter Platz')
    expect(shareRankPhrase({ rank: 3, total: 19 })).toBe('Platz 3 von 19')
    expect(shareRankPhrase({ rank: 1, total: 1 })).toBe('Platz 1 von 1')
  })

  test('phrases each group kind by where it sits', () => {
    expect(
      groupLocationPhrase({ groupKind: 'gemeinden_in_landkreis', groupName: 'Pfaffenhofen' }),
    ).toBe('im Landkreis Pfaffenhofen')
    expect(
      groupLocationPhrase({ groupKind: 'landkreise_in_bundesland', groupName: 'Bayern' }),
    ).toBe('in Bayern')
    expect(
      groupLocationPhrase({ groupKind: 'bundeslaender_in_deutschland', groupName: 'Deutschland' }),
    ).toBe('in Deutschland')
  })

  test('does not double "Landkreis" when the OSM relation name already carries it', () => {
    expect(
      groupLocationPhrase({
        groupKind: 'gemeinden_in_landkreis',
        groupName: 'Landkreis Pfaffenhofen an der Ilm',
      }),
    ).toBe('im Landkreis Pfaffenhofen an der Ilm')
  })
})

describe('shareHeadline / shareDescription', () => {
  const regions = [
    gemeinde('relation/396557', 'Schweitenkirchen', 316.9, 5.2),
    gemeinde('relation/380979', 'Münchsmünster', 123.2, 17.5),
    gemeinde('relation/396556', 'Pfaffenhofen an der Ilm', 542.4, 46.0),
    gemeinde('relation/387285', 'Manching', 288.3, 32.5),
  ]
  const summaries = buildShareRegionSummaries(regions, lkNames)
  const sk = summaries.get('relation/396557')!

  test('headline carries the real numbers and last-place phrasing', () => {
    expect(shareHeadline(sk)).toBe(
      'Schweitenkirchen: nur 1,6 % Radinfra – letzter Platz im Landkreis Pfaffenhofen an der Ilm',
    )
  })

  test('description states the km gap for a behind region', () => {
    const text = shareDescription(sk, '12.09.2026')
    expect(text).toContain('1,6 %')
    expect(text).toContain('fehlen rund')
    expect(text).toContain('km')
    expect(text).toContain('12.09.2026')
  })

  test('description states the median without a gap for a region ahead of it', () => {
    const leader = summaries.get('relation/380979')!
    const text = shareDescription(leader, '12.09.2026')
    expect(text).not.toContain('fehlen rund')
    expect(text).toContain('Median:')
  })

  test('description adds the demographic peer sentence when attached', () => {
    const withPeer = {
      ...sk,
      peerGroup: {
        groupLabel: 'ländlich geprägt, 5.000–10.000 Einwohner',
        rank: 340,
        total: 412,
        medianPct: 6.2,
        gapKm: 12.3,
        behind: true,
      },
    }
    const text = shareDescription(withPeer, '12.09.2026')
    expect(text).toContain('Auch unter vergleichbaren Gemeinden bundesweit')
    expect(text).toContain('ländlich geprägt, 5.000–10.000 Einwohner')
    expect(text).toContain('Platz 340 von 412')
  })

  test('description omits the peer sentence when there is no demographics match', () => {
    expect(shareDescription(sk, '12.09.2026')).not.toContain('vergleichbaren Gemeinden')
  })
})

describe('slugForId / shareRedirectParams', () => {
  test('slugifies an OSM id into a filesystem-safe name', () => {
    expect(slugForId('relation/396557')).toBe('relation-396557')
  })

  test('a Gemeinde focuses itself; a Landkreis and Bundesland focus their parent', () => {
    expect(
      shareRedirectParams(
        {
          id: 'relation/396557',
          groupKind: 'gemeinden_in_landkreis',
          bundeslandId: 'relation/2145268',
        },
        'relation/51477',
      ),
    ).toEqual({
      ui: 'simple',
      focus: 'relation/396557',
      simple: 'lk_gemeinden',
      region: 'relation/396557',
    })

    expect(
      shareRedirectParams(
        {
          id: 'relation/62371',
          groupKind: 'landkreise_in_bundesland',
          bundeslandId: 'relation/2145268',
        },
        'relation/51477',
      ),
    ).toEqual({
      ui: 'simple',
      focus: 'relation/2145268',
      simple: 'bl_landkreis_kreisfrei',
      region: 'relation/62371',
    })

    expect(
      shareRedirectParams(
        { id: 'relation/2145268', groupKind: 'bundeslaender_in_deutschland', bundeslandId: '' },
        'relation/51477',
      ),
    ).toEqual({
      ui: 'simple',
      focus: 'relation/51477',
      simple: 'de_bundeslaender',
      region: 'relation/2145268',
    })
  })
})

describe('shareStubHtml / shareOgSvg', () => {
  const regions = [
    gemeinde('relation/396557', 'Schweitenkirchen', 316.9, 5.2),
    gemeinde('relation/380979', 'Münchsmünster', 123.2, 17.5),
    gemeinde('relation/396556', 'Pfaffenhofen an der Ilm', 542.4, 46.0),
    gemeinde('relation/387285', 'Manching', 288.3, 32.5),
  ]
  const sk = buildShareRegionSummaries(regions, lkNames).get('relation/396557')!

  test('stub HTML redirects, carries OG tags, and escapes region names', () => {
    const html = shareStubHtml(sk, {
      baseUrl: 'https://example.org/tilda-geo/',
      redirectQuery: 'ui=simple&focus=relation%2F396557',
      ogImageFile: 'relation-396557.png',
      dataDateLabel: '12.09.2026',
    })
    expect(html).toContain('location.replace("../index.html?ui=simple&focus=relation%2F396557")')
    expect(html).toContain('http-equiv="refresh"')
    expect(html).toContain('https://example.org/tilda-geo/r/relation-396557.png')
    expect(html).toContain('og:title')
    expect(html).toContain('letzter Platz')
  })

  test('og image is valid SVG containing the headline numbers', () => {
    const svg = shareOgSvg(sk)
    expect(svg).toMatch(/^<svg /)
    expect(svg).toContain('1,6 %')
    expect(svg).toContain('Schweitenkirchen')
  })

  test('og image adds a peer-group line only when attached', () => {
    expect(shareOgSvg(sk)).not.toContain('Vergleichbare Gemeinden bundesweit')
    const withPeer = {
      ...sk,
      peerGroup: {
        groupLabel: 'ländlich geprägt, 5.000–10.000 Einwohner',
        rank: 340,
        total: 412,
        medianPct: 6.2,
        gapKm: 12.3,
        behind: true,
      },
    }
    const svg = shareOgSvg(withPeer)
    expect(svg).toContain('Vergleichbare Gemeinden bundesweit')
    expect(svg).toContain('Platz 340 von 412')
  })

  test('shrinks the name font size instead of letting a long name run off the card', () => {
    const shortNameSize = Number(shareOgSvg(sk).match(/font-size="(\d+)" font-weight="700"/)?.[1])
    const longNamed = {
      ...sk,
      name: 'Landkreis Neustadt an der Aisch-Bad Windsheim im äußersten Nordwesten Bayerns',
    }
    const longNameSize = Number(
      shareOgSvg(longNamed).match(/font-size="(\d+)" font-weight="700"/)?.[1],
    )
    expect(longNameSize).toBeLessThan(shortNameSize)
  })
})
