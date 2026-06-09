/**
 * Lattice renderer — smoke tests.
 *
 * Confirms 2D and 3D Bravais cards render to SVG, contain the lattice
 * name, and tolerate missing optional cell parameters.
 */

import { describe, expect, it } from 'vitest'
import type { Primitive, Source } from '../../src/atlas/types'
import type { RenderContext } from '../../src/atlas/render/types'
import { renderLattice } from '../../src/atlas/render/lattice'

const SOURCE: Source = {
  id: 'itc-vol-a',
  citation: 'ITC Vol A',
  retrievedAt: '2026-05-04',
}
const ctx: RenderContext = { sources: new Map([[SOURCE.id, SOURCE]]) }

function lat(over: Partial<Primitive> & Pick<Primitive, 'id' | 'name' | 'attrs'>): Primitive {
  return {
    family: 'lattice',
    sourceId: 'itc-vol-a',
    retrievedAt: '2026-05-04',
    ...over,
  }
}

describe('renderLattice', () => {
  it('emits an SVG document for a 2D Bravais lattice', () => {
    const p = lat({
      id: 'lattice.bravais.2d.hexagonal',
      name: 'hexagonal (2D)',
      attrs: {
        dimension: 2,
        bravaisClass: 'hexagonal-P',
        conventionalCell: { a: 1, b: 1, c: 1, gamma: 120 },
      },
    })
    const svg = renderLattice(p, ctx)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('hexagonal (2D)')
  })

  it('renders a 3D face-centered cubic with extra centering points', () => {
    const p = lat({
      id: 'lattice.bravais.3d.cubic-f',
      name: 'face-centered cubic (cF / fcc)',
      attrs: {
        dimension: 3,
        bravaisClass: 'cubic-F',
        conventionalCell: { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 },
      },
    })
    const svg = renderLattice(p, ctx)
    expect(svg).toContain('<line')
    expect(svg).toContain('<circle')
    expect(svg).toContain('face-centered cubic')
  })

  it('does not throw on missing conventional-cell attrs', () => {
    const p = lat({
      id: 'lattice.bravais.3d.cubic-p',
      name: 'simple cubic (cP)',
      attrs: { dimension: 3, bravaisClass: 'cubic-P' },
    })
    expect(() => renderLattice(p, ctx)).not.toThrow()
  })
})
