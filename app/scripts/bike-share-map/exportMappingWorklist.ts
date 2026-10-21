#!/usr/bin/env bun
/**
 * A worklist for local mappers: one GeoJSON per Gemeinde to open in uMap, JOSM or on a phone.
 *
 *   bun run bike-share-map:mapping-worklist -- relation/396557
 *
 * Contains
 *  - `kind: "attribute"` — roads (no service roads, no motorways — as fetchMappingCompleteness.ts)
 *    whose speed limit, surface or lighting is not mapped; `missing` lists which, `osm` links the way;
 *  - `kind: "busy-road"` — stretches of busy rural roads without bike infrastructure in OSM
 *    (output/busy-roads.geojson): check on the ground whether a path is
 *    really missing or just not mapped.
 *
 * Only tag what you have seen: "lit=no" on an unlit road is real information; a guess is not.
 * Needs local Postgres (the processing run behind the current stats).
 * Output: output/worklists/<gemeinde-name>.geojson (not deployed).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { getBaseDatabaseUrl } from '@/server/database-url.server'

export type WorklistAttribute = 'Tempolimit' | 'Belag' | 'Beleuchtung'

/** Which surveyed attributes a road lacks — the same three as the Kartierungstiefe. */
export function missingAttributes(tags: Record<string, unknown>): WorklistAttribute[] {
  const missing: WorklistAttribute[] = []
  const speedSource = String(tags.maxspeed_source ?? '')
  if (
    !['maxspeed_tag', 'zone', 'maxspeed:forward_tag', 'maxspeed:backward_tag'].includes(speedSource)
  ) {
    missing.push('Tempolimit')
  }
  if (tags.surface_source !== 'tag') missing.push('Belag')
  if (tags.lit == null) missing.push('Beleuchtung')
  return missing
}

/** "Schweitenkirchen" → "schweitenkirchen", "Pfaffenhofen a.d.Ilm" → "pfaffenhofen-a-d-ilm". */
export function worklistFileStem(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'gemeinde'
  )
}

/** Busy-road features that lie in the region and have no bike infrastructure. */
async function busyRoadsWithoutPath(client: Client, regionId: string) {
  const path = join(import.meta.dir, 'output', 'busy-roads.geojson')
  if (!existsSync(path)) return []
  const all = JSON.parse(readFileSync(path, 'utf8')) as {
    features: Array<{ geometry: unknown; properties: Record<string, unknown> }>
  }
  const missing = all.features.filter((f) => f.properties.covered === false)
  if (!missing.length) return []
  const { rows } = await client.query<{ i: number }>(
    `
    SELECT (t.ord - 1)::int AS i
    FROM UNNEST($1::text[]) WITH ORDINALITY AS t(g, ord),
      (SELECT geom FROM public.aggregated_lengths WHERE id = $2) r
    WHERE ST_Intersects(r.geom, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(t.g), 4326), 3857))
    `,
    [missing.map((f) => JSON.stringify(f.geometry)), regionId],
  )
  return rows.map(({ i }) => {
    const f = missing[i]!
    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        kind: 'busy-road',
        name: `${f.properties.strasse}: ${f.properties.dtv} Kfz/Tag, kein Radweg in OSM`,
        description:
          'Vor Ort prüfen: Gibt es hier einen Radweg, der in OpenStreetMap fehlt? ' +
          `Zählabschnitt ${f.properties.anfang ?? ''} → ${f.properties.ende ?? ''}.`,
        link: f.properties.link,
      },
    }
  })
}

if (import.meta.main) {
  const regionId = process.argv[2]
  if (!regionId?.startsWith('relation/')) {
    process.stderr.write('Usage: bun run bike-share-map:mapping-worklist -- relation/<id>\n')
    process.exit(1)
  }
  const client = new Client({ connectionString: getBaseDatabaseUrl() })
  await client.connect()
  try {
    await client.query('SET statement_timeout = 0')
    const region = await client.query<{ name: string }>(
      'SELECT name FROM public.aggregated_lengths WHERE id = $1',
      [regionId],
    )
    const name = region.rows[0]?.name
    if (!name) throw new Error(`${regionId} is not in aggregated_lengths`)

    const { rows } = await client.query<{
      osm_type: string
      osm_id: string
      tags: Record<string, unknown>
      g: string
    }>(
      `
      SELECT r.osm_type, r.osm_id, r.tags, ST_AsGeoJSON(ST_Transform(r.geom, 4326), 6) AS g
      FROM public.roads r, (SELECT geom FROM public.aggregated_lengths WHERE id = $1) a
      WHERE ST_Intersects(a.geom, r.geom)
        AND ST_Intersects(a.geom, ST_PointOnSurface(r.geom))
        AND r.tags ->> 'road' NOT LIKE 'service%'
        AND r.tags ->> 'road' NOT IN ('motorway', 'motorway_link')
      `,
      [regionId],
    )
    const attributeFeatures = rows.flatMap((row) => {
      const missing = missingAttributes(row.tags)
      if (!missing.length) return []
      const type = row.osm_type === 'W' ? 'way' : row.osm_type === 'R' ? 'relation' : 'node'
      const label = String(row.tags.name ?? row.tags.name_ref ?? row.tags.road ?? 'Straße')
      return [
        {
          type: 'Feature',
          geometry: JSON.parse(row.g),
          properties: {
            kind: 'attribute',
            name: `${label}: ${missing.join(', ')} fehlt`,
            missing,
            osm: `https://www.openstreetmap.org/${type}/${row.osm_id}`,
          },
        },
      ]
    })
    const busy = await busyRoadsWithoutPath(client, regionId)

    const outDir = join(import.meta.dir, 'output', 'worklists')
    mkdirSync(outDir, { recursive: true })
    const outPath = join(outDir, `${worklistFileStem(name)}.geojson`)
    writeFileSync(
      outPath,
      JSON.stringify({
        type: 'FeatureCollection',
        name: `Kartier-Arbeitsliste ${name}`,
        description:
          'Straßen ohne erfasstes Tempolimit, Belag oder Beleuchtung, und vielbefahrene ' +
          'Landstraßen ohne Radweg in OSM. Nur eintragen, was vor Ort gesehen wurde. ' +
          'Daten © OpenStreetMap-Mitwirkende (ODbL); Verkehrsmengen © Bayerische ' +
          'Straßenbauverwaltung (CC BY 4.0).',
        features: [...busy, ...attributeFeatures],
      }),
    )
    const km = (n: number) => n.toLocaleString('de-DE')
    process.stdout.write(
      `${outPath}: ${km(attributeFeatures.length)} roads with missing attributes, ` +
        `${km(busy.length)} busy-road stretches without a path\n`,
    )
  } finally {
    await client.end()
  }
}
