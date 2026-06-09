/**
 * Polytope renderer — smoke tests.
 *
 * Confirms the renderer produces a non-empty SVG for representative cases
 * across 2D, 3D, 4D, and the n-parametric family, and that the primitive
 * name reaches the rendered output.
 */

import { describe, expect, it } from 'vitest'
import type { Primitive, Source } from '../../src/atlas/types'
import type { RenderContext } from '../../src/atlas/render/types'
import { renderPolytope } from '../../src/atlas/render/polytope'

const SOURCE: Source = {
  id: 'coxeter-1973',
  citation: 'Coxeter 1973',
  retrievedAt: '2026-05-04',
}
const ctx: RenderContext = { sources: new Map([[SOURCE.id, SOURCE]]) }

function poly(over: Partial<Primitive> & Pick<Primitive, 'id' | 'name' | 'attrs'>): Primitive {
  return {
    family: 'polytope',
    sourceId: 'coxeter-1973',
    retrievedAt: '2026-05-04',
    ...over,
  }
}

describe('renderPolytope', () => {
  it('emits an SVG document for a 2D regular polygon', () => {
    const p = poly({
      id: 'polytope.regular.2d.hexagon',
      name: 'regular hexagon',
      symbol: '{6}',
      attrs: { dimension: 2, schlafli: [6], vertices: 6, edges: 6 },
    })
    const svg = renderPolytope(p, ctx)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('regular hexagon')
  })

  it('renders a 3D Platonic solid as projected line segments', () => {
    const p = poly({
      id: 'polytope.regular.3d.icosahedron',
      name: 'icosahedron',
      symbol: '{3,5}',
      attrs: { dimension: 3, schlafli: [3, 5], vertices: 12, edges: 30, faces: 20 },
    })
    const svg = renderPolytope(p, ctx)
    expect(svg).toContain('<line')
    expect(svg).toContain('icosahedron')
  })

  it('renders a 4D Schlegel projection without throwing', () => {
    const p = poly({
      id: 'polytope.regular.4d.tesseract',
      name: 'tesseract (8-cell)',
      symbol: '{4,3,3}',
      attrs: { dimension: 4, schlafli: [4, 3, 3], vertices: 16, edges: 32, cells: 8 },
    })
    const svg = renderPolytope(p, ctx)
    expect(svg).toContain('tesseract')
  })

  it('renders an n-parametric polytope as a typeset card with formulas', () => {
    const p = poly({
      id: 'polytope.regular.nd.n-cube',
      name: 'n-cube (hypercube)',
      symbol: '{4,3^(n-2)}',
      attrs: {
        dimension: 'n',
        formulas: {
          vertex_count: { latex: 'V = 2^n', closedForm: '2^n' },
        },
      },
    })
    const svg = renderPolytope(p, ctx)
    expect(svg).toContain('n-cube')
  })
})
