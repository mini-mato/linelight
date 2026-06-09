/**
 * CIE 1931 2° standard observer → sRGB.
 *
 * Implementation uses the Wyman, Sloan, Shirley (2013) multi-lobe Gaussian fit
 * to the 1931 2° color-matching functions. Accurate to within ~1% RGB across
 * the visible band (380-750 nm). Faster than table interpolation and
 * sufficient for real-time rendering.
 *
 * Reference:
 *   Wyman, C., Sloan, P-P., Shirley, P. (2013).
 *   "Simple Analytic Approximations to the CIE XYZ Color Matching Functions."
 *   Journal of Computer Graphics Techniques, 2(2), 1-11.
 *   https://jcgt.org/published/0002/02/01/
 *
 * Pipeline:
 *   wavelength_nm
 *     → CIE XYZ via fitted CMFs
 *     → linear sRGB via IEC 61966-2-1 matrix (D65 white point)
 *     → sRGB-encoded RGB via piecewise gamma (sRGB EOTF inverse)
 *     → 8-bit clamped output
 *
 * For verification against tabulated CIE values, see
 * `tests/physics/color.test.ts`.
 */

import type { RGB, RGB8, RGBLinear, XYZ } from './types'

/**
 * Asymmetric piecewise Gaussian — narrower on one side of the peak.
 * Wyman 2013 §2.
 */
function gaussian(
  lambda: number,
  alpha: number,
  mu: number,
  sigma1: number,
  sigma2: number,
): number {
  const sigma = lambda < mu ? sigma1 : sigma2
  const t = (lambda - mu) / sigma
  return alpha * Math.exp(-(t * t) / 2)
}

/**
 * CIE 1931 2° standard-observer color-matching functions, Wyman 2013 fit.
 * λ in nanometers. Returns dimensionless tristimulus components.
 */
export function wavelengthToXYZ(lambda_nm: number): XYZ {
  // x̄(λ) — three lobes
  const x =
    gaussian(lambda_nm, 1.056, 599.8, 37.9, 31.0) +
    gaussian(lambda_nm, 0.362, 442.0, 16.0, 26.7) +
    gaussian(lambda_nm, -0.065, 501.1, 20.4, 26.2)

  // ȳ(λ) — two lobes
  const y =
    gaussian(lambda_nm, 0.821, 568.8, 46.9, 40.5) + gaussian(lambda_nm, 0.286, 530.9, 16.3, 31.1)

  // z̄(λ) — two lobes
  const z =
    gaussian(lambda_nm, 1.217, 437.0, 11.8, 36.0) + gaussian(lambda_nm, 0.681, 459.0, 26.0, 13.8)

  return [x, y, z] as const
}

/**
 * sRGB-from-XYZ matrix, IEC 61966-2-1 (D65 illuminant).
 * Maps CIE XYZ → linear sRGB.
 */
const SRGB_FROM_XYZ: readonly [readonly number[], readonly number[], readonly number[]] = [
  [3.2406, -1.5372, -0.4986],
  [-0.9689, 1.8758, 0.0415],
  [0.0557, -0.204, 1.057],
]

export function xyzToLinearSRGB([x, y, z]: XYZ): RGBLinear {
  const r = SRGB_FROM_XYZ[0][0] * x + SRGB_FROM_XYZ[0][1] * y + SRGB_FROM_XYZ[0][2] * z
  const g = SRGB_FROM_XYZ[1][0] * x + SRGB_FROM_XYZ[1][1] * y + SRGB_FROM_XYZ[1][2] * z
  const b = SRGB_FROM_XYZ[2][0] * x + SRGB_FROM_XYZ[2][1] * y + SRGB_FROM_XYZ[2][2] * z
  return [r, g, b] as const
}

/**
 * sRGB EOTF inverse (gamma encode). IEC 61966-2-1, piecewise.
 * Input: linear sRGB component in [0, 1]. Output: sRGB-encoded component in [0, 1].
 */
export function srgbEncode(c: number): number {
  // Snap exact endpoints to avoid floating-point drift at the bounds
  // (1.055 * 1^(1/2.4) - 0.055 evaluates to 0.9999999999999999 in IEEE-754).
  if (c <= 0) return 0
  if (c >= 1) return 1
  if (c <= 0.0031308) return 12.92 * c
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

/**
 * Full pipeline: wavelength (nm) → sRGB-encoded normalized [0, 1] triple.
 */
export function wavelengthToSRGB(lambda_nm: number): RGB {
  const xyz = wavelengthToXYZ(lambda_nm)
  const linear = xyzToLinearSRGB(xyz)
  return [srgbEncode(linear[0]), srgbEncode(linear[1]), srgbEncode(linear[2])] as const
}

/**
 * Convenience: wavelength (nm) → 8-bit RGB record for HTML/CSS.
 */
export function wavelengthToRGB8(lambda_nm: number): RGB8 {
  const [r, g, b] = wavelengthToSRGB(lambda_nm)
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  }
}
