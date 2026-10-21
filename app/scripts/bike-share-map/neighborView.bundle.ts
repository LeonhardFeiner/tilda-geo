import * as NeighborView from './neighborView'

;(globalThis as typeof globalThis & { NeighborView: typeof NeighborView }).NeighborView =
  NeighborView
