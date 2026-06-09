import { describe, expect, it } from 'vitest'
import { renderTransitionType } from '../../src/atlas/render/transition-type'
import type { Primitive, Source } from '../../src/atlas/types'
import type { RenderContext } from '../../src/atlas/render/types'

const SOURCE: Source = {
  id: 'bransden-joachain-2003',
  citation: 'Bransden & Joachain, Physics of Atoms and Molecules.',
  retrievedAt: '2026-05-04',
}

const ctx: RenderContext = {
  sources: new Map([[SOURCE.id, SOURCE]]),
}

const e1: Primitive = {
  id: 'transition-type.e1',
  family: 'transition-type',
  name: 'electric dipole (E1)',
  symbol: 'E1',
  attrs: {
    multipoleOrder: 1,
    parity: 'odd',
    lifetimeOrderOfMagnitudeS: 1e-9,
    selectionRules: { deltaJ: '0, ±1', deltaL: '±1', deltaS: '0', parity: 'changes' },
  },
  sourceId: SOURCE.id,
  retrievedAt: '2026-05-04',
}

describe('renderTransitionType', () => {
  it('produces an SVG document', () => {
    expect(renderTransitionType(e1, ctx).startsWith('<svg')).toBe(true)
  })

  it('renders the symbol prominently', () => {
    expect(renderTransitionType(e1, ctx)).toContain('E1')
  })

  it('typesets ΔJ selection rules', () => {
    expect(renderTransitionType(e1, ctx)).toContain('ΔJ')
  })

  it('does not throw on a forbidden entry without selection rules', () => {
    const f: Primitive = {
      id: 'transition-type.forbidden',
      family: 'transition-type',
      name: 'forbidden',
      symbol: 'F',
      attrs: {},
      sourceId: SOURCE.id,
      retrievedAt: '2026-05-04',
    }
    expect(() => renderTransitionType(f, ctx)).not.toThrow()
  })
})
