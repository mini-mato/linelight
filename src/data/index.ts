/**
 * Physics data — public API.
 *
 * Spectral-line data sourced from the NIST Atomic Spectra Database (ASD),
 * hand-ported into typed TypeScript modules. Regenerate via `tools/ingest_nist.py`.
 */

import { hydrogen } from './elements/H'
import { helium } from './elements/He'
import { sodium } from './elements/Na'
import { mercury } from './elements/Hg'
import { neon } from './elements/Ne'
import { surveyLines } from './survey-lines'
import { regions, regionFor } from './regions'
import { tiers, tierFor } from './tiers'
import type { Element, ElementSymbol, EmissionLine } from './types'

export type {
  Element,
  ElementSymbol,
  EmissionLine,
  Region,
  RegionName,
  Series,
  Tier,
  TierName,
} from './types'

/** Primary atomic registry — H, He, Na, Hg, Ne. */
export const elements: Readonly<Record<'H' | 'He' | 'Na' | 'Hg' | 'Ne', Element>> = {
  H: hydrogen,
  He: helium,
  Na: sodium,
  Hg: mercury,
  Ne: neon,
} as const

/** All atomic + survey lines, flat, sorted by wavelength. */
export const allLines: readonly EmissionLine[] = [
  ...hydrogen.lines,
  ...helium.lines,
  ...sodium.lines,
  ...mercury.lines,
  ...neon.lines,
  ...surveyLines,
]
  .slice()
  .sort((a, b) => a.wavelength_nm - b.wavelength_nm)

/** Lines for a given element, by symbol. */
export function linesForElement(symbol: ElementSymbol): readonly EmissionLine[] {
  if (symbol in elements) return elements[symbol as keyof typeof elements].lines
  return surveyLines.filter((l) => l.element === symbol)
}

export { hydrogen, helium, sodium, mercury, neon, surveyLines, regions, regionFor, tiers, tierFor }
