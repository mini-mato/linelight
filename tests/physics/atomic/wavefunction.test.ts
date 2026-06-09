/**
 * ψ_nlm wavefunction integration tests.
 *
 * These exercise the (R_nl × Y_lm) product, the Cartesian helper, and
 * the box-extent heuristic.
 */

import { describe, expect, it } from 'vitest'
import { psi, psiCartesian } from '../../../src/physics/atomic/wavefunction'
import { recommendedBoxHalfExtent_Bohr } from '../../../src/physics/atomic/box'

describe('psi — spherical and Cartesian agree', () => {
  it('ψ_100 at (x, y, z) = (1, 0, 0) matches the spherical call', () => {
    const c = psiCartesian(1, 0, 0, 1, 1, 0, 0)
    const s = psi(1, 0, 0, 1, 1, Math.PI / 2, 0)
    expect(c).toBeCloseTo(s, 12)
  })

  it('ψ_210 has the right sign on +z and −z (axial dipole)', () => {
    const upper = psiCartesian(2, 1, 0, 1, 0, 0, +2)
    const lower = psiCartesian(2, 1, 0, 1, 0, 0, -2)
    expect(upper).toBeGreaterThan(0)
    expect(lower).toBeLessThan(0)
    expect(Math.abs(upper)).toBeCloseTo(Math.abs(lower), 12)
  })

  it('ψ_211 (real basis, m=+1 = p_x) is positive on +x and negative on −x', () => {
    const right = psiCartesian(2, 1, 1, 1, +2, 0, 0)
    const left = psiCartesian(2, 1, 1, 1, -2, 0, 0)
    expect(right).toBeGreaterThan(0)
    expect(left).toBeLessThan(0)
  })
})

describe('psi — at the origin', () => {
  it('ψ_100(0, 0, 0) is finite and matches R_10(0) · Y_00', () => {
    const v = psiCartesian(1, 0, 0, 1, 0, 0, 0)
    expect(v).toBeCloseTo(2 * (0.5 / Math.sqrt(Math.PI)), 12)
  })

  it('ψ_nlm(0) = 0 for any l > 0', () => {
    expect(psiCartesian(2, 1, 0, 1, 0, 0, 0)).toBe(0)
    expect(psiCartesian(3, 2, -1, 1, 0, 0, 0)).toBe(0)
  })
})

describe('recommendedBoxHalfExtent_Bohr — edge density is < 1 % of peak', () => {
  // Sample on a coarse grid inside the box; compare |ψ|² on a face vs interior peak.
  function maxAbsPsiSquared(
    n: number,
    l: number,
    m: number,
    Z: number,
    half: number,
    nGrid: number,
  ): number {
    let mx = 0
    for (let i = 0; i <= nGrid; i++) {
      const x = -half + (2 * half * i) / nGrid
      for (let j = 0; j <= nGrid; j++) {
        const y = -half + (2 * half * j) / nGrid
        for (let k = 0; k <= nGrid; k++) {
          const z = -half + (2 * half * k) / nGrid
          const v = psiCartesian(n, l, m, Z, x, y, z)
          const v2 = v * v
          if (v2 > mx) mx = v2
        }
      }
    }
    return mx
  }

  function maxAbsPsiSquaredOnFaces(
    n: number,
    l: number,
    m: number,
    Z: number,
    half: number,
    nGrid: number,
  ): number {
    let mx = 0
    const eval2 = (x: number, y: number, z: number) => {
      const v = psiCartesian(n, l, m, Z, x, y, z)
      return v * v
    }
    for (let i = 0; i <= nGrid; i++) {
      const a = -half + (2 * half * i) / nGrid
      for (let j = 0; j <= nGrid; j++) {
        const b = -half + (2 * half * j) / nGrid
        // Six faces.
        for (const v of [
          eval2(+half, a, b),
          eval2(-half, a, b),
          eval2(a, +half, b),
          eval2(a, -half, b),
          eval2(a, b, +half),
          eval2(a, b, -half),
        ]) {
          if (v > mx) mx = v
        }
      }
    }
    return mx
  }

  const cases: Array<[number, number, number, number]> = [
    [1, 0, 0, 1],
    [2, 1, 0, 1],
    [3, 2, 0, 1],
    [1, 0, 0, 2],
  ]

  for (const [n, l, m, Z] of cases) {
    it(`(n=${n}, l=${l}, Z=${Z}) box-edge |ψ|² < 1 % of peak`, () => {
      const half = recommendedBoxHalfExtent_Bohr(n, l, Z)
      const peak = maxAbsPsiSquared(n, l, m, Z, half, 28)
      const edge = maxAbsPsiSquaredOnFaces(n, l, m, Z, half, 28)
      expect(peak).toBeGreaterThan(0)
      expect(edge / peak).toBeLessThan(0.01)
    })
  }

  it('grows with n and shrinks with Z', () => {
    expect(recommendedBoxHalfExtent_Bohr(2, 0, 1)).toBeGreaterThan(
      recommendedBoxHalfExtent_Bohr(1, 0, 1),
    )
    expect(recommendedBoxHalfExtent_Bohr(1, 0, 2)).toBeLessThan(
      recommendedBoxHalfExtent_Bohr(1, 0, 1),
    )
  })
})
