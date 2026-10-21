import { buildRegionIndex } from './regionNavigation'
import { buildNeighborIndex, neighborIndexToPrecomputedFile } from './regionNeighbors'
import { type NeighborsWorkerRequest, postWorkerResponse } from './workerMessages'

self.onmessage = (event: MessageEvent<NeighborsWorkerRequest>) => {
  if (event.data.type !== 'build') return
  try {
    const index = buildRegionIndex(event.data.features)
    const neighbors = buildNeighborIndex(index)
    postWorkerResponse({ type: 'ok', file: neighborIndexToPrecomputedFile(neighbors) })
  } catch (e) {
    postWorkerResponse({
      type: 'error',
      message: e instanceof Error ? e.message : 'Nachbarn berechnen fehlgeschlagen',
    })
  }
}
