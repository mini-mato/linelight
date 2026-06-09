/**
 * Grotrian — pure physics helpers.
 *
 * Hydrogen energy levels follow the closed-form Bohr/Rydberg expression:
 *   E_n = -R_H / n²,  with R_H ≈ 13.605693 eV (we use 13.6 eV to match the
 *   reference renderer in `emission-spectra.html`).
 *
 * Energy-unit conversions are derived from the canonical relations
 *   1 eV = 8065.544 cm⁻¹ = 2.4180 × 10¹⁴ Hz
 *   λ(nm) = 1239.842 / |E(eV)|     (photon-energy → wavelength)
 *
 * Constants are deliberately specified at the precision quoted in the spec.
 * They are not refit; do not "improve" them without updating the spec and the
 * tests that pin them.
 */

import type { EnergyUnit } from '../../types'

/** Rydberg energy used by the hydrogen Grotrian (eV). */
export const RYDBERG_EV = 13.6

/** 1 eV in cm⁻¹. */
export const EV_TO_CM1 = 8065.544
/** 1 eV in Hz. */
export const EV_TO_HZ = 2.418e14
/** Photon-energy → wavelength conversion constant (eV·nm). */
export const HC_EV_NM = 1239.842

/** Hydrogen level energy E_n = -13.6 / n² (eV). */
export function hydrogenLevelEnergy_eV(n: number): number {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`hydrogenLevelEnergy_eV: n must be a positive integer, got ${n}`)
  }
  return -RYDBERG_EV / (n * n)
}

/** Convert eV → cm⁻¹. Sign-preserving. */
export function eVToCm1(eV: number): number {
  return eV * EV_TO_CM1
}

/** Convert eV → Hz. Sign-preserving. */
export function eVToHz(eV: number): number {
  return eV * EV_TO_HZ
}

/**
 * Convert eV → wavelength (nm).
 *
 * For level diagrams the energies are negative; we map by |E| because
 * "wavelength of an energy level" is loosely the wavelength of the photon
 * that would ionize from that level. Returns Infinity for E = 0.
 */
export function eVToNm(eV: number): number {
  if (eV === 0) return Infinity
  return HC_EV_NM / Math.abs(eV)
}

/** Format an energy value in the requested unit, with sensible precision. */
export function formatEnergy(eV: number, unit: EnergyUnit): string {
  switch (unit) {
    case 'eV':
      return `${eV.toFixed(2)} eV`
    case 'cm-1': {
      const v = eVToCm1(eV)
      return `${v.toFixed(0)} cm⁻¹`
    }
    case 'Hz': {
      const v = eVToHz(eV)
      return `${v.toExponential(3)} Hz`
    }
    case 'nm': {
      if (eV === 0) return '∞ nm'
      const v = eVToNm(eV)
      return `${v.toFixed(1)} nm`
    }
  }
}

/** Map y-coordinate from energy (eV) into pixel space. Pure. */
export function energyToY(
  E_eV: number,
  Emin_eV: number,
  Emax_eV: number,
  innerH: number,
  padTop: number,
): number {
  return padTop + ((Emax_eV - E_eV) / (Emax_eV - Emin_eV)) * innerH
}
