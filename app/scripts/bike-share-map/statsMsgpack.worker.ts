type LoadMessage = { type: 'load'; url: string }

self.onmessage = async (event: MessageEvent<LoadMessage>) => {
  if (event.data?.type !== 'load') return
  try {
    const res = await fetch(event.data.url)
    if (!res.ok) throw new Error(`stats.msgpack HTTP ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    self.postMessage({ type: 'ok', bytes }, [bytes.buffer])
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
