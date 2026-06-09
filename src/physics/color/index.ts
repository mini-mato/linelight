/**
 * Wavelength → color, with pipeline toggle.
 *
 * Default: CIE 1931 (colorimetric).
 * Didactic: Bruton 1996 (piecewise-linear, textbook colors).
 * Monochrome: gray channel by ȳ(λ) (luminance only).
 */

import type { ColorPipeline, RGB, RGB8 } from './types'
import * as bruton from './bruton1996'
import * as cie from './cie1931'

export type { ColorPipeline, RGB, RGB8 } from './types'

/**
 * Convert wavelength (nm) to sRGB-encoded normalized [0, 1] triple.
 * Returns black for wavelengths outside [380, 780].
 */
export function wavelengthToSRGB(lambda_nm: number, pipeline: ColorPipeline = 'cie1931'): RGB {
  if (lambda_nm < 380 || lambda_nm > 780) return [0, 0, 0] as const
  switch (pipeline) {
    case 'cie1931':
      return cie.wavelengthToSRGB(lambda_nm)
    case 'bruton1996':
      return bruton.wavelengthToSRGB(lambda_nm)
    case 'monochrome': {
      const [, y] = cie.wavelengthToXYZ(lambda_nm)
      const v = cie.srgbEncode(Math.min(1, Math.max(0, y)))
      return [v, v, v] as const
    }
  }
}

/** Wavelength → 8-bit RGB record. */
export function wavelengthToRGB8(lambda_nm: number, pipeline: ColorPipeline = 'cie1931'): RGB8 {
  const [r, g, b] = wavelengthToSRGB(lambda_nm, pipeline)
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  }
}

/** Wavelength → CSS hex color. */
export function wavelengthToHex(lambda_nm: number, pipeline: ColorPipeline = 'cie1931'): string {
  const { r, g, b } = wavelengthToRGB8(lambda_nm, pipeline)
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}
