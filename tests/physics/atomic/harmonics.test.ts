/**
 * Real (tesseral) spherical harmonic tests.
 *
 * Orthonormality: ∫ Y_lm Y_l'm' sin(θ) dθ dφ = δ_{ll'} δ_{mm'}.
 * Verified by uniform-on-sphere Monte-Carlo integration. Tolerance ~5 %
 * (ratified ceiling at the call site of the spec).
 */

import { describe, expect, it } from 'vitest'
import { realY } from '../../../src/physics/atomic/harmonics'

const PI = Math.PI

/** Deterministic LCG so the tests are reproducible. */
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

/**
 * Monte-Carlo estimate of ∫ f(θ, φ) sin(θ) dθ dφ over the unit sphere
 * (i.e. surface integral with the standard area element).
 *
 * Sample (cosθ, φ) uniformly to get uniform-on-sphere samples; the
 * sin(θ) Jacobian is then absorbed into the sample density, so the
 * estimator is just (4π) · mean(f).
 */
function sphereIntegral(
  f: (theta: number, phi: number) => number,
  samples: number,
  seed: number,
): number {
  const rng = makeRng(seed)
  let sum = 0
  for (let i = 0; i < samples; i++) {
    const u = rng()
    const v = rng()
    const cosTheta = 2 * u - 1
    const theta = Math.acos(cosTheta)
    const phi = 2 * PI * v
    sum += f(theta, phi)
  }
  return (4 * PI * sum) / samples
}

function gaussLegendre(order: number): { nodes: number[]; weights: number[] } {
  const nodes = Array<number>(order)
  const weights = Array<number>(order)
  const half = Math.ceil(order / 2)

  for (let i = 0; i < half; i++) {
    let z = Math.cos((PI * (i + 0.75)) / (order + 0.5))
    let derivative = 0

    for (;;) {
      let p1 = 1
      let p2 = 0
      for (let j = 1; j <= order; j++) {
        const p3 = p2
        p2 = p1
        p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j
      }
      derivative = (order * (z * p1 - p2)) / (z * z - 1)
      const next = z - p1 / derivative
      if (Math.abs(next - z) < 1e-14) {
        z = next
        break
      }
      z = next
    }

    const weight = 2 / ((1 - z * z) * derivative * derivative)
    nodes[i] = -z
    nodes[order - 1 - i] = z
    weights[i] = weight
    weights[order - 1 - i] = weight
  }

  return { nodes, weights }
}

const QUADRATURE = gaussLegendre(72)

function sphereIntegralQuadrature(f: (theta: number, phi: number) => number): number {
  const phiSteps = 168
  const dphi = (2 * PI) / phiSteps
  let sum = 0

  for (let i = 0; i < QUADRATURE.nodes.length; i++) {
    const x = QUADRATURE.nodes[i]
    const theta = Math.acos(Math.max(-1, Math.min(1, x)))
    const weight = QUADRATURE.weights[i]

    for (let j = 0; j < phiSteps; j++) {
      const phi = (j + 0.5) * dphi
      sum += weight * f(theta, phi) * dphi
    }
  }

  return sum
}

describe('realY — closed-form values at canonical angles', () => {
  it('Y_0,0 is the constant 1/(2√π) everywhere on the sphere', () => {
    const expected = 0.5 / Math.sqrt(PI)
    expect(realY(0, 0, 0.3, 1.7)).toBeCloseTo(expected, 12)
  })

  it('Y_1,0 vanishes at the equator (θ = π/2)', () => {
    expect(realY(1, 0, PI / 2, 0)).toBeCloseTo(0, 12)
  })

  it('Y_1,0 reaches its maximum at the north pole (θ = 0)', () => {
    const expected = Math.sqrt(3 / (4 * PI))
    expect(realY(1, 0, 0, 0)).toBeCloseTo(expected, 12)
  })

  it('Y_2,0 vanishes at the magic angle θ = arccos(1/√3)', () => {
    const magic = Math.acos(1 / Math.sqrt(3))
    expect(realY(2, 0, magic, 0)).toBeCloseTo(0, 10)
  })

  it('Y_3,0 has three angular nodes between θ=0 and θ=π', () => {
    let crossings = 0
    let prev = realY(3, 0, 1e-3, 0)
    const N = 4000
    for (let i = 1; i <= N; i++) {
      const t = (i / N) * (PI - 2e-3) + 1e-3
      const v = realY(3, 0, t, 0)
      if (prev * v < 0) crossings++
      prev = v
    }
    expect(crossings).toBe(3)
  })
})

describe('realY — orthonormality (Monte-Carlo)', () => {
  // Single sample set, large enough for ±5% accuracy on these integrals.
  const N = 200_000

  it('Y_1,0 is normalized to within 5%', () => {
    const I = sphereIntegral((t, p) => realY(1, 0, t, p) ** 2, N, 1)
    expect(I).toBeGreaterThan(0.95)
    expect(I).toBeLessThan(1.05)
  })

  it('Y_2,1 is normalized to within 5%', () => {
    const I = sphereIntegral((t, p) => realY(2, 1, t, p) ** 2, N, 2)
    expect(I).toBeGreaterThan(0.95)
    expect(I).toBeLessThan(1.05)
  })

  it('Y_3,-2 is normalized to within 5%', () => {
    const I = sphereIntegral((t, p) => realY(3, -2, t, p) ** 2, N, 3)
    expect(I).toBeGreaterThan(0.95)
    expect(I).toBeLessThan(1.05)
  })

  it('Y_1,0 and Y_2,0 are orthogonal (cross-integral ≈ 0)', () => {
    const I = sphereIntegral((t, p) => realY(1, 0, t, p) * realY(2, 0, t, p), N, 4)
    expect(Math.abs(I)).toBeLessThan(0.05)
  })

  it('Y_2,1 and Y_2,-1 are orthogonal', () => {
    const I = sphereIntegral((t, p) => realY(2, 1, t, p) * realY(2, -1, t, p), N, 5)
    expect(Math.abs(I)).toBeLessThan(0.05)
  })

  it('Y_3,3 and Y_3,-3 are orthogonal', () => {
    const I = sphereIntegral((t, p) => realY(3, 3, t, p) * realY(3, -3, t, p), N, 6)
    expect(Math.abs(I)).toBeLessThan(0.05)
  })
})

describe('realY — l=4..6 orthonormality (quadrature)', () => {
  for (const l of [4, 5, 6]) {
    for (let m = -l; m <= l; m++) {
      it(`Y_${l},${m} is normalized`, () => {
        const I = sphereIntegralQuadrature((t, p) => realY(l, m, t, p) ** 2)
        expect(I).toBeCloseTo(1, 8)
      })
    }
  }

  const orthogonalPairs: Array<[number, number, number, number]> = [
    [4, 0, 4, 3],
    [5, -2, 5, 4],
    [6, -6, 6, 6],
    [4, 2, 6, 2],
    [5, 0, 6, 0],
  ]

  for (const [l1, m1, l2, m2] of orthogonalPairs) {
    it(`Y_${l1},${m1} and Y_${l2},${m2} are orthogonal`, () => {
      const I = sphereIntegralQuadrature((t, p) => realY(l1, m1, t, p) * realY(l2, m2, t, p))
      expect(Math.abs(I)).toBeLessThan(1e-8)
    })
  }
})

describe('realY — out-of-range m returns 0', () => {
  it('returns 0 when |m| > l', () => {
    expect(realY(1, 2, 0.5, 0.5)).toBe(0)
    expect(realY(0, 1, 0.5, 0.5)).toBe(0)
  })
})
