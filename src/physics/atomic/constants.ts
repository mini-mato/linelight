/**
 * Atomic-physics constants and unit-conversion helpers.
 *
 * Atomic units throughout `physics/atomic/`:
 *   - distances in Bohr radii (a₀)
 *   - energies in Hartrees (E_h) or eV where labeled
 *
 * Bohr radius:        a₀ ≈ 5.29177210903e-11 m   (CODATA 2018)
 * Hartree:            E_h ≈ 27.2113862459 eV
 * Rydberg in eV:      Ry  ≈ 13.605693122994 eV   (= E_h / 2)
 *
 * The hydrogenic energy formula
 *
 *     E_n = − Ry · Z² / n²
 *
 * is exact for a one-electron ion of nuclear charge Z (non-relativistic,
 * infinite nuclear mass).
 */

/** Bohr radius in meters. CODATA 2018. */
export const BOHR_RADIUS_M = 5.29177210903e-11

/** Hartree in electronvolts. CODATA 2018. */
export const HARTREE_EV = 27.211386245988

/** Rydberg energy in electronvolts. Equals HARTREE_EV / 2. */
export const RYDBERG_EV = 13.605693122994
