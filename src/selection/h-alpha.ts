import { elements } from '../data'
import type { LineSelection, Selection, TermState } from '../types'

const hydrogen2s: TermState = {
  n: 2,
  l: 0,
  s: 0.5,
  j: 0.5,
  m: 0,
  electronConfig: '2s¹',
  termSymbol: '²S₁/₂',
  energy_eV: -3.4,
}

const hydrogen3p: TermState = {
  n: 3,
  l: 1,
  s: 0.5,
  j: 1.5,
  m: 0,
  electronConfig: '3p¹',
  termSymbol: '²P₃/₂',
  energy_eV: -1.51,
}

/** Canonical Hα (Balmer, 3→2) line record from the element registry. */
export function hydrogenAlphaLine(): LineSelection {
  const line = elements.H.lines.find((l) => l.label === 'Hα')
  if (!line) throw new Error('linelight: Hα line missing from hydrogen registry')
  return {
    id: `H/${line.wavelength_nm}`,
    element: 'H',
    wavelength_nm: line.wavelength_nm,
    label: line.label,
    transition: line.transition,
  }
}

/** Default lab selection: Hα with synced 3p upper / 2s lower term states. */
export function hydrogenAlphaSelection(): Pick<Selection, 'element' | 'upper' | 'lower' | 'line'> {
  return {
    element: 'H',
    upper: hydrogen3p,
    lower: hydrogen2s,
    line: hydrogenAlphaLine(),
  }
}
