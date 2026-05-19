import { BIKE_SHARE_COLOR_CAP_PCT } from './constants'

export type ColorScaleId = 'green' | 'traffic' | 'colorblind'

export type ColorScaleDef = {
  id: ColorScaleId
  label: string
  legendGradient: string
  low: string
  mid: string
  high: string
  /** Radwege overlay – contrasts with choropleth fills */
  bikelaneColor: string
}

/** Low → high bike-share % (red = wenig Radinfra, grün = viel). */
export const COLOR_SCALES = [
  {
    id: 'green',
    label: 'Grün (dezent)',
    legendGradient: 'linear-gradient(to right, #e8f5e9, #43a047, #1b5e20)',
    low: '#e8f5e9',
    mid: '#43a047',
    high: '#1b5e20',
    bikelaneColor: '#b71c1c',
  },
  {
    id: 'traffic',
    label: 'Ampel (kontrast)',
    legendGradient: 'linear-gradient(to right, #c62828, #ffeb3b, #2e7d32)',
    low: '#c62828',
    mid: '#ffeb3b',
    high: '#2e7d32',
    bikelaneColor: '#1565c0',
  },
  {
    id: 'colorblind',
    label: 'Blau–Gelb–Orange (farbenblind)',
    legendGradient: 'linear-gradient(to right, #e69f00, #f0e442, #3274a1)',
    low: '#e69f00',
    mid: '#f0e442',
    high: '#3274a1',
    bikelaneColor: '#882255',
  },
] satisfies ColorScaleDef[]

export const DEFAULT_COLOR_SCALE: ColorScaleId = 'green'

export function isColorScaleId(value: string) {
  return COLOR_SCALES.some((s) => s.id === value)
}

export type BikeShareColorScaleRange = {
  min: number
  max: number
  dataMin: number
  dataMax: number
  scaleCapped: boolean
}

/** Choropleth domain from 0; cap color scale when any value exceeds BIKE_SHARE_COLOR_CAP_PCT. */
export function computeBikeShareColorScaleRange(values: number[]) {
  if (!values.length) {
    return {
      min: 0,
      max: 20,
      dataMin: 0,
      dataMax: 20,
      scaleCapped: false,
    } satisfies BikeShareColorScaleRange
  }
  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  const scaleCapped = dataMax > BIKE_SHARE_COLOR_CAP_PCT
  const max = scaleCapped ? BIKE_SHARE_COLOR_CAP_PCT : dataMax
  return { min: 0, max, dataMin, dataMax, scaleCapped } satisfies BikeShareColorScaleRange
}
