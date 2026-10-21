import { describe, expect, test } from 'vitest'
import { fitStructuralModels } from './fitExtendedModel'
import { STRUCTURAL_MODEL_CONFIGS } from './rankingDisplay'

/**
 * The coefficients in structuralModelConfigs.generated.ts must be what the committed data
 * produces. Fails when the data was refreshed without `bun run bike-share-map:fit-model`, or when
 * someone edited a number by hand.
 */
describe('structural model config', () => {
  const fitted = fitStructuralModels()
  for (const type of ['standard', 'primary'] as const) {
    test(`${type} matches a refit of the committed data`, () => {
      const cfg = STRUCTURAL_MODEL_CONFIGS[type]
      const fit = fitted[type]
      expect(cfg.n).toBe(fit.n)
      expect(cfg.r2TotalPct).toBe(fit.r2TotalPct)
      expect(cfg.residualStdErrorPct).toBe(fit.residualStdErrorPct)
      for (const [key, beta] of Object.entries(fit.betas)) {
        expect(cfg.betas[key as keyof typeof cfg.betas]).toBeCloseTo(beta, 4)
      }
      for (const [id, base] of Object.entries(fit.bundeslandBaselines)) {
        expect(cfg.bundeslandBaselines[id]).toBeCloseTo(base, 2)
      }
    })
  }
})
