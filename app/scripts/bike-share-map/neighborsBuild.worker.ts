import { buildRegionIndex, type StatsFeature } from './regionNavigation'
import { buildNeighborIndex, neighborIndexToPrecomputedFile } from './regionNeighbors'

type BuildNeighborsMessage = {
  type: 'build'
  features: StatsFeature[]
}

self.onmessage = (event: MessageEvent<BuildNeighborsMessage>) => {
  if (event.data.type !== 'build') return
  try {
    const index = buildRegionIndex(event.data.features)
    const neighbors = buildNeighborIndex(index)
    self.postMessage({ type: 'ok', file: neighborIndexToPrecomputedFile(neighbors) })
  } catch (e) {
    self.postMessage({
      type: 'error',
      message: e instanceof Error ? e.message : 'Nachbarn berechnen fehlgeschlagen',
    })
  }
}
