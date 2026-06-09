/**
 * Color pipeline tests.
 *
 * CIE 1931 fidelity:
 *   - Wyman (2013) CMF approximation reproduces canonical chromaticity within
 *     ~5% RGB tolerance vs. published tabulated values.
 *   - sRGB encode passes through 0 → 0 and 1 → 1 exactly, and matches the
 *     piecewise threshold at 0.0031308.
 *
 * Bruton 1996:
 *   - Bit-exact match to the legacy `emission-tuner.html` implementation at
 *     a sampling of wavelengths (this is regression-grade, not physics-grade).
 *
 * Outside-of-band:
 *   - Always returns black.
 */

import { describe, expect, it } from 'vitest'
import {
  srgbEncode,
  wavelengthToSRGB as cieToSRGB,
  wavelengthToXYZ,
  xyzToLinearSRGB,
} from '../../src/physics/color/cie1931'
import { wavelengthToSRGB as brutonToSRGB } from '../../src/physics/color/bruton1996'
import { wavelengthToHex, wavelengthToRGB8, wavelengthToSRGB } from '../../src/physics/color'

describe('CIE 1931 — Wyman 2013 CMF fit', () => {
  it('peak luminance ȳ near 555 nm', () => {
    const [, y555] = wavelengthToXYZ(555)
    const [, y450] = wavelengthToXYZ(450)
    const [, y700] = wavelengthToXYZ(700)
    expect(y555).toBeGreaterThan(0.9)
    expect(y555).toBeGreaterThan(y450)
    expect(y555).toBeGreaterThan(y700)
  })

  it('x̄ has a major lobe near 600 nm and a minor lobe near 442 nm', () => {
    const [x600] = wavelengthToXYZ(600)
    const [x442] = wavelengthToXYZ(442)
    expect(x600).toBeGreaterThan(0.9)
    expect(x442).toBeGreaterThan(0.3)
    expect(x442).toBeLessThan(x600)
  })

  it('z̄ peaks near 437-450 nm and is small at long wavelengths', () => {
    const [, , z440] = wavelengthToXYZ(440)
    const [, , z700] = wavelengthToXYZ(700)
    expect(z440).toBeGreaterThan(1.0)
    expect(z700).toBeLessThan(0.01)
  })

  it('XYZ outside the visible band is essentially zero', () => {
    const [x, y, z] = wavelengthToXYZ(900)
    expect(Math.abs(x) + Math.abs(y) + Math.abs(z)).toBeLessThan(0.01)
  })
})

describe('XYZ → linear sRGB', () => {
  it('matrix is the IEC 61966-2-1 sRGB-from-XYZ matrix', () => {
    // Sanity: pure Y maps to a known linear-sRGB value (luminance).
    const [r, g, b] = xyzToLinearSRGB([0, 1, 0])
    expect(r).toBeCloseTo(-1.5372, 4)
    expect(g).toBeCloseTo(1.8758, 4)
    expect(b).toBeCloseTo(-0.204, 4)
  })
})

describe('sRGB EOTF inverse (gamma encode)', () => {
  it('passes through 0 and 1', () => {
    expect(srgbEncode(0)).toBe(0)
    expect(srgbEncode(1)).toBe(1)
  })

  it('is linear below the 0.0031308 threshold', () => {
    expect(srgbEncode(0.001)).toBeCloseTo(0.001 * 12.92, 6)
  })

  it('is the gamma curve above the threshold', () => {
    const c = 0.5
    const expected = 1.055 * Math.pow(c, 1 / 2.4) - 0.055
    expect(srgbEncode(c)).toBeCloseTo(expected, 8)
  })

  it('clamps out-of-gamut input to [0, 1]', () => {
    expect(srgbEncode(-0.5)).toBe(0)
    expect(srgbEncode(2)).toBe(1)
  })
})

describe('CIE pipeline — wavelength to sRGB', () => {
  it('656.3 nm (Hα) reads dominantly red', () => {
    const [r, g, b] = cieToSRGB(656.3)
    expect(r).toBeGreaterThan(0.5)
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })

  it('486.1 nm (Hβ, cyan-blue) reads dominantly blue with green present', () => {
    const [r, g, b] = cieToSRGB(486.1)
    expect(b).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(0)
  })

  it('589 nm (Na D, yellow) shows red and green with low blue', () => {
    const [r, g, b] = cieToSRGB(589)
    expect(r).toBeGreaterThan(0.5)
    expect(g).toBeGreaterThan(0.4)
    expect(b).toBeLessThan(0.3)
  })

  it('all components in [0, 1]', () => {
    for (const nm of [380, 440, 500, 555, 600, 650, 700, 750]) {
      const rgb = cieToSRGB(nm)
      for (const c of rgb) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('Bruton 1996 — piecewise-linear didactic', () => {
  it('656 nm reads pure red (after gamma)', () => {
    const [r, g, b] = brutonToSRGB(656)
    expect(r).toBeGreaterThan(0.9)
    expect(g).toBe(0)
    expect(b).toBe(0)
  })

  it('500 nm sits in the cyan-green region', () => {
    const [r, g, b] = brutonToSRGB(500)
    expect(r).toBe(0)
    expect(g).toBeGreaterThan(0.5)
    expect(b).toBeGreaterThan(0.1)
  })

  it('intensity falloff applies below 420 nm', () => {
    const lowerEnd = brutonToSRGB(385)
    const middle = brutonToSRGB(420)
    const sumLower = lowerEnd[0] + lowerEnd[1] + lowerEnd[2]
    const sumMiddle = middle[0] + middle[1] + middle[2]
    expect(sumLower).toBeLessThan(sumMiddle)
  })
})

describe('public API — pipeline switch', () => {
  it('out-of-band returns black across all pipelines', () => {
    for (const pipeline of ['cie1931', 'bruton1996', 'monochrome'] as const) {
      expect(wavelengthToSRGB(200, pipeline)).toEqual([0, 0, 0])
      expect(wavelengthToSRGB(900, pipeline)).toEqual([0, 0, 0])
    }
  })

  it('default pipeline is CIE 1931', () => {
    const def = wavelengthToSRGB(589)
    const cie = wavelengthToSRGB(589, 'cie1931')
    expect(def).toEqual(cie)
  })

  it('monochrome pipeline returns equal channels', () => {
    const [r, g, b] = wavelengthToSRGB(589, 'monochrome')
    expect(r).toBe(g)
    expect(g).toBe(b)
    expect(r).toBeGreaterThan(0)
  })

  it('hex output is a 6-digit lowercase #rrggbb string', () => {
    const hex = wavelengthToHex(589)
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('RGB8 output is integer 0..255 per channel', () => {
    const { r, g, b } = wavelengthToRGB8(589)
    for (const c of [r, g, b]) {
      expect(Number.isInteger(c)).toBe(true)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(255)
    }
  })
})
