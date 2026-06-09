import type { EmissionLine, Tier } from './types'

export const tiers: readonly Tier[] = [
  { n: 1, name: 'hyperfine', energy: '~6 μeV', color: '#264a78' },
  { n: 2, name: 'Λ-doubling', energy: '~10 μeV', color: '#3b6391' },
  { n: 3, name: 'rotational', energy: '~1 meV', color: '#4a7caa' },
  { n: 4, name: 'fine-structure', energy: '~10 meV', color: '#5e95c5' },
  { n: 5, name: 'vibrational', energy: '0.1–0.3 eV', color: '#7ab1d6' },
  { n: 6, name: 'outer-IR', energy: '~1 eV', color: '#a3a3a3' },
  { n: 7, name: 'outer-visible', energy: '1.7–3.3 eV', color: '#c97a3f' },
  { n: 8, name: 'outer-UV', energy: '3–10 eV', color: '#b54a8e' },
  { n: 9, name: 'inner-EUV', energy: '~40 eV', color: '#7a3fb8' },
  { n: 10, name: 'X-ray', energy: '6–10 keV', color: '#5c5c5c' },
  { n: 11, name: 'annihilation', energy: '511 keV', color: '#0a0a0a' },
]

/** Heuristic tier classification for an emission line. */
export function tierFor(line: EmissionLine): number {
  const lbl = line.label || ''
  const tr = line.transition || ''
  const ser = line.series || ''
  if (ser === 'hyperfine' || /F\s*=/.test(tr)) return 1
  if (/Λ-doubling/.test(tr)) return 2
  if (/^J\s*=/.test(tr)) return 3
  if (/H₂O/.test(lbl)) return 3
  if (/^\[/.test(lbl)) return 4
  if (/^v\s*=/.test(tr)) return 5
  if (ser === 'annihilation') return 11
  if (ser === 'x-ray') return 10
  if (ser === 'ionized') return 9
  if (line.wavelength_nm < 380) return 8
  if (line.wavelength_nm <= 750) return 7
  return 6
}
