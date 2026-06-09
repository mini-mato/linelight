import type { Element } from '../types'

const SOURCE = 'NIST-ASD' as const
const RETRIEVED_AT = '2026-05-02'

export const mercury: Element = {
  symbol: 'Hg',
  name: 'mercury',
  z: 80,
  groundConfig: '[Xe] 4f¹⁴ 5d¹⁰ 6s²',
  group: 'atomic',
  narrative:
    "two 6s valence electrons · transitions hop between 6s and 6p configurations · heavy atom, so relativistic effects are strong (one reason mercury is liquid). the 253.65 nm UV line is the 6³P₁→6¹S₀ transition — used in germicidal lamps because it's energetic enough to break DNA. the visible blue/green/yellow trio (405, 436, 546 nm) is what you saw in fluorescent tubes before phosphor coatings.",
  lines: [
    {
      element: 'Hg',
      wavelength_nm: 184.95,
      label: 'Hg 185',
      transition: '6¹P₁ → 6¹S₀',
      series: 'singlet',
      note: 'UV · ozone-producing',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
    {
      element: 'Hg',
      wavelength_nm: 253.65,
      label: 'Hg 253.7',
      transition: '6³P₁ → 6¹S₀',
      series: 'intercombination',
      note: 'germicidal UV-C',
      culturalContext:
        'the germicidal UV-C line · what kills pathogens in mercury-vapor sterilizers · spin-forbidden but enabled by spin-orbit mixing',
      transitionType: 'forbidden',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
    {
      element: 'Hg',
      wavelength_nm: 365.02,
      label: 'Hg 365.0',
      transition: '6³D → 6³P',
      series: 'triplet',
      note: 'blacklight',
      culturalContext: 'the blacklight line · what makes fluorescent posters glow',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
    {
      element: 'Hg',
      wavelength_nm: 404.66,
      label: 'Hg 404.7',
      transition: '7³S → 6³P',
      series: 'triplet',
      note: 'violet',
      culturalContext:
        'the visible signature of fluorescent tubes · before phosphor coatings shifted them toward white',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
    {
      element: 'Hg',
      wavelength_nm: 435.83,
      label: 'Hg 435.8',
      transition: '7³S → 6³P',
      series: 'triplet',
      note: 'blue',
      culturalContext:
        'the visible signature of fluorescent tubes · before phosphor coatings shifted them toward white',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
    {
      element: 'Hg',
      wavelength_nm: 546.07,
      label: 'Hg 546.1',
      transition: '7³S → 6³P',
      series: 'triplet',
      note: 'green',
      culturalContext:
        'the visible signature of fluorescent tubes · before phosphor coatings shifted them toward white',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
    {
      element: 'Hg',
      wavelength_nm: 577.0,
      label: 'Hg 577.0',
      transition: '6³D → 6³P',
      series: 'triplet',
      note: 'yellow doublet',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
    {
      element: 'Hg',
      wavelength_nm: 579.07,
      label: 'Hg 579.1',
      transition: '6³D → 6³P',
      series: 'triplet',
      note: 'yellow doublet',
      source: SOURCE,
      retrievedAt: RETRIEVED_AT,
    },
  ],
}
