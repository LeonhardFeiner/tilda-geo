import { decodeNeighborsPack, parsePrecomputedNeighborsJsonText } from './regionNeighbors'
import { type NeighborsWorkerRequest, postWorkerResponse } from './workerMessages'

self.onmessage = async (event: MessageEvent<NeighborsWorkerRequest>) => {
  if (event.data.type !== 'load') return

  const { msgpackUrl, jsonUrl } = event.data
  try {
    const msgpackRes = await fetch(msgpackUrl)
    if (msgpackRes.ok) {
      const bytes = new Uint8Array(await msgpackRes.arrayBuffer())
      postWorkerResponse({ type: 'ok', file: decodeNeighborsPack(bytes) })
      return
    }
  } catch {
    // fall through to JSON
  }

  try {
    const jsonRes = await fetch(jsonUrl)
    if (!jsonRes.ok) {
      postWorkerResponse({ type: 'error', message: `Nachbarn nicht gefunden (${jsonRes.status})` })
      return
    }
    const file = parsePrecomputedNeighborsJsonText(await jsonRes.text())
    if (!file) {
      postWorkerResponse({ type: 'error', message: 'Ungültige neighbors.json' })
      return
    }
    postWorkerResponse({ type: 'ok', file })
  } catch (e) {
    postWorkerResponse({
      type: 'error',
      message: e instanceof Error ? e.message : 'Nachbarn laden fehlgeschlagen',
    })
  }
}
