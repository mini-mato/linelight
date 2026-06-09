/**
 * Coherent two-level superposition — unit tests.
 *
 * Covers the static algebraic identities of `superpositionDensity`, the
 * Hα optical-frequency reference value, and the dipole-expectation phase
 * behavior. The dipole integrator itself is unit-tested by `einstein.ts`
 * — we only smoke-check the re-export here.
 */

import { describe, expect, it } from 'vitest'
import {
  dipoleExpectation,
  dipoleMatrixElement_au,
  superpositionDensity,
  transitionAngularFrequency_rad_per_s,
} from '../../src/physics/atomic/superposition'

describe('superpositionDensity — algebraic identities', () => {
  it('reduces to ½(ψ_lo + ψ_hi)² when cos(ωt) = 1', () => {
    const psi_lo = 0.7
    const psi_hi = 0.4
    const expected = 0.5 * (psi_lo + psi_hi) * (psi_lo + psi_hi)
    expect(superpositionDensity(psi_lo, psi_hi, 1)).toBeCloseTo(expected, 12)
  })

  it('reduces to ½(ψ_lo² + ψ_hi²) when cos(ωt) = 0', () => {
    const psi_lo = 0.7
    const psi_hi = 0.4
    const expected = 0.5 * (psi_lo * psi_lo + psi_hi * psi_hi)
    expect(superpositionDensity(psi_lo, psi_hi, 0)).toBeCloseTo(expected, 12)
  })

  it('reduces to ½(ψ_lo − ψ_hi)² when cos(ωt) = −1', () => {
    const psi_lo = 0.7
    const psi_hi = 0.4
    const expected = 0.5 * (psi_lo - psi_hi) * (psi_lo - psi_hi)
    expect(superpositionDensity(psi_lo, psi_hi, -1)).toBeCloseTo(expected, 12)
  })

  it('handles negative ψ samples without sign confusion', () => {
    // psi_lo positive, psi_hi negative — cross-term should be negative at
    // cos = 1, i.e. density drops below the static average there.
    const at_peak = superpositionDensity(0.7, -0.4, 1)
    const at_zero = superpositionDensity(0.7, -0.4, 0)
    expect(at_peak).toBeLessThan(at_zero)
  })
})

describe('transitionAngularFrequency_rad_per_s — Hα reference', () => {
  it('returns ~2.87 × 10¹⁵ rad/s for the bare-hydrogen 3p → 2s Hα transition', () => {
    // E(n=3) = −13.6/9 = −1.51111… eV; E(n=2) = −13.6/4 = −3.4 eV (Bohr).
    // ω = (−1.51 − (−3.4)) eV · e / ℏ ≈ 2.87 × 10¹⁵ rad/s
    const omega = transitionAngularFrequency_rad_per_s(-1.51, -3.4)
    expect(omega).toBeGreaterThan(0)
    expect(Math.abs(omega - 2.87e15)).toBeLessThan(1e13)
  })

  it('is anti-symmetric in (upper, lower)', () => {
    const fwd = transitionAngularFrequency_rad_per_s(-1.51, -3.4)
    const rev = transitionAngularFrequency_rad_per_s(-3.4, -1.51)
    expect(fwd).toBeCloseTo(-rev, 12)
  })
})

describe('dipoleExpectation — phase behavior', () => {
  it('returns the zero vector at cos(ωt) = 0 regardless of D', () => {
    const D = { x: 1.23, y: -4.56, z: 7.89 }
    const e = dipoleExpectation(D, 0)
    expect(e.x).toBeCloseTo(0, 15)
    expect(e.y).toBeCloseTo(0, 15)
    expect(e.z).toBeCloseTo(0, 15)
  })

  it('returns D at cos(ωt) = 1', () => {
    const D = { x: 1.23, y: -4.56, z: 7.89 }
    const e = dipoleExpectation(D, 1)
    expect(e.x).toBeCloseTo(D.x, 12)
    expect(e.y).toBeCloseTo(D.y, 12)
    expect(e.z).toBeCloseTo(D.z, 12)
  })

  it('returns −D at cos(ωt) = −1', () => {
    const D = { x: 1.23, y: -4.56, z: 7.89 }
    const e = dipoleExpectation(D, -1)
    expect(e.x).toBeCloseTo(-D.x, 12)
    expect(e.y).toBeCloseTo(-D.y, 12)
    expect(e.z).toBeCloseTo(-D.z, 12)
  })
})

describe('dipoleMatrixElement_au — re-export smoke check', () => {
  it('returns a DipoleResult object for the 3p(m=0) → 2s axial transition', () => {
    const D = dipoleMatrixElement_au({ n: 3, l: 1, m: 0 }, { n: 2, l: 0, m: 0 })
    expect(D).not.toBeNull()
    if (D === null) return
    expect(D.magnitude).toBeGreaterThan(0)
  })

  it('returns null for n > 7 (unsupported by the radial module)', () => {
    const D = dipoleMatrixElement_au({ n: 8, l: 0, m: 0 }, { n: 2, l: 0, m: 0 })
    expect(D).toBeNull()
  })
})
