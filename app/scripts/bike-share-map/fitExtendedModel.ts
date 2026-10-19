import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decode } from '@msgpack/msgpack'

const dir = join(import.meta.dir, 'output', 'viewer')
const statsPackPath = join(import.meta.dir, 'output', 'stats.msgpack')

const stats = decode(readFileSync(statsPackPath)) as {
  features: Array<{ properties?: Record<string, unknown> }>
}
const density = (
  JSON.parse(readFileSync(join(dir, 'gemeinde-density.json'), 'utf8')) as {
    byId: Record<string, number>
  }
).byId
const terrain = (
  JSON.parse(readFileSync(join(dir, 'gemeinde-terrain.json'), 'utf8')) as {
    byId: Record<string, { road?: number; elevationMean?: number }>
  }
).byId
const transit = (
  JSON.parse(readFileSync(join(dir, 'gemeinde-transit.json'), 'utf8')) as {
    byId: Record<string, { avgDistanceToStationM?: number }>
  }
).byId
const zensus = (
  JSON.parse(readFileSync(join(dir, 'gemeinde-zensus.json'), 'utf8')) as {
    byId: Record<string, { rentPerM2?: number; youthSharePct?: number; vacancyRatePct?: number }>
  }
).byId
const cars = (
  JSON.parse(readFileSync(join(dir, 'gemeinde-cars.json'), 'utf8')) as {
    byId: Record<string, { carsPer1000?: number }>
  }
).byId
const calmed = (
  JSON.parse(readFileSync(join(dir, 'gemeinde-calmed.json'), 'utf8')) as {
    byId: Record<string, { calmedSharePct?: number; livingSharePct?: number }>
  }
).byId

type Sample = {
  id: string
  y: number
  roadKm: number
  roadSlope: number
  elevMean: number
  logDens: number
  stDistKm: number
  rent: number
  carsPer1000: number
  livingSharePct: number
  calmedSharePct: number
}

const samples: Sample[] = []

for (const f of stats.features) {
  const p = f.properties || {}
  const level = String(p.level ?? '')
  if (level !== '8') continue
  const id = String(p.id ?? '')

  const rl = (p.road_length as Record<string, number>) || {}
  const bl = (p.bikelane_length as Record<string, number>) || {}
  let roadKm = 0
  for (const v of Object.values(rl)) if (typeof v === 'number') roadKm += v
  let bikeKm = 0
  for (const v of Object.values(bl)) if (typeof v === 'number') bikeKm += v
  // Note: in stats.msgpack v2 values are whole meters
  roadKm /= 1000
  bikeKm /= 1000
  if (roadKm < 5) continue

  const y = (bikeKm / roadKm) * 100

  const d = density[id]
  const t = terrain[id]
  const tr = transit[id]
  const z = zensus[id]
  const c = cars[id]
  const cl = calmed[id]

  if (
    typeof d === 'number' &&
    t &&
    typeof t.road === 'number' &&
    typeof t.elevationMean === 'number' &&
    tr &&
    typeof tr.avgDistanceToStationM === 'number' &&
    z &&
    typeof z.rentPerM2 === 'number' &&
    c &&
    typeof c.carsPer1000 === 'number' &&
    cl &&
    typeof cl.livingSharePct === 'number' &&
    typeof cl.calmedSharePct === 'number'
  ) {
    samples.push({
      id,
      y,
      roadKm,
      roadSlope: t.road,
      elevMean: t.elevationMean,
      logDens: Math.log10(Math.max(1, d)),
      stDistKm: tr.avgDistanceToStationM / 1000,
      rent: z.rentPerM2,
      carsPer1000: c.carsPer1000,
      livingSharePct: cl.livingSharePct,
      calmedSharePct: cl.calmedSharePct,
    })
  }
}

console.log('Sample count (Gemeinden):', samples.length)

const varNames = [
  'roadSlope',
  'elevMean',
  'logDens',
  'stDistKm',
  'rent',
  'carsPer1000',
  'livingSharePct',
] as const

const k = varNames.length
const n = samples.length

const means: Record<string, number> = {}
for (const v of varNames) {
  means[v] = samples.reduce((s, row) => s + row[v], 0) / n
}
const meanY = samples.reduce((s, row) => s + row.y, 0) / n

console.log('Baseline mean bike share %:', meanY.toFixed(2))
console.log(
  'Means:',
  Object.fromEntries(Object.entries(means).map(([key, val]) => [key, Number(val.toFixed(2))])),
)

const XtX: number[][] = Array.from({ length: k }, () => Array.from({ length: k }, () => 0))
const XtY: number[] = Array.from({ length: k }, () => 0)

for (const row of samples) {
  const dy = row.y - meanY
  const x = varNames.map((v) => row[v] - (means[v] ?? 0))
  for (let i = 0; i < k; i++) {
    XtY[i] = (XtY[i] ?? 0) + (x[i] ?? 0) * dy
    for (let j = 0; j < k; j++) {
      const rowArr = XtX[i]
      if (rowArr) rowArr[j] = (rowArr[j] ?? 0) + (x[i] ?? 0) * (x[j] ?? 0)
    }
  }
}

// Invert XtX
const A = XtX.map((r, i) => {
  const row = [...r]
  for (let j = 0; j < k; j++) row.push(i === j ? 1 : 0)
  return row
})

for (let i = 0; i < k; i++) {
  let maxRow = i
  for (let r = i + 1; r < k; r++) {
    const curVal = Math.abs(A[r]?.[i] ?? 0)
    const maxVal = Math.abs(A[maxRow]?.[i] ?? 0)
    if (curVal > maxVal) maxRow = r
  }
  const temp = A[i]
  A[i] = A[maxRow]!
  A[maxRow] = temp!

  const pivot = A[i]![i]!
  const rowI = A[i]!
  for (let c = 0; c < 2 * k; c++) {
    rowI[c] = (rowI[c] ?? 0) / pivot
  }
  for (let r = 0; r < k; r++) {
    if (r === i) continue
    const factor = A[r]![i]!
    const rowR = A[r]!
    for (let c = 0; c < 2 * k; c++) {
      rowR[c] = (rowR[c] ?? 0) - factor * (rowI[c] ?? 0)
    }
  }
}

const invXtX = A.map((r) => r.slice(k))
const betas: number[] = Array.from({ length: k }, () => 0)
for (let i = 0; i < k; i++) {
  let sum = 0
  for (let j = 0; j < k; j++) {
    sum += (invXtX[i]?.[j] ?? 0) * (XtY[j] ?? 0)
  }
  betas[i] = sum
}

console.log('\nFitted Coefficients (Betas):')
varNames.forEach((v, i) => {
  console.log(`  ${v}: ${(betas[i] ?? 0).toFixed(4)}`)
})

let ssTot = 0
let ssRes = 0
for (const row of samples) {
  const dy = row.y - meanY
  ssTot += dy * dy
  let yPred = meanY
  for (let i = 0; i < k; i++) {
    yPred += (betas[i] ?? 0) * (row[varNames[i]!] - (means[varNames[i]!] ?? 0))
  }
  const err = row.y - yPred
  ssRes += err * err
}

const r2 = 1 - ssRes / ssTot
console.log(`\nModel R^2: ${(r2 * 100).toFixed(2)} %`)

// Partial R^2 decomposition (variance explained by groups)


console.log('\nConfig output for rankingDisplay.ts:')
console.log(
  JSON.stringify(
    {
      baselinePct: Number(meanY.toFixed(2)),
      means: Object.fromEntries(
        Object.entries(means).map(([key, val]) => [key, Number(val.toFixed(2))]),
      ),
      betas: Object.fromEntries(varNames.map((v, i) => [v, Number((betas[i] ?? 0).toFixed(4))])),
      r2TotalPct: Number((r2 * 100).toFixed(1)),
    },
    null,
    2,
  ),
)
