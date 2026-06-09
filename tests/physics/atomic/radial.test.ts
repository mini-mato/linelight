/**
 * Hydrogenic radial-function tests.
 *
 * Pinned reference values:
 *   R_10(0, Z=1)  = 2
 *   R_20(0, Z=1)  = 1/√2
 *   R_21(0, Z=1)  = 0     (l > 0 → R(0) = 0)
 *   R_30(0, Z=1)  = 2/(3√3) ≈ 0.3849
 *   R_40(0, Z=1)  = 1/4
 *
 * Radial-node count = n − l − 1, verified by zero-crossing scan along r.
 *
 * Normalization ∫₀^∞ |R_nl|² r² dr = 1 verified numerically (trapezoid)
 * to within 1 % for representative low-n cases and all n=5..7 cases.
 */

import { describe, expect, it } from 'vitest'
import { radialR } from '../../../src/physics/atomic/radial'

/** Crude trapezoidal ∫₀^L |R(r)|² r² dr. */
function radialNorm(n: number, l: number, Z: number, L: number, steps: number): number {
  const h = L / steps
  let sum = 0
  for (let i = 0; i <= steps; i++) {
    const r = i * h
    const v = radialR(n, l, Z, r)
    const w = i === 0 || i === steps ? 0.5 : 1.0
    sum += w * v * v * r * r * h
  }
  return sum
}

/** Trapezoidal normalization in ρ = 2Zr/n, which keeps high-n tails compact. */
function radialNormRho(n: number, l: number, Z: number, rhoMax: number, steps: number): number {
  const h = rhoMax / steps
  const drdRho = n / (2 * Z)
  let sum = 0
  for (let i = 0; i <= steps; i++) {
    const rho = i * h
    const r = rho * drdRho
    const v = radialR(n, l, Z, r)
    const w = i === 0 || i === steps ? 0.5 : 1.0
    sum += w * v * v * r * r * drdRho * h
  }
  return sum
}

/** Count zero crossings of R(r) on a fine grid in (0, L]. Tracks the last
 * non-zero sample's sign so that a grid point landing exactly on the node
 * is not misread as "no crossing." */
function countRadialNodes(n: number, l: number, Z: number, L: number, steps: number): number {
  let lastNonZeroSign = 0
  let count = 0
  for (let i = 1; i <= steps; i++) {
    const r = (i / steps) * L
    const v = radialR(n, l, Z, r)
    if (v === 0) continue
    const sign = v > 0 ? 1 : -1
    if (lastNonZeroSign !== 0 && sign !== lastNonZeroSign) count++
    lastNonZeroSign = sign
  }
  return count
}

function countRadialNodesRho(
  n: number,
  l: number,
  Z: number,
  rhoMax: number,
  steps: number,
): number {
  const drdRho = n / (2 * Z)
  let lastNonZeroSign = 0
  let count = 0
  for (let i = 1; i <= steps; i++) {
    const rho = (i / steps) * rhoMax
    const v = radialR(n, l, Z, rho * drdRho)
    if (v === 0) continue
    const sign = v > 0 ? 1 : -1
    if (lastNonZeroSign !== 0 && sign !== lastNonZeroSign) count++
    lastNonZeroSign = sign
  }
  return count
}

describe('radialR — pinned reference values at the origin', () => {
  it('R_10(0, Z=1) = 2', () => {
    expect(radialR(1, 0, 1, 0)).toBeCloseTo(2, 12)
  })

  it('R_20(0, Z=1) = 1/√2', () => {
    expect(radialR(2, 0, 1, 0)).toBeCloseTo(1 / Math.SQRT2, 12)
  })

  it('R_21(0, Z=1) = 0 (radial node at origin for l > 0)', () => {
    expect(radialR(2, 1, 1, 0)).toBe(0)
  })

  it('R_30(0, Z=1) = 2/(3√3)', () => {
    expect(radialR(3, 0, 1, 0)).toBeCloseTo(2 / (3 * Math.sqrt(3)), 12)
  })

  it('R_40(0, Z=1) = 1/4', () => {
    expect(radialR(4, 0, 1, 0)).toBeCloseTo(0.25, 12)
  })

  it('R_n,l>0(0) is identically zero across the supported set', () => {
    for (const n of [2, 3, 4]) {
      for (let l = 1; l < n; l++) {
        expect(radialR(n, l, 1, 0)).toBe(0)
      }
    }
  })
})

describe('radialR — node counts equal n − l − 1', () => {
  it('1s has zero radial nodes', () => {
    expect(countRadialNodes(1, 0, 1, 30, 6000)).toBe(0)
  })

  it('2s has one radial node, near r = 2/Z', () => {
    expect(countRadialNodes(2, 0, 1, 40, 8000)).toBe(1)
  })

  it('2p has zero radial nodes', () => {
    expect(countRadialNodes(2, 1, 1, 40, 8000)).toBe(0)
  })

  it('3s has two radial nodes', () => {
    expect(countRadialNodes(3, 0, 1, 60, 12000)).toBe(2)
  })

  it('3p has one radial node', () => {
    expect(countRadialNodes(3, 1, 1, 60, 12000)).toBe(1)
  })

  it('3d has zero radial nodes', () => {
    expect(countRadialNodes(3, 2, 1, 60, 12000)).toBe(0)
  })

  it('4s has three radial nodes', () => {
    expect(countRadialNodes(4, 0, 1, 80, 16000)).toBe(3)
  })

  it('4f has zero radial nodes', () => {
    expect(countRadialNodes(4, 3, 1, 80, 16000)).toBe(0)
  })

  for (const n of [5, 6, 7]) {
    for (let l = 0; l < n; l++) {
      it(`n=${n}, l=${l} has ${n - l - 1} radial nodes`, () => {
        expect(countRadialNodesRho(n, l, 1, 90, 30000)).toBe(n - l - 1)
      })
    }
  }
})

describe('radialR — normalization ∫|R|² r² dr ≈ 1', () => {
  it('1s normalizes to 1 within 1 %', () => {
    expect(radialNorm(1, 0, 1, 30, 6000)).toBeCloseTo(1, 2)
  })

  it('2p normalizes to 1 within 1 %', () => {
    expect(radialNorm(2, 1, 1, 40, 8000)).toBeCloseTo(1, 2)
  })

  it('3d normalizes to 1 within 1 %', () => {
    expect(radialNorm(3, 2, 1, 60, 12000)).toBeCloseTo(1, 2)
  })

  it('4f normalizes to 1 within 1 %', () => {
    expect(radialNorm(4, 3, 1, 100, 20000)).toBeCloseTo(1, 2)
  })

  for (const n of [5, 6, 7]) {
    for (let l = 0; l < n; l++) {
      it(`n=${n}, l=${l} normalizes to 1 within 1 %`, () => {
        expect(radialNormRho(n, l, 1, 90, 45000)).toBeCloseTo(1, 2)
      })
    }
  }
})

describe('radialR — Z scaling', () => {
  it('R_10 for Z=2 at r=1/Z matches R_10 for Z=1 at r=1, scaled by Z^(3/2)', () => {
    // R_nl(r, Z) = Z^(3/2) · R_nl(Zr, 1)
    const lhs = radialR(1, 0, 2, 0.5)
    const rhs = Math.pow(2, 1.5) * radialR(1, 0, 1, 1)
    expect(lhs).toBeCloseTo(rhs, 12)
  })
})
