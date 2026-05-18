/** OSM admin levels written to `public.aggregated_lengths` and statistics export. */
export const STATS_ADMIN_LEVELS = ['2', '3', '4', '5', '6', '7', '8', '9'] as const

export type StatsAdminLevel = (typeof STATS_ADMIN_LEVELS)[number]

export const STATS_ADMIN_LEVELS_SQL = STATS_ADMIN_LEVELS.map((level) => `'${level}'`).join(', ')

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
