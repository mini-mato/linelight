/**
 * CSS gradient construction for the Spectrum Bar background.
 *
 * - In `visible` range: a continuous wavelength gradient sampled every 1/80
 *   from 380→750 nm using the active color pipeline.
 * - In `full-em-log` range: the bar is mostly black, with the visible band
 *   (380–750 nm) painted in via the same pipeline. The colored slice spans
 *   `positionPercent(380, log) → positionPercent(750, log)`.
 *
 * Display modes:
 *   - `emission`   : the bar background is black; lines are drawn on top.
 *   - `absorption` : the bar background is the gradient; lines are dark notches.
 *
 * For emission rendering, the gradient is still computed (instruments may want
 * to fade it in subtly behind the lines), but the orchestrator owns the choice
 * of whether to display it.
 */

import type { ColorPipeline } from '../../physics/color'
import { wavelengthToHex } from '../../physics/color'
import type { RangeMode } from './scale'
import { VISIBLE_MIN_NM, VISIBLE_MAX_NM, positionPercent } from './scale'

const SAMPLES = 80

export type GradientStop = {
  /** 0..100 along the bar. */
  pct: number
  /** CSS color. */
  color: string
}

/**
 * Build the ordered list of gradient stops for a given range + pipeline.
 * Always returns at least two stops (start + end).
 */
export function buildGradientStops(
  range: RangeMode,
  pipeline: ColorPipeline,
): readonly GradientStop[] {
  if (range === 'visible') {
    const stops: GradientStop[] = []
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES
      const nm = VISIBLE_MIN_NM + t * (VISIBLE_MAX_NM - VISIBLE_MIN_NM)
      stops.push({ pct: t * 100, color: wavelengthToHex(nm, pipeline) })
    }
    return stops
  }

  // full-em-log: black outside the visible window, sampled spectrum inside.
  const visStart = positionPercent(VISIBLE_MIN_NM, range)
  const visEnd = positionPercent(VISIBLE_MAX_NM, range)
  const stops: GradientStop[] = [
    { pct: 0, color: '#000000' },
    { pct: visStart, color: '#000000' },
  ]
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES
    const nm = VISIBLE_MIN_NM + t * (VISIBLE_MAX_NM - VISIBLE_MIN_NM)
    const pct = visStart + t * (visEnd - visStart)
    stops.push({ pct, color: wavelengthToHex(nm, pipeline) })
  }
  stops.push({ pct: visEnd, color: '#000000' })
  stops.push({ pct: 100, color: '#000000' })
  return stops
}

/** Convert a stop list to a CSS `linear-gradient(...)` string. */
export function stopsToCss(stops: readonly GradientStop[]): string {
  const parts = stops.map((s) => `${s.color} ${s.pct.toFixed(3)}%`)
  return `linear-gradient(to right, ${parts.join(', ')})`
}
