/**
 * Which `aggregated_lengths` rows count as German regions for the viewer.
 *
 * The boundaries table keeps every polygon that touches the extract, so it also carries
 * municipalities from the neighbouring countries (Riehen, Schärding, Vejprty, …) and a few OSM
 * oddities that duplicate a real Gemeinde. Those would show up in nationwide rankings, the CSV
 * and the model fit, and an overlapping duplicate double-counts its Landkreis.
 */

type RegionProps = {
  id: string
  level: string
  regionalschluessel?: string | null
  bundesland_id?: string | null
}

/** Real regions whose OSM boundary lacks `de:regionalschluessel`. */
export const REGIONALSCHLUESSEL_OVERRIDES: Readonly<Record<string, string>> = {
  // Landkreis Greiz (Thüringen), AGS 16076
  'relation/62445': '160760000000',
}

/** Polygons that are not a German region although they carry German parents. */
export const EXCLUDED_REGION_IDS: ReadonlySet<string> = new Set([
  // Condominium Lëtzebuerg-Deutschland: the shared Mosel/Sauer/Our river strip
  'relation/3659532',
])

/** Coastal waters (`…9999999`) are gemeindefreie sea areas, not municipalities. */
function isSeaArea(rs: string) {
  return /9{7}$/.test(rs)
}

export function regionalschluesselFor(props: RegionProps) {
  return props.regionalschluessel || REGIONALSCHLUESSEL_OVERRIDES[props.id] || null
}

/** Why a row is dropped, or `null` if it is kept. */
export function regionExclusionReason(props: RegionProps) {
  if (EXCLUDED_REGION_IDS.has(props.id)) return 'excluded id'
  const level = Number(props.level)
  if (!Number.isFinite(level) || level < 5) return null
  if (!props.bundesland_id) return 'outside Germany (no Bundesland)'
  const rs = regionalschluesselFor(props)
  // Levels 5–8 are official units; each one has a Regionalschlüssel. A level-8 polygon without
  // one is an OSM duplicate (e.g. "Hoyerswerda Stadt" over "Hoyerswerda – Wojerecy").
  if (level <= 8 && !rs) return 'no Regionalschlüssel'
  if (rs && level === 8 && isSeaArea(rs)) return 'coastal waters'
  return null
}
