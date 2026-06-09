/**
 * Hydrogen Balmer-series visible-band lines.
 *
 * Hand-coded subset for iterative development. Replaced when the NIST ASD
 * ingestion pipeline (`tools/ingest-nist.py`) lands. Wavelengths in vacuum,
 * NIST ASD as of January 2026 (Balmer series, 4-decimal precision).
 */

export type EmissionLine = {
  /** Vacuum wavelength in nanometers. */
  wavelength_nm: number
  /** Short label for UI (e.g. "Hα"). */
  label: string
  /** Term-symbol-flavored transition descriptor. */
  transition: string
  /** Series name. */
  series: string
  /** Relative intensity hint (NIST units, peak-normalized to 1). */
  relativeIntensity: number
}

export const hydrogenBalmer: readonly EmissionLine[] = [
  {
    wavelength_nm: 656.279,
    label: 'Hα',
    transition: 'n=3 → 2',
    series: 'Balmer',
    relativeIntensity: 1.0,
  },
  {
    wavelength_nm: 486.135,
    label: 'Hβ',
    transition: 'n=4 → 2',
    series: 'Balmer',
    relativeIntensity: 0.34,
  },
  {
    wavelength_nm: 434.047,
    label: 'Hγ',
    transition: 'n=5 → 2',
    series: 'Balmer',
    relativeIntensity: 0.16,
  },
  {
    wavelength_nm: 410.174,
    label: 'Hδ',
    transition: 'n=6 → 2',
    series: 'Balmer',
    relativeIntensity: 0.08,
  },
]
