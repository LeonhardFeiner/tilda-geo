import { decodeStatsRegionPack } from '../stats-export/statsRegionPack'

export type StatsDecodeRequest = { type: 'decode'; bytes: ArrayBuffer }
/** The page (generateViewerHtml decodeStatsPack) falls back to the main thread on anything but 'ok'. */
export type StatsDecodeReply = { type: 'ok'; json: string } | { type: 'error'; message: string }

/**
 * Decodes a stats pack off the main thread. The page fetches the bytes itself (so the
 * <link rel=preload> is reused) and transfers them here; the features go back as JSON text,
 * because JSON.parse on the page costs about a third of decoding the pack there, and a structured
 * clone of 11k features almost as much as the decode it replaces.
 */
export function handleStatsDecodeMessage(data: unknown): StatsDecodeReply | null {
  const request = data as Partial<StatsDecodeRequest> | null
  if (request?.type !== 'decode' || !request.bytes) return null
  try {
    const features = decodeStatsRegionPack(new Uint8Array(request.bytes))
    return { type: 'ok', json: JSON.stringify(features) }
  } catch (error) {
    return { type: 'error', message: String((error as Error)?.message ?? error) }
  }
}

// Only inside a real worker; importing this module in a test must not touch the global scope.
declare const WorkerGlobalScope: { new (): unknown } | undefined
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = (event: MessageEvent) => {
    const reply = handleStatsDecodeMessage(event.data)
    if (reply) self.postMessage(reply)
  }
}
