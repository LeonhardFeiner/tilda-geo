import { describe, expect, test } from 'vitest'
import {
  announcedYear,
  firstStep,
  lastStep,
  lineBedarf,
  lineStatus,
  type RouteEvent,
} from './radwegeStatus'

const ev = (date: string, kind: RouteEvent['kind'], uncertain?: boolean): RouteEvent => ({
  date,
  kind,
  text: 't',
  source: 's',
  url: 'https://example.org',
  ...(uncertain ? { uncertain } : {}),
})

describe('firstStep', () => {
  test('ignores context events and uncertain steps, picks the earliest', () => {
    const events = [
      ev('2026-01-22', 'Grunderwerb'),
      ev('2019-12', 'Aussage'),
      ev('2018', 'Beschluss', true),
      ev('2021-07-27', 'Grunderwerb'),
      ev('2020-01-13', 'Anfrage'),
    ]
    expect(firstStep(events)?.date).toBe('2021-07-27')
    expect(firstStep([ev('2020', 'Ankündigung')])).toBeNull()
    expect(lastStep(events)?.date).toBe('2026-01-22')
    expect(lastStep([ev('2026', 'Beschluss', true)])).toBeNull()
  })
})

describe('lineStatus', () => {
  test('built routes and Bestand lines are "bestand"', () => {
    expect(lineStatus({ built: true, events: [] }, 'freigabe')).toBe('bestand')
    expect(lineStatus({ events: [] }, 'bestand')).toBe('bestand')
  })

  test('the latest certain step decides since/before the concept (07.06.2024)', () => {
    expect(lineStatus({ events: [ev('2015', 'Programm')] }, 'voll')).toBe('vor-konzept')
    expect(lineStatus({ events: [ev('2024-06-06', 'Beschluss')] }, 'voll')).toBe('vor-konzept')
    expect(lineStatus({ events: [ev('2024-06-07', 'Beschluss')] }, 'voll')).toBe('seit-konzept')
    // an old first step does not matter once a later one follows
    expect(
      lineStatus({ events: [ev('2019-02-12', 'Beschluss'), ev('2025-04', 'Haushalt')] }, 'voll'),
    ).toBe('seit-konzept')
    // a step long ago and nothing since: not shown as moving
    expect(
      lineStatus({ events: [ev('2019-02-12', 'Beschluss'), ev('2025-01', 'Aussage')] }, 'voll'),
    ).toBe('vor-konzept')
  })

  test('a partial date counts as "since" only if all of it lies on or after the concept', () => {
    expect(lineStatus({ events: [ev('2024-05', 'Grunderwerb')] }, 'voll')).toBe('vor-konzept')
    expect(lineStatus({ events: [ev('2024-06', 'Grunderwerb')] }, 'voll')).toBe('vor-konzept')
    expect(lineStatus({ events: [ev('2024', 'Grunderwerb')] }, 'voll')).toBe('vor-konzept')
    expect(lineStatus({ events: [ev('2024-07', 'Grunderwerb')] }, 'voll')).toBe('seit-konzept')
    expect(lineStatus({ events: [ev('2025', 'Grunderwerb')] }, 'voll')).toBe('seit-konzept')
  })

  test('without a step: nichts, whatever has to be built', () => {
    const events = [ev('2024-01-25', 'Aussage'), ev('2021-09-21', 'Bau', true)]
    for (const a of ['freigabe', 'bestand-weg', 'voll', 'kein-weg'] as const)
      expect(lineStatus({ events }, a)).toBe('nichts')
  })
  test('Bedarf: built → vorhanden, solid 5/2 or no way → neubau, else freigabe', () => {
    expect(lineBedarf({ built: true }, 'freigabe')).toBe('vorhanden')
    expect(lineBedarf({}, 'bestand')).toBe('vorhanden')
    expect(lineBedarf({}, 'voll')).toBe('neubau')
    expect(lineBedarf({}, 'kein-weg')).toBe('neubau')
    expect(lineBedarf({}, 'freigabe')).toBe('freigabe')
    expect(lineBedarf({}, 'bestand-weg')).toBe('freigabe')
  })
})

describe('announcedYear', () => {
  test('takes the first year after the research date', () => {
    expect(announcedYear('Holzhäuseln – Sünzhausen „ab 2028 ff.“', '2026-10-22')).toBe(2028)
    expect(announcedYear('2029 (Kreiseigener Tiefbau)', '2026-10-22')).toBe(2029)
    expect(announcedYear('2025 begonnen, Fertigstellung 2027', '2026-10-22')).toBe(2027)
  })
  test('null without a future year', () => {
    expect(announcedYear('„kein Neubau“', '2026-10-22')).toBeNull()
    expect(announcedYear(undefined, '2026-10-22')).toBeNull()
    expect(announcedYear('2026', '2026-10-22')).toBeNull()
    expect(
      announcedYear('Querungshilfe an der St 2045, Abzweigung Giegenhausen', '2026-10-22'),
    ).toBeNull()
  })
})
