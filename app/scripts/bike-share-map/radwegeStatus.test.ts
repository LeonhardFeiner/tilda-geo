import { describe, expect, test } from 'vitest'
import { dateUpperBound, firstStep, lineStatus, type RouteEvent } from './radwegeStatus'

const ev = (date: string, kind: RouteEvent['kind'], uncertain?: boolean): RouteEvent => ({
  date,
  kind,
  text: 't',
  source: 's',
  url: 'https://example.org',
  ...(uncertain ? { uncertain } : {}),
})

describe('dateUpperBound', () => {
  test('partial dates stand for their last day', () => {
    expect(dateUpperBound('2024')).toBe('2024-12-31')
    expect(dateUpperBound('2024-02')).toBe('2024-02-29')
    expect(dateUpperBound('2023-11')).toBe('2023-11-30')
    expect(dateUpperBound('2024-06-07')).toBe('2024-06-07')
  })
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
  })
})

describe('lineStatus', () => {
  test('built routes and Bestand lines are "bestand"', () => {
    expect(lineStatus({ built: true, events: [] }, 'freigabe')).toBe('bestand')
    expect(lineStatus({ events: [] }, 'bestand')).toBe('bestand')
  })

  test('the first certain step decides before/since the concept (07.06.2024)', () => {
    expect(lineStatus({ events: [ev('2015', 'Programm')] }, 'voll')).toBe('vor-konzept')
    expect(lineStatus({ events: [ev('2024-06-06', 'Beschluss')] }, 'voll')).toBe('vor-konzept')
    expect(lineStatus({ events: [ev('2024-06-07', 'Beschluss')] }, 'voll')).toBe('seit-konzept')
    expect(lineStatus({ events: [ev('2025-11-12', 'Programm')] }, 'freigabe')).toBe('seit-konzept')
  })

  test('a partial date counts as "before" only if all of it lies before the concept', () => {
    expect(lineStatus({ events: [ev('2024-05', 'Grunderwerb')] }, 'voll')).toBe('vor-konzept')
    expect(lineStatus({ events: [ev('2024-06', 'Grunderwerb')] }, 'voll')).toBe('seit-konzept')
    expect(lineStatus({ events: [ev('2024', 'Grunderwerb')] }, 'voll')).toBe('seit-konzept')
  })

  test('without a step: no construction needed → nur-freigabe, else kein-schritt', () => {
    const events = [ev('2024-01-25', 'Aussage'), ev('2021-09-21', 'Bau', true)]
    expect(lineStatus({ events }, 'freigabe')).toBe('nur-freigabe')
    expect(lineStatus({ events }, 'bestand-weg')).toBe('nur-freigabe')
    expect(lineStatus({ events }, 'voll')).toBe('kein-schritt')
  })
})
