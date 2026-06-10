/**
 * Spectrum Bar — instrument tests.
 *
 * Covers the pure helpers (scale, gradient, filter) and the DOM-mounting
 * orchestrator's contract: store sync, click-updates-element, teardown.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { createStore } from '../../src/store'
import {
  formatWavelength,
  positionPercent,
  axisTicks,
  inBand,
  LOG_MIN_NM,
  LOG_MAX_NM,
} from '../../src/instruments/spectrum-bar/scale'
import { buildGradientStops } from '../../src/instruments/spectrum-bar/gradient'
import {
  PILLS,
  allPillsActive,
  pillForLine,
  togglePill,
  visibleLines,
} from '../../src/instruments/spectrum-bar/filter'
import { mountSpectrumBar } from '../../src/instruments/spectrum-bar'
import { allLines } from '../../src/data'
import { createFireBus } from '../../src/store/fire-bus'
import type { EmissionLine } from '../../src/data/types'

// ----- fixtures -----

const hAlpha: EmissionLine = {
  element: 'H',
  wavelength_nm: 656.279,
  label: 'Hα',
  transition: 'n=3 → 2',
  series: 'Balmer',
}

const naD2: EmissionLine = {
  element: 'Na',
  wavelength_nm: 588.995,
  label: 'D₂',
  transition: '3²P₃/₂ → 3²S₁/₂',
  series: 'fine-structure',
}

const ohRadio: EmissionLine = {
  element: 'OH',
  wavelength_nm: 1.8e8,
  label: 'OH 18 cm',
  transition: 'Λ-doubling',
  series: 'OH',
}

// ----- scale helpers -----

describe('scale.positionPercent', () => {
  it('places the visible-band start at 0 % in linear mode', () => {
    expect(positionPercent(380, 'visible')).toBe(0)
  })

  it('places the visible-band end at 100 % in linear mode', () => {
    expect(positionPercent(750, 'visible')).toBe(100)
  })

  it('places 1 pm at the left edge of the log axis', () => {
    expect(positionPercent(LOG_MIN_NM, 'full-em-log')).toBeCloseTo(0, 6)
  })

  it('places 1 m at the right edge of the log axis', () => {
    expect(positionPercent(LOG_MAX_NM, 'full-em-log')).toBeCloseTo(100, 6)
  })

  it('places 1 nm at decade 3 of 12 on the log axis', () => {
    // log10(1) = 0; window is [-3, 9]; (0 - -3) / 12 = 0.25 → 25 %
    expect(positionPercent(1, 'full-em-log')).toBeCloseTo(25, 6)
  })
})

describe('scale.formatWavelength', () => {
  it('uses pm below 1 nm', () => {
    expect(formatWavelength(0.00243)).toMatch(/pm$/)
  })

  it('uses nm in the visible window', () => {
    expect(formatWavelength(656.279)).toMatch(/nm$/)
  })

  it('uses μm above 1 micrometer', () => {
    expect(formatWavelength(4670)).toMatch(/μm$/)
  })

  it('uses mm above 1 millimeter', () => {
    expect(formatWavelength(2.6e6)).toMatch(/mm$/)
  })

  it('uses m at the right edge of the log axis', () => {
    expect(formatWavelength(1.8e8)).toMatch(/m$/)
  })
})

describe('scale.axisTicks', () => {
  it('emits 8 ticks across the log axis', () => {
    expect(axisTicks('full-em-log')).toHaveLength(8)
  })

  it('emits 8 ticks across the visible axis (400..750 by 50)', () => {
    expect(axisTicks('visible')).toHaveLength(8)
  })
})

describe('scale.inBand', () => {
  it('keeps Hα in the visible band', () => {
    expect(inBand(656.279, 'visible')).toBe(true)
  })

  it('rejects 21 cm from the visible band', () => {
    expect(inBand(2.1e8, 'visible')).toBe(false)
  })

  it('keeps 21 cm in the full-EM-log band', () => {
    expect(inBand(2.1e8, 'full-em-log')).toBe(true)
  })
})

// ----- gradient -----

describe('gradient.buildGradientStops', () => {
  it('spans 0 % to 100 % in visible mode (CIE pipeline)', () => {
    const stops = buildGradientStops('visible', 'cie1931')
    expect(stops[0].pct).toBe(0)
    expect(stops[stops.length - 1].pct).toBe(100)
  })

  it('emits the same number of stops across all three pipelines (visible)', () => {
    const cie = buildGradientStops('visible', 'cie1931')
    const bruton = buildGradientStops('visible', 'bruton1996')
    const mono = buildGradientStops('visible', 'monochrome')
    expect(cie).toHaveLength(bruton.length)
    expect(cie).toHaveLength(mono.length)
  })

  it('produces a different color sequence across CIE vs Bruton (visible)', () => {
    const cie = buildGradientStops('visible', 'cie1931')
    const bruton = buildGradientStops('visible', 'bruton1996')
    const cieColors = cie.map((s) => s.color).join('|')
    const brutonColors = bruton.map((s) => s.color).join('|')
    expect(cieColors).not.toBe(brutonColors)
  })

  it('returns equal-channel hex codes for monochrome (visible)', () => {
    const mono = buildGradientStops('visible', 'monochrome')
    // each stop hex is #rrggbb with rr == gg == bb (modulo rounding)
    for (const stop of mono) {
      const m = stop.color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/)
      expect(m).not.toBeNull()
      if (m) expect(m[1]).toBe(m[2])
      if (m) expect(m[2]).toBe(m[3])
    }
  })

  it('paints the visible window only, with black flanks, in full-EM-log mode', () => {
    const stops = buildGradientStops('full-em-log', 'cie1931')
    expect(stops[0].color).toBe('#000000')
    expect(stops[stops.length - 1].color).toBe('#000000')
    // somewhere in the middle there must be a non-black sample
    const someColored = stops.some((s) => s.color !== '#000000')
    expect(someColored).toBe(true)
  })
})

// ----- filter -----

describe('filter.pillForLine', () => {
  it('routes hydrogen lines to the H pill', () => {
    expect(pillForLine(hAlpha)).toBe('H')
  })

  it('routes sodium D₂ to the Na pill', () => {
    expect(pillForLine(naD2)).toBe('Na')
  })

  it('routes OH 18 cm (non-primary element) to the survey pill', () => {
    expect(pillForLine(ohRadio)).toBe('survey')
  })
})

describe('filter.visibleLines', () => {
  it('returns all lines when every pill is active', () => {
    const filtered = visibleLines(allLines, allPillsActive())
    expect(filtered.length).toBe(allLines.length)
  })

  it('drops sodium when the Na pill is toggled off', () => {
    const active = togglePill(allPillsActive(), 'Na')
    const filtered = visibleLines(allLines, active)
    expect(filtered.every((l) => l.element !== 'Na')).toBe(true)
  })

  it('drops every survey line when the survey pill is toggled off', () => {
    const active = togglePill(allPillsActive(), 'survey')
    const filtered = visibleLines(allLines, active)
    expect(filtered.every((l) => pillForLine(l) !== 'survey')).toBe(true)
  })

  it('returns no lines when every pill is off', () => {
    let active = allPillsActive()
    for (const p of PILLS) active = togglePill(active, p)
    expect(visibleLines(allLines, active)).toHaveLength(0)
  })
})

describe('filter.togglePill', () => {
  it('removes a pill that was active', () => {
    const next = togglePill(allPillsActive(), 'H')
    expect(next.has('H')).toBe(false)
  })

  it('adds a pill that was inactive', () => {
    const off = togglePill(allPillsActive(), 'H')
    const on = togglePill(off, 'H')
    expect(on.has('H')).toBe(true)
  })
})

// ----- mount: orchestrator contract -----

describe('mountSpectrumBar', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  it('renders the scaffold (band + axis + pills)', () => {
    const store = createStore()
    mountSpectrumBar(container, store)
    expect(container.querySelector('[data-role="band"]')).not.toBeNull()
    expect(container.querySelector('[data-role="axis"]')).not.toBeNull()
    expect(container.querySelector('[data-role="pills"]')).not.toBeNull()
  })

  it('renders one DOM line per visible-band, all-pills-active line on first paint', () => {
    const store = createStore()
    mountSpectrumBar(container, store)
    const lineEls = container.querySelectorAll('[data-role="lines"] [data-line]')
    // every line in `allLines` between 380 and 750 nm
    const expected = allLines.filter((l) => l.wavelength_nm >= 380 && l.wavelength_nm <= 750)
    expect(lineEls.length).toBe(expected.length)
  })

  it('highlights a non-suite line without switching the hydrogen suite element', () => {
    const store = createStore()
    mountSpectrumBar(container, store)
    const naLine = container.querySelector<HTMLElement>(
      '[data-role="lines"] [data-line*="588.995"]',
    )
    expect(naLine).not.toBeNull()
    naLine!.click()
    expect(store.getState().selection.element).toBe('H')
    expect(store.getState().selection.line?.element).toBe('Na')
  })

  it('teardown removes the rendered scaffold and stops responding to store changes', () => {
    const store = createStore()
    const teardown = mountSpectrumBar(container, store)
    teardown()
    expect(container.innerHTML).toBe('')
    // Mutating the store after teardown must not throw.
    store.setState((s) => ({
      ...s,
      display: { ...s.display, modes: { ...s.display.modes, colorPipeline: 'monochrome' } },
    }))
    expect(container.innerHTML).toBe('')
  })

  it('re-renders the bar background when the color pipeline changes', () => {
    const store = createStore()
    mountSpectrumBar(container, store)
    const band = container.querySelector<HTMLDivElement>('[data-role="band"]')!
    const before = band.style.background
    store.setState((s) => ({
      ...s,
      display: { ...s.display, modes: { ...s.display.modes, colorPipeline: 'monochrome' } },
    }))
    // The orchestrator either repaints `band` or `gradient` depending on display mode;
    // after a pipeline flip at least one of them must change.
    const after = band.style.background
    const gradientAfter =
      container.querySelector<HTMLDivElement>('[data-role="gradient"]')!.style.background
    const changed = after !== before || gradientAfter !== ''
    expect(changed).toBe(true)
  })

  // ----- line-isolation focus mode -----

  it('renders every visible line at full opacity when no line is focused', () => {
    const store = createStore()
    store.setState((s) => ({ ...s, selection: { ...s.selection, line: null } }))
    mountSpectrumBar(container, store)
    const lineEls = container.querySelectorAll<HTMLElement>('[data-role="lines"] [data-line]')
    expect(lineEls.length).toBeGreaterThan(0)
    for (const el of lineEls) {
      const op = parseFloat(el.style.opacity)
      // Default emission opacity is 0.95 — well above the 0.12 muted threshold.
      expect(op).toBeGreaterThan(0.5)
    }
  })

  it('emphasizes the focused line and dims non-matches when selection.line is set', () => {
    const store = createStore()
    mountSpectrumBar(container, store)
    // Focus Hα (656.281 nm hydrogen).
    store.setState((s) => ({
      ...s,
      selection: {
        ...s.selection,
        line: {
          id: 'H/656.281',
          element: 'H',
          wavelength_nm: 656.281,
          label: 'Hα',
          transition: 'n=3 → 2',
        },
      },
    }))
    const matching = container.querySelector<HTMLElement>(
      '[data-role="lines"] [data-line*="656.281"]',
    )
    const nonMatching = container.querySelector<HTMLElement>(
      '[data-role="lines"] [data-line*="588.995"]',
    )
    expect(matching).not.toBeNull()
    expect(nonMatching).not.toBeNull()
    const matchOp = parseFloat(matching!.style.opacity)
    const otherOp = parseFloat(nonMatching!.style.opacity)
    expect(matchOp).toBeGreaterThan(otherOp)
  })

  it('clears selection.line when the empty band background is clicked', () => {
    const store = createStore()
    mountSpectrumBar(container, store)
    // Pre-set a focus, then click the band background (NOT a line).
    store.setState((s) => ({
      ...s,
      selection: {
        ...s.selection,
        line: {
          id: 'H/656.281',
          element: 'H',
          wavelength_nm: 656.281,
          label: 'Hα',
          transition: 'n=3 → 2',
        },
      },
    }))
    expect(store.getState().selection.line).not.toBeNull()
    const band = container.querySelector<HTMLDivElement>('[data-role="band"]')!
    band.click()
    expect(store.getState().selection.line).toBeNull()
  })

  it('populates upper/lower TermStates when clicking a parseable hydrogen line', () => {
    const store = createStore()
    mountSpectrumBar(container, store)
    // Hα has transition "n=3 → 2" — the parser resolves this.
    const haLine = container.querySelector<HTMLElement>(
      '[data-role="lines"] [data-line*="656.281"]',
    )
    expect(haLine).not.toBeNull()
    haLine!.click()
    const sel = store.getState().selection
    expect(sel.line).not.toBeNull()
    expect(sel.line!.element).toBe('H')
    expect(sel.line!.wavelength_nm).toBe(656.281)
    expect(sel.element).toBe('H')
    expect(sel.upper.n).toBe(3)
    expect(sel.lower.n).toBe(2)
    expect(sel.upper.l).toBe(1)
    expect(sel.lower.l).toBe(0)
    expect(sel.upper.m).toBe(0)
  })

  // ----- pedagogical content: tooltip cultural context, pulse, strip -----

  it("renders the focused line's cultural context in the tooltip on hover", () => {
    const store = createStore()
    mountSpectrumBar(container, store)
    const tooltip = container.querySelector<HTMLDivElement>('[data-role="tooltip"]')!
    const haLine = container.querySelector<HTMLElement>(
      '[data-role="lines"] [data-line*="656.281"]',
    )!
    haLine.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0, clientY: 0 }))
    expect(tooltip.textContent).toContain('the red glow of star-forming nebulae')
  })

  it('omits the italic cultural row in the tooltip for lines with no cultural context', () => {
    const store = createStore()
    mountSpectrumBar(container, store)
    const tooltip = container.querySelector<HTMLDivElement>('[data-role="tooltip"]')!
    // Hδ (410.174 nm) carries no `culturalContext` — its tooltip must not render the italic row.
    const hDelta = container.querySelector<HTMLElement>(
      '[data-role="lines"] [data-line*="410.174"]',
    )!
    hDelta.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0, clientY: 0 }))
    expect(tooltip.querySelector('[data-role="tooltip-cultural"]')).toBeNull()
  })

  it('elevates the focused line style transiently on a fire-bus pulse', () => {
    // Drive `requestAnimationFrame` synchronously so the pulse animation
    // produces a deterministic, observable side effect inside this test —
    // jsdom's default rAF dispatch is async and slower than a 5 s timeout.
    const realRaf = globalThis.requestAnimationFrame
    const realCancel = globalThis.cancelAnimationFrame
    const realNow = performance.now.bind(performance)
    let mockTime = 1000
    const queue: FrameRequestCallback[] = []
    let nextHandle = 1
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      queue.push(cb)
      return nextHandle++
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame
    performance.now = () => mockTime

    try {
      const store = createStore()
      const bus = createFireBus()
      mountSpectrumBar(container, store, { bus })
      store.setState((s) => ({
        ...s,
        selection: {
          ...s.selection,
          line: {
            id: 'H/656.281',
            element: 'H',
            wavelength_nm: 656.281,
            label: 'Hα',
            transition: 'n=3 → 2',
          },
        },
      }))
      const target = container.querySelector<HTMLElement>(
        '[data-role="lines"] [data-line*="656.281"]',
      )!
      bus.emit()
      // First frame at t=0 — bootstrap; advance to peak (t=200) and step once.
      const first = queue.shift()!
      mockTime = 1000
      first(mockTime)
      const second = queue.shift()!
      mockTime = 1200
      second(mockTime)
      // At peak, width is 4 px and box-shadow blur is 12 px.
      expect(parseFloat(target.style.width)).toBeCloseTo(4, 5)
      expect(target.style.boxShadow).toContain('12')
    } finally {
      globalThis.requestAnimationFrame = realRaf
      globalThis.cancelAnimationFrame = realCancel
      performance.now = realNow
    }
  })

  it('is a no-op for fire-bus emits when no line is focused', () => {
    const store = createStore()
    store.setState((s) => ({ ...s, selection: { ...s.selection, line: null } }))
    const bus = createFireBus()
    mountSpectrumBar(container, store, { bus })
    expect(store.getState().selection.line).toBeNull()
    const linesHTMLBefore = container.querySelector('[data-role="lines"]')!.innerHTML
    expect(() => bus.emit()).not.toThrow()
    const linesHTMLAfter = container.querySelector('[data-role="lines"]')!.innerHTML
    expect(linesHTMLAfter).toBe(linesHTMLBefore)
  })
})
