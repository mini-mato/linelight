/**
 * Hit-test: canvas pixel-space → nearest rendered pole.
 *
 * Decoupled from the draw pass. drawPropagatorView returns RenderedPole[]
 * (canvas coordinates); hitTestPole maps a pointer event into a selection.
 */

import type { Pole } from './poles'

/** A pole that has been placed on canvas by drawPropagatorView. */
export type RenderedPole = {
  pole: Pole
  cx_px: number
  cy_px: number
}

const DEFAULT_HIT_RADIUS_PX = 8

/**
 * Return the pole nearest to (x, y) within `radius` pixels, or null.
 * Ties broken by list order (first match wins).
 */
export function hitTestPole(
  rendered: RenderedPole[],
  x: number,
  y: number,
  radius = DEFAULT_HIT_RADIUS_PX,
): Pole | null {
  let nearest: Pole | null = null
  let minDist = radius

  for (const rp of rendered) {
    const dx = rp.cx_px - x
    const dy = rp.cy_px - y
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d <= minDist) {
      minDist = d
      nearest = rp.pole
    }
  }

  return nearest
}
