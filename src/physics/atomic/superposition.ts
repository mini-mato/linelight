/**
 * Coherent two-level superposition utilities.
 *
 * Builds the time-evolved 50/50 superposition of two hydrogenic states
 *
 *     Ψ(r, t) = (1/√2) ψ_lower(r) + (1/√2) ψ_upper(r) · exp(−i ω₂₁ t)
 *
 * The probability density |Ψ(r, t)|² has a static term (½|ψ_lo|² + ½|ψ_hi|²)
 * plus a cross-term ψ_lo · ψ_hi · cos(ω₂₁ t) that breathes at the optical
 * frequency. The cross-term carries the radiated dipole — its time average
 * is zero (no net polarization in a stationary eigenstate) while the
 * expectation value of r oscillates as ⟨r(t)⟩ = D · cos(ω₂₁ t) where
 * D = ⟨ψ_lo | r | ψ_hi⟩.
 *
 * Atomic units: r in Bohr radii, ψ as returned by `psiCartesian` (real,
 * normalized over a₀³). Angular frequency returned in rad/s, SI.
 *
 * The dipole integrator is delegated to `einstein.ts` when available; that
 * module also exposes `einsteinA` and shares a per-session cache.
 */

import { dipoleMatrixElement_au, type DipoleResult, type OrbitalIds } from './einstein'

/** Reduced Planck constant, J·s (CODATA 2022). */
const HBAR_J_S = 1.0545718176461565e-34
/** Elementary charge, C (SI-2019 exact). */
const E_C = 1.602176634e-19

/**
 * Instantaneous probability density at a single point.
 *
 *     |Ψ(r, t)|² = ½ ψ_lo² + ½ ψ_hi² + ψ_lo · ψ_hi · cos(ω t)
 *
 * `cosOmegaT` is passed in (not computed here) so the caller hoists
 * `Math.cos(ω t)` out of the per-voxel inner loop.
 *
 * The result CAN be negative when |cosOmegaT| > the average of squares /
 * the cross-term — that's a real signed density-change at this voxel
 * relative to the static baseline. Spatial integral of |Ψ|² remains 1.
 */
export function superpositionDensity(psi_lo: number, psi_hi: number, cosOmegaT: number): number {
  return 0.5 * psi_lo * psi_lo + 0.5 * psi_hi * psi_hi + psi_lo * psi_hi * cosOmegaT
}

export type { DipoleResult, OrbitalIds }

/**
 * Cartesian dipole matrix element ⟨ψ_lo | r | ψ_hi⟩ in atomic units (a₀).
 *
 * Delegates to `einstein.ts` which integrates on a 48³ midpoint-rule grid
 * with half-extent 1.2 × max(recommendedBoxHalfExtent_Bohr(...)). Returns
 * null for n > 7. Cached by quantum numbers.
 */
export function dipoleMatrixElement_au_for_superposition(
  upper: OrbitalIds,
  lower: OrbitalIds,
): DipoleResult | null {
  return dipoleMatrixElement_au(upper, lower)
}

// Re-export for callers that want the canonical name (matches the brief).
export { dipoleMatrixElement_au }

/**
 * Instantaneous expectation value ⟨d(t)⟩ / e in Bohr radii.
 *
 *     ⟨r(t)⟩ = D · cos(ω t)
 *
 * Multiply by `E_C` if you want a real electric-dipole moment (C·m); the
 * renderer just wants a direction + a length, so we hand back the bare
 * three-vector.
 */
export function dipoleExpectation(
  D: { x: number; y: number; z: number },
  cosOmegaT: number,
): { x: number; y: number; z: number } {
  return {
    x: D.x * cosOmegaT,
    y: D.y * cosOmegaT,
    z: D.z * cosOmegaT,
  }
}

/**
 * Optical angular frequency of the transition.
 *
 *     ω₂₁ = (E_upper − E_lower) · e / ℏ
 *
 * Inputs in eV, output in rad/s. Sign follows (upper − lower) so emission
 * lines have positive ω₂₁ (the convention used everywhere else in this
 * codebase — see `kb/linelight/wiki/concepts/optical-frequency.md`).
 */
export function transitionAngularFrequency_rad_per_s(
  E_upper_eV: number,
  E_lower_eV: number,
): number {
  return ((E_upper_eV - E_lower_eV) * E_C) / HBAR_J_S
}

/** Elementary charge (C) — exported for callers that need real dipole moments. */
export const ELEMENTARY_CHARGE_C = E_C

/** Reduced Planck constant (J·s) — exported for symmetry with `E_C`. */
export const REDUCED_PLANCK_J_S = HBAR_J_S
