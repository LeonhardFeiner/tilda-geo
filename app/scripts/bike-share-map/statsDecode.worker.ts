import { decodeStatsRegionPack } from '../stats-export/statsRegionPack'

/**
 * Decodes a stats pack off the main thread. The page fetches the bytes itself (so the
 * <link rel=preload> is reused) and transfers them here; the features go back as JSON text,
 * because JSON.parse on the page costs about a third of decoding the pack there, and a structured
 * clone of 11k features almost as much as the decode it replaces.
 */
self.onmessage = (event: MessageEvent<{ type: 'decode'; bytes: ArrayBuffer }>) => {
  if (event.data?.type !== 'decode') return
  try {
    const features = decodeStatsRegionPack(new Uint8Array(event.data.bytes))
    self.postMessage({ type: 'ok', json: JSON.stringify(features) })
  } catch (error) {
    self.postMessage({ type: 'error', message: String((error as Error)?.message ?? error) })
  }
}
