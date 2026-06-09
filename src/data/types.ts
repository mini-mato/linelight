/**
 * Physics data types — shared across elements, instruments, and tests.
 *
 * Wavelengths are stored in nanometers in vacuum (NIST primary).
 * Multiply by Edlén refractive-index correction at point-of-use to get air.
 */

export type ElementSymbol =
  | 'H'
  | 'He'
  | 'Li'
  | 'C'
  | 'O'
  | 'Na'
  | 'Mg'
  | 'Ca'
  | 'Fe'
  | 'Cu'
  | 'Hg'
  | 'Ne'
  | 'CO'
  | 'H2O'
  | 'OH'
  | 'gamma'

/** EM-spectrum band names (log-axis groupings). */
export type RegionName = 'γ-ray' | 'x-ray' | 'UV' | 'visible' | 'IR' | 'microwave' | 'radio'

/** Excitation hierarchy — coarse energy classes for filter UIs. */
export type TierName =
  | 'hyperfine'
  | 'Λ-doubling'
  | 'rotational'
  | 'fine-structure'
  | 'vibrational'
  | 'outer-IR'
  | 'outer-visible'
  | 'outer-UV'
  | 'inner-EUV'
  | 'X-ray'
  | 'annihilation'

export type Tier = {
  n: number
  name: TierName
  energy: string
  color: string
}

export type Region = {
  name: RegionName
  /** lower bound, nanometers */
  min_nm: number
  /** upper bound, nanometers */
  max_nm: number
  /** band that the eye sees; visually accented in renderers */
  visible?: boolean
}

export type EmissionLine = {
  /** Vacuum wavelength in nanometers. */
  wavelength_nm: number
  /** Short label (e.g. "Hα", "Na D₂", "Hg 253.7"). */
  label: string
  /** Term-symbol-flavored transition descriptor. */
  transition: string
  /** Series name within the parent element. */
  series: string
  /** Element symbol (back-reference for filter logic). */
  element: ElementSymbol
  /** Optional principal quantum numbers — set when the transition is n→n′. */
  upper?: number
  lower?: number
  /** Free-form note. */
  note?: string
  /** Source attribution. e.g. 'NIST-ASD' for ingested NIST values, 'closed-form' for derived (Rydberg), 'schematic' for placeholder. */
  source?: 'NIST-ASD' | 'closed-form' | 'schematic'
  /** ISO-8601 date string, when the line was last verified against its source. */
  retrievedAt?: string
  /** Why this line matters in the world. e.g. "the red glow of star-forming nebulae" for Hα. Used by Cockpit + Spectrum Bar tooltip. */
  culturalContext?: string
  /** Selection-rule classification. 'E1' = electric dipole allowed; 'M1' = magnetic dipole; 'E2' = electric quadrupole; 'forbidden' = none of the above. Optional; treated as 'E1' (allowed) when absent. */
  transitionType?: 'E1' | 'M1' | 'E2' | 'forbidden'
}

export type Series = {
  name: string
  /** Lower n for hydrogenic series. */
  final?: number
  region: string
  color: string
}

export type Element = {
  symbol: ElementSymbol
  name: string
  z: number | null
  groundConfig: string
  narrative: string
  /** Display group for filter UI ("atomic", "molecular", "fine-structure", "inner-shell", "antimatter"). */
  group: 'atomic' | 'molecular' | 'fine-structure' | 'inner-shell' | 'antimatter'
  /** Hydrogenic series catalog (only meaningful for H). */
  series?: readonly Series[]
  lines: readonly EmissionLine[]
}
