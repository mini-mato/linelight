/**
 * Sample the hydrogenic ψ on a Cartesian slice plane and normalize for display.
 *
 * For each pixel (i, j) in a `pixelsW × pixelsH` grid, we map the pixel
 * center to two Cartesian axes in Bohr radii spanning [-halfExtent, +halfExtent]
 * (centered on the atom at the origin), evaluate ψ_nlm, and store the signed
 * amplitude.
 *
 * The peak |ψ| across the field is returned alongside the raw samples so
 * the renderer can normalize once and avoid double-passing the data.
 */

import { psiCartesian } from '../../../../physics/atomic'
import type { AtomViewSlicePlane } from '../../../../types'

export type FieldSample = {
  /** Flat row-major signed-amplitude array, length = pixelsW * pixelsH. */
  data: Float32Array
  /** Peak absolute value across the sampled field (≥ 0). */
  peak: number
  pixelsW: number
  pixelsH: number
  halfExtent_Bohr: number
}

/**
 * Sample ψ on a regular 2D plane. The axis not named by `plane` is held at 0.
 *
 * Pixel (i, j) with i along width (→ x) and j along height (↓ in screen
 * coordinates → −z) is mapped to:
 *   x = (i + 0.5) / pixelsW * 2*halfExtent - halfExtent
 *   z = halfExtent - (j + 0.5) / pixelsH * 2*halfExtent     // flip Y so +z points up
 */
export function sampleField(args: {
  n: number
  l: number
  m?: number
  Z: number
  plane?: AtomViewSlicePlane
  halfExtent_Bohr: number
  pixelsW: number
  pixelsH: number
}): FieldSample {
  const { n, l, m = 0, Z, plane = 'xz', halfExtent_Bohr, pixelsW, pixelsH } = args
  if (pixelsW <= 0 || pixelsH <= 0) {
    throw new Error(`sampleField: pixelsW=${pixelsW} pixelsH=${pixelsH} must be > 0`)
  }
  const data = new Float32Array(pixelsW * pixelsH)
  const dx = (2 * halfExtent_Bohr) / pixelsW
  const dz = (2 * halfExtent_Bohr) / pixelsH
  let peak = 0
  for (let j = 0; j < pixelsH; j++) {
    const b = halfExtent_Bohr - (j + 0.5) * dz
    for (let i = 0; i < pixelsW; i++) {
      const a = -halfExtent_Bohr + (i + 0.5) * dx
      let x = 0
      let y = 0
      let z = 0
      if (plane === 'xz') {
        x = a
        z = b
      } else if (plane === 'xy') {
        x = a
        y = b
      } else {
        y = a
        z = b
      }
      const v = psiCartesian(n, l, m, Z, x, y, z)
      data[j * pixelsW + i] = v
      const av = Math.abs(v)
      if (av > peak) peak = av
    }
  }
  return { data, peak, pixelsW, pixelsH, halfExtent_Bohr }
}
