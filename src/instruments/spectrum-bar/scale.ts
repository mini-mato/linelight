/**
 * Spectrum-Bar scale math.
 *
 * Two range modes share a common API:
 *   - `visible`     : 380–750 nm, linear axis.
 *   - `full-em-log` : 1 pm to 1 m (1e-3 to 1e9 nm), 12-decade base-10 log axis.
 *
 * `positionPercent(nm, range)` returns the on-bar coordinate as a percentage
 * 0..100. Values outside the band are still computed (so callers can decide
 * whether to clip) but are mathematically extrapolated, not clamped.
 */

export type RangeMode = 'visible' | 'full-em-log'

export const VISIBLE_MIN_NM = 380
export const VISIBLE_MAX_NM = 750

/** 1 pm = 1e-3 nm. */
export const LOG_MIN_NM = 1e-3
/** 1 m = 1e9 nm. */
export const LOG_MAX_NM = 1e9
export const LOG_MIN = Math.log10(LOG_MIN_NM)
export const LOG_MAX = Math.log10(LOG_MAX_NM)

export type AxisTick = {
  /** Wavelength of the tick, nm. */
  nm: number
  /** Position 0..100 along the bar. */
  pct: number
  /** Display label (already unit-formatted). */
  label: string
}

/** Convert wavelength (nm) to a 0..100 % position for a given range mode. */
export function positionPercent(nm: number, range: RangeMode): number {
  if (range === 'visible') {
    return ((nm - VISIBLE_MIN_NM) / (VISIBLE_MAX_NM - VISIBLE_MIN_NM)) * 100
  }
  const x = Math.log10(nm)
  return ((x - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100
}

/** True when a wavelength is within the rendered band for the given range mode. */
export function inBand(nm: number, range: RangeMode): boolean {
  if (range === 'visible') return nm >= VISIBLE_MIN_NM && nm <= VISIBLE_MAX_NM
  return nm >= LOG_MIN_NM && nm <= LOG_MAX_NM
}

/**
 * Format a wavelength for human reading. Picks the SI prefix that keeps the
 * mantissa in the [0.1, 1000) range; falls back to nm.
 */
export function formatWavelength(nm: number): string {
  if (!Number.isFinite(nm) || nm <= 0) return `${nm} nm`
  if (nm < 1) {
    // sub-nanometer: pm
    const pm = nm * 1000
    return `${trim(pm)} pm`
  }
  if (nm < 1000) return `${trim(nm)} nm`
  if (nm < 1e6) return `${trim(nm / 1000)} μm`
  if (nm < 1e9) return `${trim(nm / 1e6)} mm`
  return `${trim(nm / 1e9)} m`
}

function trim(n: number): string {
  if (n >= 100) return n.toFixed(0)
  if (n >= 10) return n.toFixed(1)
  if (n >= 1) return n.toFixed(2)
  return n.toFixed(3)
}

/** Spec'd axis ticks in `full-em-log` mode. */
const LOG_TICKS_NM: readonly number[] = [
  1e-3, // 1 pm
  1e-1, // 0.1 nm
  1e1, // 10 nm
  1e3, // 1 μm
  1e5, // 100 μm
  1e6, // 1 mm
  1e8, // 10 cm
  1e9, // 1 m
]

/** Tick positions for the visible-band linear axis (every 50 nm, 400..750). */
const VISIBLE_TICKS_NM: readonly number[] = [400, 450, 500, 550, 600, 650, 700, 750]

export function axisTicks(range: RangeMode): readonly AxisTick[] {
  const source = range === 'visible' ? VISIBLE_TICKS_NM : LOG_TICKS_NM
  return source.map((nm) => ({
    nm,
    pct: positionPercent(nm, range),
    label: formatWavelength(nm),
  }))
}
