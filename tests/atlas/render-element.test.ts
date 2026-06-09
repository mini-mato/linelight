import { describe, expect, it } from 'vitest'
import { renderElement } from '../../src/atlas/render/element'
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

const hydrogen: Primitive = {
  id: 'element.h',
  family: 'element',
  name: 'hydrogen',
  symbol: 'H',
  attrs: {
    z: 1,
    groundConfig: '1s¹',
    groundTerm: '²S_{1/2}',
    ionizationEnergyEV: 13.598,
  },
  sourceId: SOURCE.id,
  retrievedAt: '2026-05-04',
}

describe('renderElement', () => {
  it('produces an SVG document', () => {
    expect(renderElement(hydrogen, ctx).startsWith('<svg')).toBe(true)
  })

  it('includes the element name in the output', () => {
    expect(renderElement(hydrogen, ctx)).toContain('hydrogen')
  })

  it('includes the ionization energy when present', () => {
    expect(renderElement(hydrogen, ctx)).toContain('IP =')
  })

  it('does not throw on a heavy element with only z + name', () => {
    const minimal: Primitive = {
      id: 'element.hg',
      family: 'element',
      name: 'mercury',
      symbol: 'Hg',
      attrs: { z: 80 },
      sourceId: SOURCE.id,
      retrievedAt: '2026-05-04',
    }
    expect(() => renderElement(minimal, ctx)).not.toThrow()
  })
})
