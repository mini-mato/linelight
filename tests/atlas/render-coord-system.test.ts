import { describe, it, expect } from 'vitest'
import { renderCoordSystem } from '../../src/atlas/render/coord-system'
import type { Primitive, Source } from '../../src/atlas/types'
import type { RenderContext } from '../../src/atlas/render/types'

const SOURCE: Source = {
  id: 'morse-feshbach-1953',
  citation: 'Morse, P. M., & Feshbach, H. (1953). Methods of Theoretical Physics, Vol. I.',
  retrievedAt: '2026-05-04',
}
const ctx: RenderContext = { sources: new Map([[SOURCE.id, SOURCE]]) }

function make(
  id: string,
  name: string,
  dimension: number,
  extra: Record<string, unknown> = {},
): Primitive {
  return {
    id,
    family: 'coord-system',
    name,
    symbol: '(r, φ)',
    attrs: { dimension, ...extra },
    sourceId: SOURCE.id,
    retrievedAt: '2026-05-04',
  }
}

describe('renderCoordSystem', () => {
  it('emits an SVG card starting with <svg', () => {
    const svg = renderCoordSystem(make('coord.3d.spherical', 'spherical (3D)', 3), ctx)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('</svg>')
  })

  it('embeds the primitive name and id', () => {
    const svg = renderCoordSystem(make('coord.3d.parabolic', 'parabolic (3D)', 3), ctx)
    expect(svg).toContain('parabolic (3D)')
    expect(svg).toContain('coord.3d.parabolic')
  })

  it('handles the 2D analogues', () => {
    const svg = renderCoordSystem(make('coord.2d.elliptic', 'elliptic (2D)', 2), ctx)
    expect(svg).toContain('elliptic (2D)')
    expect(svg).toContain('2D')
  })

  it('does not throw when optional attrs are missing', () => {
    const minimal = make('coord.3d.cartesian', 'Cartesian (3D)', 3)
    expect(() => renderCoordSystem(minimal, ctx)).not.toThrow()
  })
})
