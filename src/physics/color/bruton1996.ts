/**
 * Bruton (1996) piecewise-linear wavelength → sRGB approximation.
 *
 * Didactic mode. Less colorimetrically accurate than CIE 1931 — it's the color
 * scheme found in introductory spectroscopy textbooks. Retained behind a
 * toggle because the visual matches the Balmer plate everyone has seen.
 *
 * Reference: http://www.physics.sfasu.edu/astro/color/spectra.html
 *
 * NOT the default. Always label "didactic" in the UI.
 */

import type { RGB, RGB8 } from './types'

/**
 * λ < 380 or λ > 780 nm renders as pure black (zero everywhere).
 * Inside the visible band, piecewise-linear interpolation between five hue
 * regions, with intensity falloff at the violet/red ends and a γ=0.8
 * brightness compress.
 */
export function wavelengthToSRGB(lambda_nm: number): RGB {
  let r = 0
  let g = 0
  let b = 0

  if (lambda_nm >= 380 && lambda_nm < 440) {
    r = -(lambda_nm - 440) / 60
    g = 0
    b = 1
  } else if (lambda_nm < 490) {
    r = 0
    g = (lambda_nm - 440) / 50
    b = 1
  } else if (lambda_nm < 510) {
    r = 0
    g = 1
    b = -(lambda_nm - 510) / 20
  } else if (lambda_nm < 580) {
    r = (lambda_nm - 510) / 70
    g = 1
    b = 0
  } else if (lambda_nm < 645) {
    r = 1
    g = -(lambda_nm - 645) / 65
    b = 0
  } else if (lambda_nm <= 780) {
    r = 1
    g = 0
    b = 0
  }

  let f = 1
  if (lambda_nm < 420) f = 0.3 + (0.7 * (lambda_nm - 380)) / 40
  else if (lambda_nm > 700) f = 0.3 + (0.7 * (780 - lambda_nm)) / 80
  f = Math.max(0, Math.min(1, f))

  const gamma = 0.8
  return [
    Math.pow(Math.max(0, r * f), gamma),
    Math.pow(Math.max(0, g * f), gamma),
    Math.pow(Math.max(0, b * f), gamma),
  ] as const
}

export function wavelengthToRGB8(lambda_nm: number): RGB8 {
  const [r, g, b] = wavelengthToSRGB(lambda_nm)
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  }
}
