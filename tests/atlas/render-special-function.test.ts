/**
 * Smoke and math tests for the special-function renderer.
 *
 * Verifies:
 *   - Renderer emits a valid <svg> string containing the primitive's name.
 *   - Math kernels reproduce known reference values within tolerance.
 *   - Renderer does not throw when optional attrs are missing.
 */

import { describe, expect, it } from 'vitest'
import {
  besselJ,
  betaFn,
  gammaFn,
  hermiteH,
  laguerreL,
  legendreP,
  renderSpecialFunction,
} from '../../src/atlas/render/special-function'
import type { Primitive, Source } from '../../src/atlas/types'
import type { RenderContext } from '../../src/atlas/render/types'

const sources = new Map<string, Source>([
  [
    'nist-dlmf',
    {
      id: 'nist-dlmf',
      citation: 'NIST DLMF',
      retrievedAt: '2026-05-04',
    },
  ],
])
const ctx: RenderContext = { sources }

function makeFn(id: string, name: string, symbol: string): Primitive {
  return {
    id,
    family: 'special-function',
    name,
    symbol,
    attrs: { definingEquation: 'placeholder', parameters: ['x'] },
    sourceId: 'nist-dlmf',
    retrievedAt: '2026-05-04',
  }
}

describe('special-function math kernels', () => {
  it('Γ(5) equals 24 (i.e. 4!)', () => {
    expect(gammaFn(5)).toBeCloseTo(24, 8)
  })

  it('Γ(0.5) equals √π', () => {
    expect(gammaFn(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 8)
  })

  it('Β(2, 3) equals 1/12', () => {
    expect(betaFn(2, 3)).toBeCloseTo(1 / 12, 10)
  })

  it('J_0(0) is 1', () => {
    expect(besselJ(0, 0)).toBeCloseTo(1, 12)
  })

  it('J_0 has its first zero near 2.4048', () => {
    expect(besselJ(0, 2.4048)).toBeCloseTo(0, 3)
  })

  it('P_3(1) equals 1', () => {
    expect(legendreP(3, 1)).toBeCloseTo(1, 12)
  })

  it('P_4(0) equals 3/8', () => {
    expect(legendreP(4, 0)).toBeCloseTo(3 / 8, 12)
  })

  it('H_3(1) equals -4 (physicists Hermite)', () => {
    // H_3(x) = 8x^3 - 12x  →  H_3(1) = -4
    expect(hermiteH(3, 1)).toBeCloseTo(-4, 12)
  })

  it('L_2(0) equals 1', () => {
    expect(laguerreL(2, 0, 0)).toBeCloseTo(1, 12)
  })
})

describe('renderSpecialFunction', () => {
  it('emits a valid SVG card for Γ', () => {
    const svg = renderSpecialFunction(makeFn('special-function.gamma', 'Gamma function', 'Γ'), ctx)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('Gamma function')
    expect(svg).toContain('Γ')
  })

  it('emits a valid SVG card for Bessel J_n', () => {
    const svg = renderSpecialFunction(makeFn('special-function.bessel.j', 'Bessel J', 'J_n'), ctx)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('Bessel J')
  })

  it('does not throw on a primitive with empty attrs', () => {
    const minimal: Primitive = {
      id: 'special-function.gamma',
      family: 'special-function',
      name: 'Gamma',
      attrs: {},
      sourceId: 'nist-dlmf',
      retrievedAt: '2026-05-04',
    }
    expect(() => renderSpecialFunction(minimal, ctx)).not.toThrow()
  })
})
