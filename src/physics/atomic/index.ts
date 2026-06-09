/**
 * Atomic-physics math module.
 *
 * Closed-form hydrogenic ψ_nlm(r, θ, φ) in real (tesseral) basis, hydrogenic
 * energy levels, spectroscopic-notation helpers, and Slater's-rules screened
 * effective Z for a small curated element set.
 *
 * Multi-electron orbitals at v1 are screened-hydrogenic with Slater's rules
 * — labeled `(schematic)` in the UI per
 *   kb/linelight/wiki/decisions/2026-05-02-multi-electron-fidelity-v1.md
 *
 * Atomic units throughout: distances in Bohr radii (a₀), energies in eV.
 *
 * Coordinate convention: right-handed, +z toward camera, +y up. Atom at origin.
 */

export { psi, psiCartesian } from './wavefunction'
export { hydrogenicEnergy_eV } from './energy'
export { recommendedBoxHalfExtent_Bohr } from './box'
export {
  lFromLetter,
  letterFromL,
  parseTransition,
  type ParsedState,
  type ParsedTransition,
} from './spectroscopy'
export { effectiveZ } from './slater'
export { isE1Allowed, isAllowed, type SelectionVerdict } from './selection-rules'
export {
  getOrbital,
  getShell,
  getSubshell,
  isCatalogAngularMomentum,
  isCatalogShellNumber,
  listOrbitals,
  MAX_HYDROGENIC_CATALOG_N,
  ORBITAL_CATALOG,
  representativeE1BranchesForBareHydrogenTransition,
  shellLabelForN,
  subshellLetterForL,
  type AngularMomentum,
  type BareHydrogenE1Branch,
  type MagneticQuantumNumber,
  type OrbitalDescriptor,
  type OrbitalListFilter,
  type ShellDescriptor,
  type ShellLabel,
  type ShellNumber,
  type SubshellDescriptor,
  type SubshellLetter,
} from './orbitals'

// Lower-level building blocks, exported for tests and downstream visual code.
export { realY } from './harmonics'
export { radialR } from './radial'
export { BOHR_RADIUS_M, HARTREE_EV, RYDBERG_EV } from './constants'
