/**
 * Grotrian — pure layout helpers.
 *
 * No DOM access. All functions are deterministic transforms from data into
 * geometry primitives ready to render as SVG strings.
 */

import type { EmissionLine } from '../../data/types'
import { hydrogenLevelEnergy_eV, energyToY } from './physics'

/** The five hydrogenic series the Grotrian draws as columns. */
export const SERIES_NAMES = ['Lyman', 'Balmer', 'Paschen', 'Brackett', 'Pfund'] as const
export type SeriesName = (typeof SERIES_NAMES)[number]

export const SERIES_COLORS: Record<SeriesName, string> = {
  Lyman: '#7a3fb8',
  Balmer: '#b54a8e',
  Paschen: '#c97a3f',
  Brackett: '#7a8e3f',
  Pfund: '#3f8e85',
}

/** Hydrogen line with required upper/lower n. */
export type HydrogenLine = EmissionLine & { upper: number; lower: number }

/** Predicate: only keep H lines with integer upper/lower n. */
export function isHydrogenNToNLine(line: EmissionLine): line is HydrogenLine {
  return (
    line.element === 'H' &&
    typeof line.upper === 'number' &&
    typeof line.lower === 'number' &&
    Number.isInteger(line.upper) &&
    Number.isInteger(line.lower)
  )
}

/** Map a hydrogen line to its series name by lower n. Returns null if outside. */
export function seriesForHydrogenLine(line: HydrogenLine): SeriesName | null {
  switch (line.lower) {
    case 1:
      return 'Lyman'
    case 2:
      return 'Balmer'
    case 3:
      return 'Paschen'
    case 4:
      return 'Brackett'
    case 5:
      return 'Pfund'
    default:
      return null
  }
}

export type Level = {
  n: number
  E_eV: number
  y: number
}

/** Build n=1..nMax level rows positioned by energy. */
export function buildLevels(
  nMax: number,
  Emin_eV: number,
  Emax_eV: number,
  innerH: number,
  padTop: number,
): readonly Level[] {
  const out: Level[] = []
  for (let n = 1; n <= nMax; n++) {
    const E = hydrogenLevelEnergy_eV(n)
    out.push({ n, E_eV: E, y: energyToY(E, Emin_eV, Emax_eV, innerH, padTop) })
  }
  return out
}

export type Arrow = {
  /** Source line's array index in input lines. */
  index: number
  series: SeriesName
  upper: number
  lower: number
  x: number
  yUp: number
  yDn: number
  color: string
  label: string
  wavelength_nm: number
}

/**
 * Group hydrogen lines into series columns and assign x coordinates and
 * vertical extents derived from E_n.
 */
export function buildArrows(
  hLines: readonly HydrogenLine[],
  geometry: {
    padL: number
    padR: number
    padTop: number
    innerW: number
    innerH: number
    Emin_eV: number
    Emax_eV: number
    width: number
  },
): readonly Arrow[] {
  const { padL, padTop, innerW, innerH, Emin_eV, Emax_eV } = geometry
  const slotW = innerW / SERIES_NAMES.length
  const arrows: Arrow[] = []

  SERIES_NAMES.forEach((sn, si) => {
    const seriesLines = hLines
      .map((line, idx) => ({ line, idx }))
      .filter(({ line }) => seriesForHydrogenLine(line) === sn)
    if (!seriesLines.length) return

    const slotLeft = padL + si * slotW + slotW * 0.18
    const slotRight = padL + si * slotW + slotW * 0.82
    const stride = (slotRight - slotLeft) / Math.max(seriesLines.length - 1, 1)

    seriesLines.forEach(({ line, idx }, i) => {
      const x = seriesLines.length === 1 ? (slotLeft + slotRight) / 2 : slotLeft + i * stride
      const yUp = energyToY(hydrogenLevelEnergy_eV(line.upper), Emin_eV, Emax_eV, innerH, padTop)
      const yDn = energyToY(hydrogenLevelEnergy_eV(line.lower), Emin_eV, Emax_eV, innerH, padTop)
      arrows.push({
        index: idx,
        series: sn,
        upper: line.upper,
        lower: line.lower,
        x,
        yUp,
        yDn,
        color: SERIES_COLORS[sn],
        label: line.label,
        wavelength_nm: line.wavelength_nm,
      })
    })
  })

  return arrows
}

/** Header x-position for a series column (centered above the slot). */
export function seriesHeaderX(
  seriesName: SeriesName,
  geometry: { padL: number; innerW: number },
): number {
  const { padL, innerW } = geometry
  const si = SERIES_NAMES.indexOf(seriesName)
  const slotW = innerW / SERIES_NAMES.length
  const slotLeft = padL + si * slotW + slotW * 0.18
  const slotRight = padL + si * slotW + slotW * 0.82
  return (slotLeft + slotRight) / 2
}
