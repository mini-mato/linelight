/**
 * Einstein A coefficient — unit tests.
 *
 * Reference: NIST ASD (accessed 2026-05).
 *   A(2p→1s, Ly-α) = 6.265 × 10⁸ s⁻¹
 *   A(3p→2s, Hα channel) = 2.245 × 10⁷ s⁻¹
 *
 * Grid: 48³ midpoint rule. Tests use ±15 % bounds to accommodate quadrature.
 */

import { describe, expect, it } from 'vitest'
import {
  dipoleMatrixElement_au,
  einsteinA,
  naturalLinewidth_rad_per_s,
  lifetime_s,
} from '../../src/physics/atomic/einstein'

const C = 299792458

describe('dipoleMatrixElement_au — parity cancellation', () => {
  it('gives magnitude ≈ 0 for 1s→2s (both s-orbitals, Δl=0)', () => {
    const result = dipoleMatrixElement_au({ n: 1, l: 0 }, { n: 2, l: 0 })
    expect(result).not.toBeNull()
    expect(result!.magnitude).toBeLessThan(1e-10)
  })
})

describe('dipoleMatrixElement_au — non-zero channel', () => {
  it('gives magnitude > 0.5 a₀ for 3p(m=0)→2s', () => {
    const result = dipoleMatrixElement_au({ n: 3, l: 1, m: 0 }, { n: 2, l: 0, m: 0 })
    expect(result).not.toBeNull()
    expect(result!.magnitude).toBeGreaterThan(0.5)
  })

  it('gives x and y components ≈ 0 for 3p(m=0)→2s (only z is non-zero by symmetry)', () => {
    const result = dipoleMatrixElement_au({ n: 3, l: 1, m: 0 }, { n: 2, l: 0, m: 0 })
    expect(result).not.toBeNull()
    expect(Math.abs(result!.x)).toBeLessThan(1e-10)
    expect(Math.abs(result!.y)).toBeLessThan(1e-10)
  })

  it('gives magnitude > 0.5 a₀ for 2p→1s (Lyman-α)', () => {
    const result = dipoleMatrixElement_au({ n: 2, l: 1 }, { n: 1, l: 0 })
    expect(result).not.toBeNull()
    expect(result!.magnitude).toBeGreaterThan(0.5)
  })
})

describe('dipoleMatrixElement_au — null guards', () => {
  it('returns null for n > 7', () => {
    const result = dipoleMatrixElement_au({ n: 8, l: 1 }, { n: 2, l: 0 })
    expect(result).toBeNull()
  })
})

describe('einsteinA — selection rules', () => {
  it('returns 0 for 1s→2s (Δl=0, E1 forbidden)', () => {
    const omega = (2 * Math.PI * C) / 121.567e-9
    const A = einsteinA({ n: 1, l: 0 }, { n: 2, l: 0 }, omega)
    expect(A).toBe(0)
  })

  it('returns null for n > 7', () => {
    const A = einsteinA({ n: 8, l: 1 }, { n: 2, l: 0 }, 3e15)
    expect(A).toBeNull()
  })
})

describe('einsteinA — Hα channel vs NIST', () => {
  it('is within ±15 % of NIST A(3p→2s) = 2.245 × 10⁷ s⁻¹', () => {
    const omegaHalpha = (2 * Math.PI * C) / 656.281e-9
    const A = einsteinA({ n: 3, l: 1, m: 0 }, { n: 2, l: 0, m: 0 }, omegaHalpha)
    expect(A).not.toBeNull()
    const ref = 2.245e7
    expect(A!).toBeGreaterThan(ref * 0.85)
    expect(A!).toBeLessThan(ref * 1.15)
  })
})

describe('naturalLinewidth_rad_per_s', () => {
  it('returns the same value as A', () => {
    expect(naturalLinewidth_rad_per_s(6.265e8)).toBe(6.265e8)
  })
})

describe('lifetime_s', () => {
  it('returns 1/A for positive A', () => {
    expect(lifetime_s(6.265e8)).toBeCloseTo(1 / 6.265e8, 10)
  })

  it('returns Infinity when A = 0', () => {
    expect(lifetime_s(0)).toBe(Infinity)
  })

  it('returns Infinity when A < 0', () => {
    expect(lifetime_s(-1)).toBe(Infinity)
  })
})
