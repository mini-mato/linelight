/**
 * Volumetric ψ_nlm grid sampler.
 *
 * Builds a dense N×N×N grid of the SIGNED amplitude ψ over the bounding cube
 * [-halfExtent, +halfExtent]³ in Bohr radii, centered at the origin. Stored
 * row-major with x fastest, then y, then z, so a single linear index addresses
 * the standard `Data3DTexture` upload layout (`width × height × depth` with
 * `unpackAlignment = 1`).
 *
 * We keep ψ (signed) rather than |ψ|² so the volumetric raymarch can shade
 * positive lobes red and negative lobes blue without re-deriving the sign.
 * The iso-surface path squares per cell as it writes into `mc.field`.
 *
 * The peak is reported as `peakAbs = max |ψ|` over the grid — used by the
 * shader to normalize the gamma'd brightness curve.
 */

import { psiCartesian } from '../../../../physics/atomic'

export const GRID_RESOLUTION_3D = 96 as const

export type PsiGrid3D = {
  /** Cube grid resolution per axis (N). */
  N: number
  /** Half-extent of the bounding cube in Bohr radii. */
  halfExtent_Bohr: number
  /** Signed ψ samples, length N³, x-fastest. */
  field: Float32Array
  /** max |ψ| over the grid (always ≥ 0). */
  peakAbs: number
}

export type Quanta = {
  n: number
  l: number
  m: number
  Z: number
}

/**
 * Sample ψ_nlm on a centered N×N×N grid of half-extent `halfExtent_Bohr`.
 * Default N = 96 (the Three.js volumetric target — see research memo §6).
 */
export function buildPsiGrid3D(
  q: Quanta,
  halfExtent_Bohr: number,
  N: number = GRID_RESOLUTION_3D,
): PsiGrid3D {
  if (!Number.isInteger(N) || N < 4) {
    throw new Error(`buildPsiGrid3D: N=${N} must be an integer ≥ 4`)
  }
  if (!(halfExtent_Bohr > 0) || !Number.isFinite(halfExtent_Bohr)) {
    throw new Error(`buildPsiGrid3D: halfExtent_Bohr=${halfExtent_Bohr} must be > 0`)
  }

  const field = new Float32Array(N * N * N)
  const step = (2 * halfExtent_Bohr) / (N - 1)

  let peakAbs = 0
  let idx = 0
  for (let kz = 0; kz < N; kz++) {
    const z = -halfExtent_Bohr + kz * step
    for (let ky = 0; ky < N; ky++) {
      const y = -halfExtent_Bohr + ky * step
      for (let kx = 0; kx < N; kx++) {
        const x = -halfExtent_Bohr + kx * step
        const psiVal = psiCartesian(q.n, q.l, q.m, q.Z, x, y, z)
        field[idx++] = psiVal
        const a = Math.abs(psiVal)
        if (a > peakAbs) peakAbs = a
      }
    }
  }

  return { N, halfExtent_Bohr, field, peakAbs }
}

/**
 * Build the Float32Array of |ψ|² (squared, non-negative) from a signed grid.
 * Useful for the iso-surface path: MarchingCubes wants probability density.
 *
 * Returns a fresh Float32Array of length N³ — does not mutate input.
 */
export function squareGrid(grid: PsiGrid3D): Float32Array {
  const out = new Float32Array(grid.field.length)
  for (let i = 0; i < grid.field.length; i++) {
    const v = grid.field[i]
    out[i] = v * v
  }
  return out
}
