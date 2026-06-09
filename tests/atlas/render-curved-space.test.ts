import { describe, it, expect } from 'vitest'
import { renderCurvedSpace } from '../../src/atlas/render/curved-space'
import type { Primitive, Source } from '../../src/atlas/types'
import type { RenderContext } from '../../src/atlas/render/types'

const SOURCE: Source = {
  id: 'nist-dlmf',
  citation: 'NIST Digital Library of Mathematical Functions',
  retrievedAt: '2026-05-04',
}
const ctx: RenderContext = { sources: new Map([[SOURCE.id, SOURCE]]) }

function make(
  id: string,
  name: string,
  K: number,
  dimension: number,
  lineElement?: string,
): Primitive {
  return {
    id,
    family: 'curved-space',
    name,
    symbol: name.split(' ').pop(),
    attrs: { curvatureK: K, dimension, lineElement },
    sourceId: SOURCE.id,
    retrievedAt: '2026-05-04',
  }
}

describe('renderCurvedSpace', () => {
  it('emits an SVG card', () => {
    const svg = renderCurvedSpace(
      make('curved-space.spherical.s2', 'sphere S^2', 1, 2, 'dθ² + sin²θ dφ²'),
      ctx,
    )
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('</svg>')
  })

  it('renders Euclidean (K=0) with a flat-plane icon and K=0 badge', () => {
    const svg = renderCurvedSpace(
      make('curved-space.euclidean.e3', 'Euclidean 3-space', 0, 3, 'dx² + dy² + dz²'),
      ctx,
    )
    expect(svg).toContain('K = 0')
    expect(svg).toContain('Euclidean 3-space')
  })

  it('renders hyperbolic (K=-1) with K=−1 badge', () => {
    const svg = renderCurvedSpace(
      make('curved-space.hyperbolic.h2', 'hyperbolic plane', -1, 2, 'dr² + sinh²r dφ²'),
      ctx,
    )
    expect(svg).toContain('K = −1')
    expect(svg).toContain('hyperbolic plane')
  })

  it('does not throw when lineElement is omitted', () => {
    const minimal: Primitive = {
      id: 'curved-space.spherical.s1',
      family: 'curved-space',
      name: 'circle S^1',
      attrs: { curvatureK: 1, dimension: 1 },
      sourceId: SOURCE.id,
      retrievedAt: '2026-05-04',
    }
    expect(() => renderCurvedSpace(minimal, ctx)).not.toThrow()
  })
})
