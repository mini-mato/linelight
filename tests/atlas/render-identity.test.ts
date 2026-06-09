/**
 * Smoke tests for the identity renderer.
 *
 * Verifies:
 *   - Renderer emits a valid <svg> string with the primitive's name.
 *   - Equation and "where:" lines surface in the output.
 *   - Empty attrs do not throw.
 */

import { describe, expect, it } from 'vitest'
import { renderIdentity } from '../../src/atlas/render/identity'
import type { Primitive, Source } from '../../src/atlas/types'
import type { RenderContext } from '../../src/atlas/render/types'

const sources = new Map<string, Source>([
  ['codata-2022', { id: 'codata-2022', citation: 'CODATA 2022', retrievedAt: '2026-05-04' }],
])
const ctx: RenderContext = { sources }

function makeIdentity(overrides: Partial<Primitive> = {}): Primitive {
  return {
    id: 'identity.planck-einstein.energy-frequency',
    family: 'identity',
    name: 'Planck-Einstein relation',
    symbol: 'E = hν',
    attrs: {
      equation: 'E = h ν',
      numeric: 'hc = 1239.84 eV·nm',
      where: ['h = 6.626 × 10⁻³⁴ J·s', 'ν = frequency'],
      dimension: 'energy',
    },
    sourceId: 'codata-2022',
    retrievedAt: '2026-05-04',
    ...overrides,
  }
}

describe('renderIdentity', () => {
  it('emits a valid SVG card with the identity name', () => {
    const svg = renderIdentity(makeIdentity(), ctx)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('Planck-Einstein relation')
  })

  it('includes the equation form in the rendered card', () => {
    const svg = renderIdentity(makeIdentity(), ctx)
    expect(svg).toContain('E = h ν')
  })

  it('renders "where:" lines when provided', () => {
    const svg = renderIdentity(makeIdentity(), ctx)
    expect(svg).toContain('h = 6.626')
  })

  it('does not throw when attrs is empty', () => {
    const empty = makeIdentity({ attrs: {} })
    expect(() => renderIdentity(empty, ctx)).not.toThrow()
  })
})
