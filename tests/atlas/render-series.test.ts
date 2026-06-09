import { describe, expect, it } from 'vitest'
import { renderSeries } from '../../src/atlas/render/series'
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

const balmer: Primitive = {
  id: 'series.h.balmer',
  family: 'series',
  name: 'Balmer series',
  symbol: 'H',
  attrs: {
    elementId: 'element.h',
    lowerN: 2,
    region: 'UV+visible',
    seriesLimitWavelengthNm: 364.705,
    namedAfter: 'Johann Balmer, 1885',
    memberLineIds: ['spectral-line.h.h-alpha', 'spectral-line.h.h-beta'],
  },
  sourceId: SOURCE.id,
  retrievedAt: '2026-05-04',
}

describe('renderSeries', () => {
  it('produces an SVG document', () => {
    expect(renderSeries(balmer, ctx).startsWith('<svg')).toBe(true)
  })

  it('shows the lower-n label', () => {
    expect(renderSeries(balmer, ctx)).toContain('n_low = 2')
  })

  it('shows the series-limit wavelength', () => {
    expect(renderSeries(balmer, ctx)).toContain('364.7')
  })

  it('does not throw on a series with only a name', () => {
    const minimal: Primitive = {
      id: 'series.x.y',
      family: 'series',
      name: 'placeholder series',
      attrs: {},
      sourceId: SOURCE.id,
      retrievedAt: '2026-05-04',
    }
    expect(() => renderSeries(minimal, ctx)).not.toThrow()
  })
})
