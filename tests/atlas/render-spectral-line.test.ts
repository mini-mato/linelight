import { describe, expect, it } from 'vitest'
import { renderSpectralLine } from '../../src/atlas/render/spectral-line'
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

const halpha: Primitive = {
  id: 'spectral-line.h.h-alpha',
  family: 'spectral-line',
  name: 'H Balmer α (n=3 → 2)',
  symbol: 'Hα',
  attrs: {
    wavelengthVacuumNm: 656.281,
    transitionType: 'E1',
    seriesId: 'series.h.balmer',
  },
  sourceId: SOURCE.id,
  retrievedAt: '2026-05-04',
}

describe('renderSpectralLine', () => {
  it('produces an SVG document', () => {
    expect(renderSpectralLine(halpha, ctx).startsWith('<svg')).toBe(true)
  })

  it('renders the wavelength label', () => {
    expect(renderSpectralLine(halpha, ctx)).toContain('656.281 nm')
  })

  it('marks UV-band lines as off-band', () => {
    const ly: Primitive = {
      ...halpha,
      id: 'spectral-line.h.ly-alpha',
      name: 'H Lyman α',
      attrs: { wavelengthVacuumNm: 121.567, transitionType: 'E1' },
    }
    expect(renderSpectralLine(ly, ctx)).toContain('UV')
  })

  it('falls back to E1 when transitionType is omitted', () => {
    const noType: Primitive = {
      ...halpha,
      attrs: { wavelengthVacuumNm: 500 },
    }
    expect(() => renderSpectralLine(noType, ctx)).not.toThrow()
  })
})
