import { describe, expect, it } from 'vitest'
import { renderEnergyLevel } from '../../src/atlas/render/energy-level'
import type { Primitive, Source } from '../../src/atlas/types'
import type { RenderContext } from '../../src/atlas/render/types'

const SOURCE: Source = {
  id: 'nist-asd-v5.10',
  citation: 'NIST ASD',
  retrievedAt: '2026-05-04',
}

const ctx: RenderContext = {
  sources: new Map([[SOURCE.id, SOURCE]]),
}

const hN3: Primitive = {
  id: 'energy-level.h.n3',
  family: 'energy-level',
  name: 'H n=3',
  symbol: '3',
  attrs: {
    n: 3,
    energyEV: -1.5109,
    energyCm1: -12186.4,
  },
  sourceId: SOURCE.id,
  retrievedAt: '2026-05-04',
}

describe('renderEnergyLevel', () => {
  it('produces an SVG document', () => {
    expect(renderEnergyLevel(hN3, ctx).startsWith('<svg')).toBe(true)
  })

  it('formats the energy in eV when present', () => {
    expect(renderEnergyLevel(hN3, ctx)).toContain('-1.5109 eV')
  })

  it('renders a SCHEMATIC badge when energyEV is missing', () => {
    const schematic: Primitive = {
      id: 'energy-level.he.2-3p',
      family: 'energy-level',
      name: 'He 2³P',
      symbol: '2³P',
      attrs: { termSymbol: '2³P', schematic: true },
      sourceId: SOURCE.id,
      retrievedAt: '2026-05-04',
    }
    expect(renderEnergyLevel(schematic, ctx)).toContain('SCHEMATIC')
  })

  it('does not throw on a level with only a term symbol', () => {
    const minimal: Primitive = {
      id: 'energy-level.x.y',
      family: 'energy-level',
      name: 'unknown level',
      attrs: { termSymbol: '?' },
      sourceId: SOURCE.id,
      retrievedAt: '2026-05-04',
    }
    expect(() => renderEnergyLevel(minimal, ctx)).not.toThrow()
  })
})
