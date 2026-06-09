/**
 * Signed-thermal colormap for the |ψ|² xz-slice.
 *
 * Convention (Bransden / Hyperphysics / Falstad):
 *   • red   = +ψ
 *   • blue  = −ψ
 *   • white = 0
 *
 * Saturation tracks |ψ|. Input is a signed amplitude already normalized to
 * [-1, +1]; we apply a gamma to the magnitude (|t|^γ) to lift low-amplitude
 * tails into visible contrast without distorting sign or shape.
 *
 * Endpoints:
 *   blue  #1f4ea8  (most-negative ψ)
 *   white #ffffff  (zero ψ)
 *   red   #c2185b  (most-positive ψ)
 *
 * Gamma 0.7: |t|^0.7 — slight pull-toward-saturated; values in (0, 1) get
 * mapped further from white than a linear ramp would give.
 */

export const COLORMAP_GAMMA = 0.7
export const NEG_COLOR = { r: 0x1f, g: 0x4e, b: 0xa8 } as const
export const POS_COLOR = { r: 0xc2, g: 0x18, b: 0x5b } as const
export const ZERO_COLOR = { r: 0xff, g: 0xff, b: 0xff } as const

export type RGBA = { r: number; g: number; b: number; a: number }

/**
 * Map a signed normalized amplitude in [-1, +1] to an RGBA byte tuple.
 * Out-of-range inputs are clamped. NaN maps to opaque white.
 */
export function signedThermal(normalized: number, gamma: number = COLORMAP_GAMMA): RGBA {
  if (!Number.isFinite(normalized)) {
    return { r: ZERO_COLOR.r, g: ZERO_COLOR.g, b: ZERO_COLOR.b, a: 255 }
  }
  const t = Math.max(-1, Math.min(1, normalized))
  const mag = Math.pow(Math.abs(t), gamma)
  const sign = t >= 0 ? POS_COLOR : NEG_COLOR
  // Linear interpolation from white (mag=0) to the signed endpoint (mag=1).
  const r = Math.round(ZERO_COLOR.r + (sign.r - ZERO_COLOR.r) * mag)
  const g = Math.round(ZERO_COLOR.g + (sign.g - ZERO_COLOR.g) * mag)
  const b = Math.round(ZERO_COLOR.b + (sign.b - ZERO_COLOR.b) * mag)
  return { r, g, b, a: 255 }
}
