/**
 * Einstein A coefficient and electric-dipole matrix element for hydrogenic
 * transitions.
 *
 * Supports n ≤ 7 (same hard limit as the radial-function module). Returns
 * null for n > 7 so callers can fall back to a `(schematic)` value.
 *
 * Formula:
 *   A = ω³ · e² · a₀² · |d_au|² / (3π · ε₀ · ħ · c³)
 *
 * where d_au is integrated on a 48³ Cartesian midpoint-rule grid:
 *   d_q = ∫ ψ_lower(r) · r_q · ψ_upper(r) d³r   (q ∈ {x, y, z})
 *
 * Physical constants: CODATA 2022 / SI-2019 exact values.
 *
 * Validated against NIST ASD (accessed 2026-05):
 *   A(2p→1s, Ly-α) ≈ 6.265 × 10⁸ s⁻¹
 *   A(3p→2s, Hα channel) ≈ 2.245 × 10⁷ s⁻¹
 */

import { psiCartesian } from './wavefunction'
import { recommendedBoxHalfExtent_Bohr } from './box'

// CODATA 2022 / SI-2019 exact constants
const E_C = 1.602176634e-19
const HBAR = 1.0545718176461565e-34
const C_SI = 299792458
const A0_M = 5.29177210544e-11
const EPS0 = 8.8541878188e-12

const GRID_N = 48
const MAX_N = 7

// A_PREFACTOR = e² a₀² / (3π ε₀ ħ c³) ≈ 3.022 × 10⁻⁴⁰ s²
// A [s⁻¹] = PREFACTOR [s²] × ω³ [s⁻³] × |d_au|² [dimensionless in a₀²]
const A_PREFACTOR = (E_C * E_C * A0_M * A0_M) / (3 * Math.PI * EPS0 * HBAR * C_SI * C_SI * C_SI)

/** Quantum numbers for a hydrogenic orbital. */
export type OrbitalIds = {
  n: number
  l: number
  m?: number
}

/** Three-vector dipole matrix element in Bohr radii plus its magnitude. */
export type DipoleResult = {
  x: number
  y: number
  z: number
  magnitude: number
}

const _dipoleCache = new Map<string, DipoleResult | null>()

function cacheKey(u: OrbitalIds, l: OrbitalIds): string {
  return `${u.n},${u.l},${u.m ?? 0}|${l.n},${l.l},${l.m ?? 0}`
}

/**
 * Compute the electric-dipole matrix element ⟨lower|r|upper⟩ on a 48³
 * Cartesian midpoint-rule grid (hydrogen, Z=1).
 *
 * Returns null for n > 7 or invalid quantum numbers. Returns near-zero
 * components for E1-forbidden transitions (symmetric grid cancels odd
 * integrands). Session-cached by (n, l, m) pair.
 */
export function dipoleMatrixElement_au(upper: OrbitalIds, lower: OrbitalIds): DipoleResult | null {
  if (upper.n > MAX_N || lower.n > MAX_N) return null
  if (upper.n < 1 || lower.n < 1) return null
  if (upper.l < 0 || upper.l >= upper.n) return null
  if (lower.l < 0 || lower.l >= lower.n) return null

  const key = cacheKey(upper, lower)
  if (_dipoleCache.has(key)) return _dipoleCache.get(key) as DipoleResult | null

  const nu = upper.n
  const lu = upper.l
  const mu = upper.m ?? 0
  const nl = lower.n
  const ll = lower.l
  const ml = lower.m ?? 0

  // 1.2 × the larger recommended half-extent keeps |ψ|² at faces < 1 %.
  const L =
    1.2 *
    Math.max(recommendedBoxHalfExtent_Bohr(nu, lu, 1), recommendedBoxHalfExtent_Bohr(nl, ll, 1))
  const step = (2 * L) / GRID_N
  const dV = step * step * step

  let dx = 0
  let dy = 0
  let dz = 0

  for (let ix = 0; ix < GRID_N; ix++) {
    const x = -L + (ix + 0.5) * step
    for (let iy = 0; iy < GRID_N; iy++) {
      const y = -L + (iy + 0.5) * step
      for (let iz = 0; iz < GRID_N; iz++) {
        const z = -L + (iz + 0.5) * step
        const pu = psiCartesian(nu, lu, mu, 1, x, y, z)
        const pl = psiCartesian(nl, ll, ml, 1, x, y, z)
        const w = pl * pu * dV
        dx += w * x
        dy += w * y
        dz += w * z
      }
    }
  }

  const result: DipoleResult = {
    x: dx,
    y: dy,
    z: dz,
    magnitude: Math.sqrt(dx * dx + dy * dy + dz * dz),
  }
  _dipoleCache.set(key, result)
  return result
}

/**
 * Einstein spontaneous-emission rate A for an E1 transition (s⁻¹).
 * Returns 0 when |Δl| ≠ 1 (E1 forbidden).
 * Returns null when n > 7 or quantum numbers are invalid.
 */
export function einsteinA(
  upper: OrbitalIds,
  lower: OrbitalIds,
  omega_rad_per_s: number,
): number | null {
  if (Math.abs(upper.l - lower.l) !== 1) return 0
  const d = dipoleMatrixElement_au(upper, lower)
  if (d === null) return null
  return A_PREFACTOR * omega_rad_per_s ** 3 * d.magnitude * d.magnitude
}

/** Natural (radiative) linewidth: Γ_natural = A for a two-level system. */
export function naturalLinewidth_rad_per_s(A: number): number {
  return A
}

/** Radiative lifetime τ = 1/A. Returns Infinity when A ≤ 0. */
export function lifetime_s(A: number): number {
  return A <= 0 ? Infinity : 1 / A
}
