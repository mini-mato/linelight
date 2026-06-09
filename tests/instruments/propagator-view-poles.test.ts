/**
 * Propagator-view pole physics — unit tests.
 */

import { describe, expect, it } from 'vitest'
import { computePoles } from '../../src/instruments/propagator-view/poles'
import type { Conditions } from '../../src/types'
import type { EmissionLine } from '../../src/data/types'

const zeroConditions: Conditions = {
  temperature_K: 300,
  pressure_Pa: 0,
  numberDensity_per_m3: 2.5e25,
  bField_T: 0,
  eField_V_per_m: 0,
  bulkVelocity_m_per_s: 0,
  gravitationalPotential_J_per_kg: 0,
}

const bField1T: Conditions = { ...zeroConditions, bField_T: 1 }

const hAlpha: EmissionLine = {
  element: 'H',
  wavelength_nm: 656.281,
  label: 'Hα',
  transition: 'n=3 → 2',
  series: 'Balmer',
  upper: 3,
  lower: 2,
  source: 'NIST-ASD',
  retrievedAt: '2026-05-02',
}

const naD2: EmissionLine = {
  element: 'Na',
  wavelength_nm: 588.995,
  label: 'D₂',
  transition: '3²P₃/₂ → 3²S₁/₂',
  series: 'fine-structure',
  source: 'NIST-ASD',
  retrievedAt: '2026-05-02',
}

describe('computePoles — B=0, P=0', () => {
  it('returns exactly one pole per line when B=0', () => {
    const poles = computePoles({ line: hAlpha, conditions: zeroConditions })
    expect(poles).toHaveLength(1)
  })

  it('pole has negative imaginary part', () => {
    const poles = computePoles({ line: hAlpha, conditions: zeroConditions })
    expect(poles[0].imOmega_rad_per_s).toBeLessThan(0)
  })
})

describe('computePoles — Zeeman splitting', () => {
  it('returns exactly two poles when B=1 T', () => {
    const poles = computePoles({ line: hAlpha, conditions: bField1T })
    expect(poles).toHaveLength(2)
  })

  it('Zeeman poles have different reOmega', () => {
    const poles = computePoles({ line: hAlpha, conditions: bField1T })
    expect(poles[0].reOmega_rad_per_s).not.toBeCloseTo(poles[1].reOmega_rad_per_s, 0)
  })

  it('all Zeeman poles have fidelity schematic', () => {
    const poles = computePoles({ line: hAlpha, conditions: bField1T })
    for (const p of poles) expect(p.fidelity).toBe('schematic')
  })
})

describe('computePoles — fidelity tagging', () => {
  it('Hα line (H, n=3→2, B=0) gets fidelity exact', () => {
    const poles = computePoles({ line: hAlpha, conditions: zeroConditions })
    expect(poles[0].fidelity).toBe('exact')
  })

  it('Na D₂ line gets fidelity schematic (non-hydrogen element)', () => {
    const poles = computePoles({ line: naD2, conditions: zeroConditions })
    expect(poles.length).toBeGreaterThan(0)
    expect(poles[0].fidelity).toBe('schematic')
  })
})
