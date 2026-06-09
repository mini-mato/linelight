/**
 * Tiling renderer — smoke tests.
 *
 * Confirms regular Euclidean and hyperbolic tilings render to SVG without
 * throwing and that primitive name + Schlafli symbol reach the output.
 */

import { describe, expect, it } from 'vitest'
import type { Primitive, Source } from '../../src/atlas/types'
import type { RenderContext } from '../../src/atlas/render/types'
import { renderTiling } from '../../src/atlas/render/tiling'

const SOURCE: Source = {
  id: 'coxeter-1973',
  citation: 'Coxeter 1973',
  retrievedAt: '2026-05-04',
}
const ctx: RenderContext = { sources: new Map([[SOURCE.id, SOURCE]]) }

function tile(over: Partial<Primitive> & Pick<Primitive, 'id' | 'name' | 'attrs'>): Primitive {
  return {
    family: 'tiling',
    sourceId: 'coxeter-1973',
    retrievedAt: '2026-05-04',
    ...over,
  }
}

describe('renderTiling', () => {
  it('emits an SVG document for the Euclidean hexagonal tiling', () => {
    const p = tile({
      id: 'tiling.regular.2d.hexagonal',
      name: 'hexagonal tiling',
      symbol: '{6,3}',
      attrs: { dimension: 2, geometry: 'euclidean', schlafli: [6, 3] },
    })
    const svg = renderTiling(p, ctx)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('hexagonal tiling')
    expect(svg).toContain('{6,3}')
  })

  it('renders the Poincare disk for a hyperbolic tiling', () => {
    const p = tile({
      id: 'tiling.regular.2d.hyperbolic.7-3',
      name: 'order-3 heptagonal tiling',
      symbol: '{7,3}',
      attrs: { dimension: 2, geometry: 'hyperbolic', schlafli: [7, 3] },
    })
    const svg = renderTiling(p, ctx)
    expect(svg).toContain('<circle')
    expect(svg).toContain('order-3 heptagonal tiling')
  })

  it('renders the cubic honeycomb in 3D without throwing', () => {
    const p = tile({
      id: 'tiling.regular.3d.cubic-honeycomb',
      name: 'cubic honeycomb',
      symbol: '{4,3,4}',
      attrs: { dimension: 3, geometry: 'euclidean', schlafli: [4, 3, 4] },
    })
    const svg = renderTiling(p, ctx)
    expect(svg).toContain('cubic honeycomb')
    expect(svg).toContain('<line')
  })

  it('does not throw on bare attrs', () => {
    const p = tile({
      id: 'tiling.regular.2d.square',
      name: 'square tiling',
      symbol: '{4,4}',
      attrs: { dimension: 2, geometry: 'euclidean', schlafli: [4, 4] },
    })
    expect(() => renderTiling(p, ctx)).not.toThrow()
  })
})
