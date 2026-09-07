/**
 * Human-readable key for an OSM admin level in `public.aggregated_lengths`.
 * The set of levels that gets aggregated lives in
 * `processing/steps/afterthoughts/sql/aggregate_lengths.sql`.
 */
export function levelKeyForAdminLevel(level: string | null) {
  if (level === '2') return 'land'
  if (level === '3') return 'admin3'
  if (level === '4') return 'bund'
  if (level === '5') return 'regierungsbezirk'
  if (level === '6') return 'landkreis'
  if (level === '7') return 'verwaltungsgemeinschaft'
  if (level === '8') return 'gemeinde'
  if (level === '9') return 'gemeindebezirk'
  return ''
}
