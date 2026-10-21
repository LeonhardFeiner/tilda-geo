import { describe, expect, it } from 'vitest'
import { missingAttributes, worklistFileStem } from './exportMappingWorklist'

describe('missingAttributes', () => {
  it('lists what is not surveyed, the same three as the Kartierungstiefe', () => {
    expect(missingAttributes({})).toEqual(['Tempolimit', 'Belag', 'Beleuchtung'])
    expect(
      missingAttributes({ maxspeed_source: 'zone', surface_source: 'tag', lit: 'no' }),
    ).toEqual([])
    // An inferred speed limit is not a surveyed one.
    expect(
      missingAttributes({
        maxspeed_source: 'inferred_from_highway',
        surface_source: 'tag',
        lit: 'yes',
      }),
    ).toEqual(['Tempolimit'])
  })
})

describe('worklistFileStem', () => {
  it('makes a plain file name', () => {
    expect(worklistFileStem('Schweitenkirchen')).toBe('schweitenkirchen')
    expect(worklistFileStem('Pfaffenhofen a.d.Ilm')).toBe('pfaffenhofen-a-d-ilm')
    expect(worklistFileStem('Größweil')).toBe('groessweil')
  })
})
