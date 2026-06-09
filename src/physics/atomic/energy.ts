/**
 * Hydrogenic energy levels.
 *
 * Closed-form non-relativistic, infinite-nuclear-mass result:
 *
 *     E_n = − Ry · Z² / n²
 *
 * where Ry = 13.605693… eV is the Rydberg energy.
 *
 * Reference values:
 *   E_1(H,  Z=1) ≈ −13.6058 eV
 *   E_2(H,  Z=1) ≈ −3.4014 eV
 *   E_1(He⁺, Z=2) ≈ −54.4228 eV
 */

import { RYDBERG_EV } from './constants'

/** Hydrogenic E_n in eV. */
export function hydrogenicEnergy_eV(n: number, Z: number): number {
  if (n < 1 || !Number.isFinite(n)) {
    throw new Error(`hydrogenicEnergy_eV: n=${n} must be a positive integer`)
  }
  if (!Number.isFinite(Z) || Z <= 0) {
    throw new Error(`hydrogenicEnergy_eV: Z=${Z} must be > 0`)
  }
  return (-RYDBERG_EV * Z * Z) / (n * n)
}
