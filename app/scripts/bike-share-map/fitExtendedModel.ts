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

// Map Bundesland ID to Land name
const landNames: Record<string, string> = {
  'relation/62611': 'Baden-Württemberg',
  'relation/2145268': 'Bayern',
  'relation/62422': 'Berlin',
  'relation/62504': 'Brandenburg',
  'relation/62718': 'Bremen',
  'relation/62782': 'Hamburg',
  'relation/62650': 'Hessen',
  'relation/28322': 'Mecklenburg-Vorpommern',
  'relation/62771': 'Niedersachsen',
  'relation/62761': 'Nordrhein-Westfalen',
  'relation/62341': 'Rheinland-Pfalz',
  'relation/62372': 'Saarland',
  'relation/62467': 'Sachsen',
  'relation/62607': 'Sachsen-Anhalt',
  'relation/51529': 'Schleswig-Holstein',
  'relation/62366': 'Thüringen',
}

type Sample = {
  id: string
  blId: string
  y: number
  roadKm: number
  weight: number
  roadSlope: number
  elevMean: number
  logDens: number
  stDistKm: number
  rent: number
  carsPer1000: number
  livingSharePct: number
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
  const blId = String(p.bundesland_id || '')

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
    blId &&
    landNames[blId]
  ) {
    samples.push({
      id,
      blId,
      y,
      roadKm,
      weight: roadKm, // Weight by road network length
      roadSlope: t.road,
      elevMean: t.elevationMean,
      logDens: Math.log10(Math.max(1, d)),
      stDistKm: tr.avgDistanceToStationM / 1000,
      rent: z.rentPerM2,
      carsPer1000: c.carsPer1000,
      livingSharePct: cl.livingSharePct,
    })
  }
}

console.log('Sample count N =', samples.length)

const varNames = [
  'roadSlope',
  'elevMean',
  'logDens',
  'stDistKm',
  'rent',
  'carsPer1000',
  'livingSharePct',
] as const

const lands = [...new Set(samples.map((s) => s.blId))].sort()
const totalWeight = samples.reduce((s, row) => s + row.weight, 0)

// Weighted means of predictors
const weightedMeans: Record<string, number> = {}
for (const v of varNames) {
  weightedMeans[v] = samples.reduce((s, row) => s + row.weight * row[v], 0) / totalWeight
}
const weightedMeanY = samples.reduce((s, row) => s + row.weight * row.y, 0) / totalWeight

console.log('Weighted baseline bike share %:', weightedMeanY.toFixed(2))
console.log(
  'Weighted predictor means:',
  Object.fromEntries(
    Object.entries(weightedMeans).map(([key, val]) => [key, Number(val.toFixed(2))]),
  ),
)

// Solve WLS with Land dummies + continuous predictors
// Parameter vector: [ ...alpha_L (16), ...beta_j (7) ]
function fitWls(data: Sample[]) {
  const sumW = data.reduce((s, row) => s + row.weight, 0)
  const pMeans: Record<string, number> = {}
  for (const v of varNames) {
    pMeans[v] = data.reduce((s, row) => s + row.weight * row[v], 0) / sumW
  }

  const numParams = lands.length + varNames.length
  const ZtWZ: number[][] = Array.from({ length: numParams }, () =>
    Array.from({ length: numParams }, () => 0),
  )
  const ZtWy: number[] = Array.from({ length: numParams }, () => 0)

  for (const row of data) {
    const w = row.weight
    const zRow: number[] = new Array<number>(numParams).fill(0)
    const landIdx = lands.indexOf(row.blId)
    if (landIdx >= 0) zRow[landIdx] = 1

    for (let j = 0; j < varNames.length; j++) {
      zRow[lands.length + j] = row[varNames[j]!] - (pMeans[varNames[j]!] ?? 0)
    }

    for (let r = 0; r < numParams; r++) {
      const zr = zRow[r] ?? 0
      if (zr === 0) continue
      ZtWy[r] = (ZtWy[r] ?? 0) + w * zr * row.y
      for (let c = 0; c < numParams; c++) {
        const zc = zRow[c] ?? 0
        if (zc === 0) continue
        const rowArr = ZtWZ[r]
        if (rowArr) rowArr[c] = (rowArr[c] ?? 0) + w * zr * zc
      }
    }
  }

  // Gaussian elimination with partial pivoting
  const M = ZtWZ.map((r, i) => {
    const row = [...r]
    for (let j = 0; j < numParams; j++) row.push(i === j ? 1 : 0)
    return row
  })

  for (let i = 0; i < numParams; i++) {
    let maxRow = i
    for (let r = i + 1; r < numParams; r++) {
      if (Math.abs(M[r]?.[i] ?? 0) > Math.abs(M[maxRow]?.[i] ?? 0)) maxRow = r
    }
    const temp = M[i]!
    M[i] = M[maxRow]!
    M[maxRow] = temp

    const pivot = M[i]![i]!
    const rowI = M[i]!
    for (let c = 0; c < 2 * numParams; c++) {
      rowI[c] = (rowI[c] ?? 0) / pivot
    }
    for (let r = 0; r < numParams; r++) {
      if (r === i) continue
      const factor = M[r]![i]!
      const rowR = M[r]!
      for (let c = 0; c < 2 * numParams; c++) {
        rowR[c] = (rowR[c] ?? 0) - factor * (rowI[c] ?? 0)
      }
    }
  }

  const invM = M.map((r) => r.slice(numParams))
  const theta: number[] = new Array<number>(numParams).fill(0)
  for (let i = 0; i < numParams; i++) {
    let sum = 0
    for (let j = 0; j < numParams; j++) {
      sum += (invM[i]?.[j] ?? 0) * (ZtWy[j] ?? 0)
    }
    theta[i] = sum
  }

  const landBaselines: Record<string, number> = {}
  lands.forEach((l, i) => {
    landBaselines[l] = theta[i] ?? 0
  })

  const betas: Record<string, number> = {}
  varNames.forEach((v, j) => {
    betas[v] = theta[lands.length + j] ?? 0
  })

  return { landBaselines, betas, means: pMeans }
}

const fullFit = fitWls(samples)

console.log('\n--- Bundesland Baselines (alpha_L) ---')
for (const l of lands) {
  const blName = landNames[l] ?? l
  const alpha = fullFit.landBaselines[l] ?? 0
  const delta = alpha - weightedMeanY
  console.log(
    `  ${blName.padEnd(24)}: ${alpha.toFixed(2)} % (Abweichung: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} %p)`,
  )
}

console.log('\n--- Fitted Coefficients (Betas) ---')
for (const v of varNames) {
  console.log(`  ${v.padEnd(16)}: ${(fullFit.betas[v] ?? 0).toFixed(4)}`)
}

// In-sample R^2 and Residual Standard Error
let ssTot = 0
let ssRes = 0
let unweightedSqErrSum = 0

for (const row of samples) {
  const w = row.weight
  const dy = row.y - weightedMeanY
  ssTot += w * dy * dy

  const base = fullFit.landBaselines[row.blId] ?? weightedMeanY
  let yPred = base
  for (const v of varNames) {
    yPred += (fullFit.betas[v] ?? 0) * (row[v] - (fullFit.means[v] ?? 0))
  }
  const err = row.y - yPred
  ssRes += w * err * err
  unweightedSqErrSum += err * err
}

const r2InSample = 1 - ssRes / ssTot
const weightedRse = Math.sqrt(ssRes / totalWeight)
const unweightedSe = Math.sqrt(
  unweightedSqErrSum / (samples.length - (lands.length + varNames.length)),
)

console.log(`\nIn-Sample Weighted R^2: ${(r2InSample * 100).toFixed(2)} %`)
console.log(`Weighted Residual Std Error: ${weightedRse.toFixed(2)} %p`)
console.log(`Unweighted Gemeinde SE: ${unweightedSe.toFixed(2)} %p`)

// 10-fold Cross-Validation
console.log('\nRunning 10-fold Cross-Validation...')
const shuffled = [...samples]
// Deterministic pseudo-random shuffle for reproducibility
let seed = 42
function rand() {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1))
  const tmp = shuffled[i]!
  shuffled[i] = shuffled[j]!
  shuffled[j] = tmp
}

const K_FOLDS = 10
let cvSsTot = 0
let cvSsRes = 0

for (let fold = 0; fold < K_FOLDS; fold++) {
  const testStart = Math.floor((fold * shuffled.length) / K_FOLDS)
  const testEnd = Math.floor(((fold + 1) * shuffled.length) / K_FOLDS)

  const trainData = [...shuffled.slice(0, testStart), ...shuffled.slice(testEnd)]
  const testData = shuffled.slice(testStart, testEnd)

  const foldFit = fitWls(trainData)
  const foldMeanY =
    trainData.reduce((s, r) => s + r.weight * r.y, 0) / trainData.reduce((s, r) => s + r.weight, 0)

  for (const row of testData) {
    const w = row.weight
    const dy = row.y - foldMeanY
    cvSsTot += w * dy * dy

    const base = foldFit.landBaselines[row.blId] ?? foldMeanY
    let yPred = base
    for (const v of varNames) {
      yPred += (foldFit.betas[v] ?? 0) * (row[v] - (foldFit.means[v] ?? 0))
    }
    const err = row.y - yPred
    cvSsRes += w * err * err
  }
}

const r2Cv = 1 - cvSsRes / cvSsTot
console.log(`Cross-Validated R^2 (10-fold): ${(r2Cv * 100).toFixed(2)} %`)

// Final configuration JSON for STRUCTURAL_MODEL_CONFIG
const finalConfig = {
  baselinePct: Number(weightedMeanY.toFixed(2)),
  residualStdErrorPct: Number(weightedRse.toFixed(2)),
  n: samples.length,
  r2TotalPct: Number((r2InSample * 100).toFixed(1)),
  r2CvPct: Number((r2Cv * 100).toFixed(1)),
  means: Object.fromEntries(
    Object.entries(weightedMeans).map(([key, val]) => [key, Number(val.toFixed(2))]),
  ),
  betas: Object.fromEntries(varNames.map((v) => [v, Number((fullFit.betas[v] ?? 0).toFixed(4))])),
  bundeslandBaselines: Object.fromEntries(
    lands.map((l) => [l, Number((fullFit.landBaselines[l] ?? 0).toFixed(2))]),
  ),
}

console.log('\nConfig object for STRUCTURAL_MODEL_CONFIG:')
console.log(JSON.stringify(finalConfig, null, 2))
