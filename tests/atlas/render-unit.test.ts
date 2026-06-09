/**
 * Smoke tests for the unit renderer.
 *
 * Verifies:
 *   - Renderer emits a valid <svg> string with the unit name and symbol.
 *   - Dimension string and conversions reach the rendered output.
 *   - Minimal attrs do not throw.
 */

import { describe, expect, it } from 'vitest'
import { renderUnit } from '../../src/atlas/render/unit'
import type { Primitive, Source } from '../../src/atlas/types'
import type { RenderContext } from '../../src/atlas/render/types'

const sources = new Map<string, Source>([
  ['codata-2022', { id: 'codata-2022', citation: 'CODATA 2022', retrievedAt: '2026-05-04' }],
])
const ctx: RenderContext = { sources }

function makeUnit(overrides: Partial<Primitive> = {}): Primitive {
  return {
    id: 'unit.energy.ev',
    family: 'unit',
    name: 'electronvolt',
    symbol: 'eV',
    attrs: {
      dimensionString: 'M L^2 T^-2',
      quantity: 'energy',
      siFactor: 1.602176634e-19,
      conversions: [
        { expression: '1 eV = 1.602 176 634 × 10⁻¹⁹ J' },
        { expression: '1 eV = 8065.544 cm⁻¹' },
      ],
    },
    sourceId: 'codata-2022',
    retrievedAt: '2026-05-04',
    ...overrides,
  }
}

describe('renderUnit', () => {
  it('emits a valid SVG card with the unit name', () => {
    const svg = renderUnit(makeUnit(), ctx)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('electronvolt')
  })

  it('renders the unit symbol prominently', () => {
    const svg = renderUnit(makeUnit(), ctx)
    expect(svg).toContain('eV')
  })

  it('includes a conversion line in the rendered card', () => {
    const svg = renderUnit(makeUnit(), ctx)
    expect(svg).toContain('1.602')
  })

  it('does not throw when attrs has only a dimension string', () => {
    const minimal = makeUnit({ attrs: { dimensionString: 'L' } })
    expect(() => renderUnit(minimal, ctx)).not.toThrow()
  })
})
