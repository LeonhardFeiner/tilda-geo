/**
 * Build-time trimming of the context datasets (gemeinde-*.json). The fetch scripts write every
 * region they can join, which is up to three times what the page can show: Gemeindeverbände and
 * Stadtbezirke (admin levels 7 and 9, only in the lazily loaded stats-extra pack), plus ids that
 * are in no pack at all, and floats with 15 digits. Together the model inputs were 2.6 MB
 * gzipped on the first region click; trimmed they are about half.
 */

/** Floats keep this many significant digits; integers are untouched. */
export const CONTEXT_FLOAT_DIGITS = 6

export function roundFloats<T>(value: T): T {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Number.isInteger(value)) return value
    return Number(value.toPrecision(CONTEXT_FLOAT_DIGITS)) as T
  }
  if (Array.isArray(value)) return value.map(roundFloats) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = roundFloats(v)
    return out as T
  }
  return value
}

export type SplitContextDataset<V> = {
  /** Entries for regions of the packs loaded on every visit (stats-core, stats-gemeinden). */
  main: Record<string, V>
  /** Entries for regions of stats-extra (Gemeindeverbände, Stadtbezirke). */
  extra: Record<string, V>
  /** Ids in no pack: never shown, dropped. */
  dropped: number
}

/**
 * Splits `byId` by which stats pack its region is in. Without id sets (no stats pack at build
 * time) everything stays in `main`.
 */
export function splitContextDataset<V>(
  byId: Record<string, V>,
  mainIds: ReadonlySet<string> | null,
  extraIds: ReadonlySet<string> | null,
): SplitContextDataset<V> {
  const main: Record<string, V> = {}
  const extra: Record<string, V> = {}
  let dropped = 0
  for (const [id, value] of Object.entries(byId)) {
    const rounded = roundFloats(value)
    if (!mainIds || mainIds.has(id)) main[id] = rounded
    else if (extraIds?.has(id)) extra[id] = rounded
    else dropped++
  }
  return { main, extra, dropped }
}
