import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { handleStatsDecodeMessage } from './statsDecode.worker'

/**
 * jsdom has no Worker, so the viewer smoke test only covers the main-thread fallback. This pins
 * the reply the page relies on (generateViewerHtml decodeStatsPack): anything other than
 * {type: 'ok', json} silently sends every visitor back to decoding on the main thread.
 */
test('decodes the committed core pack and answers {type: ok, json}', () => {
  const bytes = readFileSync(join(import.meta.dirname, 'output', 'viewer', 'stats-core.msgpack'))
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const reply = handleStatsDecodeMessage({ type: 'decode', bytes: buffer })
  expect(reply?.type).toBe('ok')
  const features = JSON.parse((reply as { json: string }).json) as Array<{
    properties: { level: unknown }
  }>
  expect(features.length).toBeGreaterThan(100)
  expect(features.some((f) => String(f.properties.level) === '2')).toBe(true)
})

test('answers {type: error} for bytes that are not a pack, and ignores other messages', () => {
  expect(handleStatsDecodeMessage({ type: 'something-else' })).toBeNull()
  expect(handleStatsDecodeMessage(null)).toBeNull()
  expect(
    handleStatsDecodeMessage({ type: 'decode', bytes: new Uint8Array([1, 2, 3]).buffer }),
  ).toEqual({ type: 'error', message: expect.any(String) })
})
