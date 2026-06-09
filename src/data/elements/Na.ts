import type { Element } from '../types'

const SOURCE = 'NIST-ASD' as const
const RETRIEVED_AT = '2026-05-02'

export const sodium: Element = {
  symbol: 'Na',
  name: 'sodium',
  z: 11,
  groundConfig: '[Ne] 3s¹',
  group: 'atomic',
  narrative:
    'one valence electron in 3s outside a closed neon core · the iconic yellow D doublet (D₁, D₂) is the 3p→3s transition split by spin-orbit coupling: the upper 3p level splits into ²P₃/₂ and ²P₁/₂, and the two paths down to ²S₁/₂ produce two lines 0.6 nm apart. that splitting is fine structure — the hydrogen-like answer to "why doesn\'t every transition give exactly one line."',
  lines: [
    {
      element: 'Na',
      wavelength_nm: 285.3,
      label: 'Na 285.3',
      transition: '4²P → 3²S',
      series: 'valence',
      note: 'UV resonance',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
    {
      element: 'Na',
      wavelength_nm: 330.26,
      label: 'Na 330.3',
      transition: '4²P → 3²S',
      series: 'valence',
      note: 'second UV resonance',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
    {
      element: 'Na',
      wavelength_nm: 568.27,
      label: 'Na 568.3',
      transition: '4²D → 3²P',
      series: 'valence',
      note: 'yellow-green · weaker doublet',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
    {
      element: 'Na',
      wavelength_nm: 588.995,
      label: 'D₂',
      transition: '3²P₃/₂ → 3²S₁/₂',
      series: 'fine-structure',
      note: 'doublet · upper sublevel j=3/2',
      culturalContext:
        'the doublet that yellows sodium-vapor streetlights · also the strongest absorption pair in the solar spectrum',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
    {
      element: 'Na',
      wavelength_nm: 589.592,
      label: 'D₁',
      transition: '3²P₁/₂ → 3²S₁/₂',
      series: 'fine-structure',
      note: 'doublet · upper sublevel j=1/2',
      culturalContext:
        'the doublet that yellows sodium-vapor streetlights · also the strongest absorption pair in the solar spectrum',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
    {
      element: 'Na',
      wavelength_nm: 818.33,
      label: 'Na 818.3',
      transition: '3²D → 3²P',
      series: 'valence',
      note: 'near-IR doublet',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
    {
      element: 'Na',
      wavelength_nm: 819.48,
      label: 'Na 819.5',
      transition: '3²D → 3²P',
      series: 'valence',
      note: 'near-IR doublet',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
  ],
}
