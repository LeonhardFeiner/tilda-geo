import {
  decodeNeighborsPack,
  parsePrecomputedNeighborsJsonText,
  type PrecomputedNeighborsFile,
} from './regionNeighbors'

type LoadNeighborsMessage = {
  type: 'load'
  msgpackUrl: string
  jsonUrl: string
}

self.onmessage = async (event: MessageEvent<LoadNeighborsMessage>) => {
  if (event.data.type !== 'load') return

  const { msgpackUrl, jsonUrl } = event.data
  try {
    const msgpackRes = await fetch(msgpackUrl)
    if (msgpackRes.ok) {
      const bytes = new Uint8Array(await msgpackRes.arrayBuffer())
      const file = decodeNeighborsPack(bytes)
      self.postMessage({ type: 'ok', file } satisfies {
        type: 'ok'
        file: PrecomputedNeighborsFile
      })
      return
    }
  } catch {
    // fall through to JSON
  }

  try {
    const jsonRes = await fetch(jsonUrl)
    if (!jsonRes.ok) {
      self.postMessage({ type: 'error', message: `Nachbarn nicht gefunden (${jsonRes.status})` })
      return
    }
    const file = parsePrecomputedNeighborsJsonText(await jsonRes.text())
    if (!file) {
      self.postMessage({ type: 'error', message: 'Ungültige neighbors.json' })
      return
    }
    self.postMessage({ type: 'ok', file })
  } catch (e) {
    self.postMessage({
      type: 'error',
      message: e instanceof Error ? e.message : 'Nachbarn laden fehlgeschlagen',
    })
  }
}
