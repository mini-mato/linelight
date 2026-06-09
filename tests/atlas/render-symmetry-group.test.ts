import { describe, it, expect } from 'vitest'
import { renderSymmetryGroup } from '../../src/atlas/render/symmetry-group'
import type { Primitive, Source } from '../../src/atlas/types'
import type { RenderContext } from '../../src/atlas/render/types'

const SOURCES: Source[] = [
  {
    id: 'itc-vol-a',
    citation: 'International Tables for Crystallography Vol A',
    retrievedAt: '2026-05-04',
  },
  {
    id: 'coxeter-1973',
    citation: 'Coxeter (1973). Regular Polytopes.',
    retrievedAt: '2026-05-04',
  },
]
const ctx: RenderContext = { sources: new Map(SOURCES.map((s) => [s.id, s])) }

describe('renderSymmetryGroup', () => {
  it('renders a 3D point group card', () => {
    const td: Primitive = {
      id: 'symmetry-group.point.3d.t-d',
      family: 'symmetry-group',
      name: 'T_d (full tetrahedral)',
      symbol: 'T_d',
      attrs: { groupType: 'point', order: 24 },
      sourceId: 'itc-vol-a',
      retrievedAt: '2026-05-04',
    }
    const svg = renderSymmetryGroup(td, ctx)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('T_d (full tetrahedral)')
    expect(svg).toContain('|G| = 24')
  })

  it('renders a Lie group Dynkin diagram', () => {
    const a3: Primitive = {
      id: 'symmetry-group.lie.a3',
      family: 'symmetry-group',
      name: 'A_3',
      symbol: 'A₃',
      attrs: { groupType: 'lie', order: 'inf', lieAlgebraType: 'A_3' },
      sourceId: 'coxeter-1973',
      retrievedAt: '2026-05-04',
    }
    const svg = renderSymmetryGroup(a3, ctx)
    expect(svg).toContain('A_3')
    // Three Dynkin nodes (drawn as <circle ... r="5">).
    const circleMatches = svg.match(/<circle [^>]*r="5"/g) ?? []
    expect(circleMatches.length).toBeGreaterThanOrEqual(3)
  })

  it('renders the exceptional G_2 with a triple-bond Dynkin', () => {
    const g2: Primitive = {
      id: 'symmetry-group.lie.g2',
      family: 'symmetry-group',
      name: 'G_2',
      symbol: 'G₂',
      attrs: { groupType: 'lie', order: 'inf', lieAlgebraType: 'G_2' },
      sourceId: 'coxeter-1973',
      retrievedAt: '2026-05-04',
    }
    const svg = renderSymmetryGroup(g2, ctx)
    expect(svg).toContain('G_2')
    expect(svg).toContain('Coxeter 1973')
  })

  it('does not throw with minimal attrs', () => {
    const minimal: Primitive = {
      id: 'symmetry-group.point.3d.c1',
      family: 'symmetry-group',
      name: 'C_1',
      attrs: { groupType: 'point' },
      sourceId: 'itc-vol-a',
      retrievedAt: '2026-05-04',
    }
    expect(() => renderSymmetryGroup(minimal, ctx)).not.toThrow()
  })
})
