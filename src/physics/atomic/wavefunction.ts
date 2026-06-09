/**
 * Hydrogenic wavefunction ψ_nlm(r, θ, φ) in real (tesseral) basis.
 *
 *     ψ_nlm(r, θ, φ) = R_nl(r, Z) · Y_lm(θ, φ)
 *
 * Atomic units: r in Bohr radii, Z is the nuclear charge (or screened Z_eff
 * for multi-electron schematic orbitals).
 *
 * Returns a real, signed amplitude — the sign carries phase, used by the
 * 2D xz-slice signed-thermal colormap (red = +ψ, blue = −ψ). |ψ|² is the
 * probability density.
 */

import { realY } from './harmonics'
import { radialR } from './radial'

const EPS = 1e-12

/** ψ_nlm in spherical coordinates. */
export function psi(
  n: number,
  l: number,
  m: number,
  Z: number,
  r: number,
  theta: number,
  phi: number,
): number {
  return radialR(n, l, Z, r) * realY(l, m, theta, phi)
}

/** ψ_nlm at Cartesian (x, y, z) in Bohr radii. */
export function psiCartesian(
  n: number,
  l: number,
  m: number,
  Z: number,
  x: number,
  y: number,
  z: number,
): number {
  const r = Math.sqrt(x * x + y * y + z * z)
  if (r < EPS) {
    // Origin: only (n, l=0, m=0) has nonzero amplitude. Y_00 is φ-independent
    // and θ-independent, so we can pass θ=0, φ=0 safely.
    return radialR(n, l, Z, 0) * realY(l, m, 0, 0)
  }
  const theta = Math.acos(Math.min(1, Math.max(-1, z / r)))
  const phi = Math.atan2(y, x)
  return radialR(n, l, Z, r) * realY(l, m, theta, phi)
}
