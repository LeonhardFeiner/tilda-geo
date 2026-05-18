import * as RegionNav from './regionNavigation'

;(globalThis as typeof globalThis & { RegionNav: typeof RegionNav }).RegionNav = RegionNav
