/**
 * Messages between the page and its neighbour workers (neighbors.worker.ts loads the precomputed
 * index, neighborsBuild.worker.ts builds one in the browser). The page side is the inline script
 * in generateViewerHtml.ts, which checks `type` the same way.
 */
import type { StatsFeature } from './regionNavigation'
import type { PrecomputedNeighborsFile } from './regionNeighbors'

export type NeighborsWorkerRequest =
  | { type: 'load'; msgpackUrl: string; jsonUrl: string }
  | { type: 'build'; features: StatsFeature[] }

export type NeighborsWorkerResponse =
  | { type: 'ok'; file: PrecomputedNeighborsFile }
  | { type: 'error'; message: string }

export function postWorkerResponse(message: NeighborsWorkerResponse) {
  self.postMessage(message)
}
