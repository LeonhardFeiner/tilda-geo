import * as RegionSearch from './regionSearch'

;(globalThis as typeof globalThis & { RegionSearch: typeof RegionSearch }).RegionSearch =
  RegionSearch
