import type { Region } from './types'

export const regions: readonly Region[] = [
  { name: 'γ-ray', min_nm: 1e-3, max_nm: 1e-2 },
  { name: 'x-ray', min_nm: 1e-2, max_nm: 1e1 },
  { name: 'UV', min_nm: 1e1, max_nm: 380 },
  { name: 'visible', min_nm: 380, max_nm: 750, visible: true },
  { name: 'IR', min_nm: 750, max_nm: 1e6 },
  { name: 'microwave', min_nm: 1e6, max_nm: 1e8 },
  { name: 'radio', min_nm: 1e8, max_nm: 1e9 },
]

/** Find the region containing a given wavelength (nm). */
export function regionFor(wavelength_nm: number): Region {
  for (const r of regions) {
    if (wavelength_nm >= r.min_nm && wavelength_nm < r.max_nm) return r
  }
  if (wavelength_nm < regions[0].min_nm) return regions[0]
  return regions[regions.length - 1]
}
