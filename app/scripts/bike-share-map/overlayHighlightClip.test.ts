import { describe, expect, test } from 'vitest'
import {
  clipCrossingLinesToRegion,
  clipLineToBbox,
  pointInRegion,
  RegionBorderIndex,
  tileBoundsLonLat,
  type Position,
  type RegionGeometry,
} from './overlayHighlightClip'

const square = (x0: number, y0: number, x1: number, y1: number): Position[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
]

/** 0..10 square with a 4..6 hole */
const regionWithHole: RegionGeometry = {
  type: 'Polygon',
  coordinates: [square(0, 0, 10, 10), square(4, 4, 6, 6)],
}

const line = (coords: Position[], tileBounds?: [number, number, number, number]) => ({
  geometry: { type: 'LineString' as const, coordinates: coords },
  properties: { road: 'residential' },
  tileBounds,
})

const pieces = (fc: ReturnType<typeof clipCrossingLinesToRegion>) =>
  fc.features.flatMap((f) => f.geometry.coordinates)

const close = (a: Position[], b: Position[]) => {
  expect(a.length).toBe(b.length)
  a.forEach((p, i) => {
    expect(p[0]).toBeCloseTo(b[i]![0], 9)
    expect(p[1]).toBeCloseTo(b[i]![1], 9)
  })
}

describe('pointInRegion', () => {
  test('holes count as outside, islands as inside', () => {
    const rings = regionWithHole.coordinates
    expect(pointInRegion([1, 1], rings)).toBe(true)
    expect(pointInRegion([5, 5], rings)).toBe(false)
    expect(pointInRegion([11, 1], rings)).toBe(false)
    const islands: RegionGeometry = {
      type: 'MultiPolygon',
      coordinates: [[square(0, 0, 2, 2)], [square(5, 0, 7, 2)]],
    }
    expect(pointInRegion([1, 1], islands.coordinates.flat())).toBe(true)
    expect(pointInRegion([3, 1], islands.coordinates.flat())).toBe(false)
    expect(pointInRegion([6, 1], islands.coordinates.flat())).toBe(true)
  })
})

describe('clipCrossingLinesToRegion', () => {
  test('leaves lines that do not cross the border to the map filter', () => {
    const fc = clipCrossingLinesToRegion(
      [
        line([
          [1, 1],
          [2, 2],
        ]),
        line([
          [20, 20],
          [30, 30],
        ]),
        // touches the border's bbox cells but never the border itself
        line([
          [1, 0.5],
          [3, 0.5],
        ]),
      ],
      regionWithHole,
    )
    expect(fc.features).toEqual([])
  })

  test('keeps the inside part of a line that leaves the region', () => {
    const fc = clipCrossingLinesToRegion(
      [
        line([
          [2, 8],
          [8, 8],
          [14, 8],
        ]),
      ],
      regionWithHole,
    )
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0]!.properties).toEqual({ road: 'residential' })
    close(pieces(fc)[0]!, [
      [2, 8],
      [8, 8],
      [10, 8],
    ])
  })

  test('a line passing through keeps only the chord inside', () => {
    const fc = clipCrossingLinesToRegion(
      [
        line([
          [-5, 2],
          [15, 2],
        ]),
      ],
      regionWithHole,
    )
    close(pieces(fc)[0]!, [
      [0, 2],
      [10, 2],
    ])
  })

  test('a line through a hole is cut on both sides of the hole', () => {
    const fc = clipCrossingLinesToRegion(
      [
        line([
          [1, 5],
          [9, 5],
        ]),
      ],
      regionWithHole,
    )
    const got = pieces(fc)
    expect(got).toHaveLength(2)
    close(got[0]!, [
      [1, 5],
      [4, 5],
    ])
    close(got[1]!, [
      [6, 5],
      [9, 5],
    ])
  })

  test('a line from one island to another keeps a piece on each', () => {
    const islands: RegionGeometry = {
      type: 'MultiPolygon',
      coordinates: [[square(0, 0, 2, 2)], [square(5, 0, 7, 2)]],
    }
    const fc = clipCrossingLinesToRegion(
      [
        line([
          [1, 1],
          [6, 1],
        ]),
      ],
      islands,
    )
    const got = pieces(fc)
    expect(got).toHaveLength(2)
    close(got[0]!, [
      [1, 1],
      [2, 1],
    ])
    close(got[1]!, [
      [5, 1],
      [6, 1],
    ])
  })

  test('crossing exactly through a polygon vertex is cut once', () => {
    const fc = clipCrossingLinesToRegion(
      [
        line([
          [8, 8],
          [12, 12],
        ]),
      ],
      regionWithHole,
    )
    const got = pieces(fc)
    expect(got).toHaveLength(1)
    close(got[0]!, [
      [8, 8],
      [10, 10],
    ])
  })

  test('MultiLineString parts are handled one by one', () => {
    const fc = clipCrossingLinesToRegion(
      [
        {
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [1, 1],
                [2, 1],
              ],
              [
                [8, 1],
                [12, 1],
              ],
            ],
          },
          properties: {},
        },
      ],
      regionWithHole,
    )
    const got = pieces(fc)
    expect(got).toHaveLength(1)
    close(got[0]!, [
      [8, 1],
      [10, 1],
    ])
  })

  test('pieces are cut back to the tile bounds after the region clip', () => {
    // The tile covers x 0..5; the copy extends into the buffer up to x 5.5 and crosses the
    // region border at x 10 only in the neighbouring tile. Still: the part inside this tile is
    // drawn here, because the region clip sees the buffered copy first.
    const fc = clipCrossingLinesToRegion(
      [
        line(
          [
            [2, 8],
            [12, 8],
          ],
          [0, 0, 5, 10],
        ),
      ],
      regionWithHole,
    )
    close(pieces(fc)[0]!, [
      [2, 8],
      [5, 8],
    ])
  })

  test('a reused border index gives the same answer', () => {
    const index = new RegionBorderIndex(regionWithHole)
    expect(index.edgeCount).toBe(8)
    const lines = [
      line([
        [-5, 2],
        [15, 2],
      ]),
    ]
    expect(clipCrossingLinesToRegion(lines, regionWithHole, index)).toEqual(
      clipCrossingLinesToRegion(lines, regionWithHole),
    )
  })

  test('non-polygon or missing regions give an empty collection', () => {
    expect(
      clipCrossingLinesToRegion(
        [
          line([
            [0, 0],
            [1, 1],
          ]),
        ],
        null,
      ).features,
    ).toEqual([])
    expect(
      clipCrossingLinesToRegion(
        [
          line([
            [0, 0],
            [1, 1],
          ]),
        ],
        {
          type: 'Point',
        } as unknown as RegionGeometry,
      ).features,
    ).toEqual([])
  })
})

describe('clipLineToBbox', () => {
  test('keeps the parts inside and splits where the line leaves and re-enters', () => {
    const got = clipLineToBbox(
      [
        [-1, 1],
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
        [1, -1],
      ],
      [0, 0, 2, 2],
    )
    expect(got).toHaveLength(2)
    close(got[0]!, [
      [0, 1],
      [1, 1],
      [2, 1],
    ])
    close(got[1]!, [
      [1, 2],
      [1, 0],
    ])
  })

  test('a line fully outside gives nothing', () => {
    expect(
      clipLineToBbox(
        [
          [5, 5],
          [6, 6],
        ],
        [0, 0, 2, 2],
      ),
    ).toEqual([])
  })
})

describe('tileBoundsLonLat', () => {
  test('matches the XYZ tile scheme', () => {
    const world = tileBoundsLonLat(0, 0, 0)
    expect(world[0]).toBe(-180)
    expect(world[2]).toBe(180)
    expect(world[1]).toBeCloseTo(-85.0511, 3)
    expect(world[3]).toBeCloseTo(85.0511, 3)
    const ne = tileBoundsLonLat(1, 1, 0)
    expect(ne[0]).toBe(0)
    expect(ne[1]).toBeCloseTo(0, 9)
    expect(ne[2]).toBe(180)
    // Munich (11.58 E, 48.14 N) is in z10 x=544 y=355
    const munich = tileBoundsLonLat(10, 544, 355)
    expect(munich[0]).toBeLessThan(11.58)
    expect(munich[2]).toBeGreaterThan(11.58)
    expect(munich[1]).toBeLessThan(48.14)
    expect(munich[3]).toBeGreaterThan(48.14)
  })
})
