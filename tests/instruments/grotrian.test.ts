/**
 * Grotrian instrument tests.
 *
 * Two layers:
 *   1. Pure-physics correctness — E_n closed form, unit conversions, series
 *      mapping. These are the math contracts the diagram relies on.
 *   2. DOM-mount behavior — clicking an arrow updates the store, and changes
 *      to `selection` from outside re-render the highlight.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from '../../src/store'
import {
  mountGrotrian,
  hydrogenTermStateFromN,
  classifyTransition,
} from '../../src/instruments/grotrian'
import {
  RYDBERG_EV,
  EV_TO_CM1,
  EV_TO_HZ,
  HC_EV_NM,
  hydrogenLevelEnergy_eV,
  eVToCm1,
  eVToHz,
  eVToNm,
  formatEnergy,
} from '../../src/instruments/grotrian/physics'
import {
  isHydrogenNToNLine,
  seriesForHydrogenLine,
  buildArrows,
  buildLevels,
} from '../../src/instruments/grotrian/layout'
import { elements } from '../../src/data'
import { createFireBus } from '../../src/store/fire-bus'
import type { EmissionLine } from '../../src/data/types'

describe('Grotrian — physics: E_n = -13.6/n²', () => {
  it('n=1 gives the ground-state energy −13.6 eV', () => {
    expect(hydrogenLevelEnergy_eV(1)).toBeCloseTo(-13.6, 6)
  })

  it('n=2 gives −3.4 eV (Balmer-floor / Lyman-α upper)', () => {
    expect(hydrogenLevelEnergy_eV(2)).toBeCloseTo(-3.4, 6)
  })

  it('n=3 gives −1.5111 eV', () => {
    expect(hydrogenLevelEnergy_eV(3)).toBeCloseTo(-13.6 / 9, 6)
  })

  it('n=4 gives −0.85 eV', () => {
    expect(hydrogenLevelEnergy_eV(4)).toBeCloseTo(-0.85, 6)
  })

  it('n=5 gives −0.544 eV', () => {
    expect(hydrogenLevelEnergy_eV(5)).toBeCloseTo(-13.6 / 25, 6)
  })

  it('rejects non-integer or non-positive n', () => {
    expect(() => hydrogenLevelEnergy_eV(0)).toThrow()
    expect(() => hydrogenLevelEnergy_eV(-1)).toThrow()
    expect(() => hydrogenLevelEnergy_eV(2.5)).toThrow()
  })
})

describe('Grotrian — energy unit conversions', () => {
  it('1 eV in cm⁻¹ matches the canonical 8065.544', () => {
    expect(eVToCm1(1)).toBeCloseTo(EV_TO_CM1, 6)
  })

  it('1 eV in Hz matches the canonical 2.418×10¹⁴', () => {
    expect(eVToHz(1)).toBeCloseTo(EV_TO_HZ, 6)
  })

  it('round-trip eV → nm uses λ = 1239.842 / |E|', () => {
    expect(eVToNm(1)).toBeCloseTo(HC_EV_NM, 6)
    expect(eVToNm(-RYDBERG_EV)).toBeCloseTo(HC_EV_NM / RYDBERG_EV, 6)
  })

  it('eV → nm at zero energy is +Infinity (ionization edge)', () => {
    expect(eVToNm(0)).toBe(Infinity)
  })

  it('formatEnergy renders each unit with sensible precision', () => {
    expect(formatEnergy(-13.6, 'eV')).toBe('-13.60 eV')
    expect(formatEnergy(-13.6, 'cm-1')).toMatch(/cm⁻¹$/)
    expect(formatEnergy(-13.6, 'Hz')).toMatch(/Hz$/)
    expect(formatEnergy(-13.6, 'nm')).toMatch(/nm$/)
    expect(formatEnergy(0, 'nm')).toBe('∞ nm')
  })
})

describe('Grotrian — series-from-line-data mapping', () => {
  it('keeps only n→n′ hydrogen lines (drops the 21cm hyperfine entry)', () => {
    const all = elements.H.lines
    const filtered = all.filter(isHydrogenNToNLine)
    expect(filtered.length).toBeLessThan(all.length)
    expect(filtered.every((l) => Number.isInteger(l.upper) && Number.isInteger(l.lower))).toBe(true)
  })

  it('routes lines to series by lower-n: 1→Lyman, 2→Balmer, 3→Paschen, 4→Brackett, 5→Pfund', () => {
    const lines = elements.H.lines.filter(isHydrogenNToNLine)
    for (const line of lines) {
      const sn = seriesForHydrogenLine(line)
      switch (line.lower) {
        case 1:
          expect(sn).toBe('Lyman')
          break
        case 2:
          expect(sn).toBe('Balmer')
          break
        case 3:
          expect(sn).toBe('Paschen')
          break
        case 4:
          expect(sn).toBe('Brackett')
          break
        case 5:
          expect(sn).toBe('Pfund')
          break
        default:
          expect(sn).toBeNull()
      }
    }
  })

  it('places arrows into the geometry without throwing and yields one Arrow per H n→n′ line', () => {
    const hLines = elements.H.lines.filter(isHydrogenNToNLine)
    const arrows = buildArrows(hLines, {
      padL: 100,
      padR: 60,
      padTop: 30,
      innerW: 640,
      innerH: 260,
      Emin_eV: -13.6,
      Emax_eV: 0,
      width: 800,
    })
    expect(arrows.length).toBe(hLines.length)
    // every arrow's yUp must be above (smaller y) than yDn (since upper energy
    // is higher → smaller |E| → closer to top of canvas)
    for (const a of arrows) {
      expect(a.yUp).toBeLessThanOrEqual(a.yDn)
    }
  })

  it('builds 7 levels for n=1..7 with monotonically decreasing y as n grows', () => {
    const levels = buildLevels(7, -13.6, 0, 260, 30)
    expect(levels.length).toBe(7)
    for (let i = 1; i < levels.length; i++) {
      // n increases → energy increases (closer to 0) → y decreases (top of canvas)
      expect(levels[i].y).toBeLessThan(levels[i - 1].y)
    }
  })
})

describe('Grotrian — TermState construction from H principal n', () => {
  it('constructs a hydrogenic TermState whose energy obeys E_n = -13.6/n²', () => {
    const t = hydrogenTermStateFromN(4)
    expect(t.n).toBe(4)
    expect(t.l).toBe(0)
    expect(t.s).toBe(0.5)
    expect(t.j).toBe(0.5)
    expect(t.electronConfig).toBe('4s¹')
    expect(t.termSymbol).toBe('²S₁/₂')
    expect(t.energy_eV).toBeCloseTo(-13.6 / 16, 6)
  })
})

describe('Grotrian — DOM mount behavior', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('renders an SVG with horizontal level lines and at least one arrow group', () => {
    const store = createStore()
    const teardown = mountGrotrian(container, store)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(container.querySelectorAll('[data-grotrian-arrow]').length).toBeGreaterThan(0)
    teardown()
  })

  it('clicking an arrow updates store.selection.upper.n and lower.n', () => {
    const store = createStore()
    const teardown = mountGrotrian(container, store)
    // pick the Hα arrow (3 → 2)
    const arrow = container.querySelector('[data-grotrian-arrow="3-2"]') as SVGGElement | null
    expect(arrow).not.toBeNull()
    arrow!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const sel = store.getState().selection
    expect(sel.element).toBe('H')
    expect(sel.upper.n).toBe(3)
    expect(sel.lower.n).toBe(2)
    expect(sel.upper.l).toBe(1)
    expect(sel.lower.l).toBe(0)
    expect(sel.upper.energy_eV).toBeCloseTo(-13.6 / 9, 6)
    teardown()
  })

  it('clicking the Hα arrow sets selection.line to the matching LineSelection', () => {
    const store = createStore()
    const teardown = mountGrotrian(container, store)
    const arrow = container.querySelector('[data-grotrian-arrow="3-2"]') as SVGGElement | null
    expect(arrow).not.toBeNull()
    arrow!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const sel = store.getState().selection
    expect(sel.line).not.toBeNull()
    expect(sel.line!.id).toBe('H/656.281')
    teardown()
  })

  it('selection-highlight responds to store changes (external setState)', () => {
    const store = createStore()
    const teardown = mountGrotrian(container, store)

    // Drive the store from outside the instrument (Lyman α: 2 → 1)
    store.setState((s) => ({
      ...s,
      selection: {
        ...s.selection,
        element: 'H',
        upper: hydrogenTermStateFromN(2),
        lower: hydrogenTermStateFromN(1),
        line: null,
      },
    }))

    const active = container.querySelector('[data-grotrian-arrow="2-1"]')
    const inactive = container.querySelector('[data-grotrian-arrow="3-2"]')
    expect(active).not.toBeNull()
    expect(inactive).not.toBeNull()
    const activeOpacity = Number(active!.getAttribute('opacity') ?? '1')
    const inactiveOpacity = Number(inactive!.getAttribute('opacity') ?? '1')
    expect(activeOpacity).toBeGreaterThan(inactiveOpacity)
    teardown()
  })

  it('non-hydrogen elements show the v2-deferred placeholder card', () => {
    const store = createStore()
    const teardown = mountGrotrian(container, store)
    // Suite scope keeps H as the active element; He pill is disabled in v1 UI.
    store.setState((s) => ({
      ...s,
      selection: { ...s.selection, element: 'He', line: null },
    }))
    expect(container.querySelector('svg')).toBeNull()
    expect(container.textContent).toMatch(/multi-electron Grotrian deferred to v2/)
    teardown()
  })

  it('mutes non-matching arrows when selection.line names a hydrogen line (focus mode)', () => {
    const store = createStore()
    const teardown = mountGrotrian(container, store)
    // Hα is the canonical 3 → 2 hydrogen line at 656.281 nm.
    store.setState((s) => ({
      ...s,
      selection: {
        ...s.selection,
        element: 'H',
        line: {
          id: 'H/656.281',
          element: 'H',
          wavelength_nm: 656.281,
          label: 'Hα',
          transition: 'n=3 → 2',
        },
      },
    }))
    const focused = container.querySelector('[data-grotrian-arrow="3-2"]')
    const other = container.querySelector('[data-grotrian-arrow="2-1"]')
    expect(focused).not.toBeNull()
    expect(other).not.toBeNull()
    const focusedOpacity = Number(focused!.getAttribute('opacity') ?? '1')
    const otherOpacity = Number(other!.getAttribute('opacity') ?? '1')
    expect(focusedOpacity).toBeGreaterThan(0.9)
    expect(otherOpacity).toBeLessThan(0.2)
    teardown()
  })

  it('shows every arrow at full opacity when no line is focused', () => {
    const store = createStore()
    store.setState((s) => ({ ...s, selection: { ...s.selection, line: null } }))
    const teardown = mountGrotrian(container, store)
    expect(store.getState().selection.line).toBeNull()
    // The default selection highlights 3-2 (active), but all OTHER arrows should
    // not be muted to the focus-mode 0.12 floor — they sit at the active-mode
    // 0.28 mute or 1.0 (when no active arrow at all). The contract here:
    // every visible arrow is well above the focus-mode floor.
    const arrows = container.querySelectorAll('[data-grotrian-arrow]')
    expect(arrows.length).toBeGreaterThan(0)
    for (const a of arrows) {
      const op = Number(a.getAttribute('opacity') ?? '1')
      expect(op).toBeGreaterThan(0.12)
    }
    teardown()
  })

  it('teardown unsubscribes and clears the DOM', () => {
    const store = createStore()
    const teardown = mountGrotrian(container, store)
    expect(container.children.length).toBeGreaterThan(0)
    teardown()
    expect(container.children.length).toBe(0)

    // After teardown, store updates should not cause errors or DOM mutations.
    store.setState((s) => ({
      ...s,
      selection: {
        ...s.selection,
        element: 'H',
        upper: hydrogenTermStateFromN(5),
        lower: hydrogenTermStateFromN(2),
      },
    }))
    expect(container.children.length).toBe(0)
  })
})

describe('Grotrian — pedagogical caption + dashed lines + fire pulse', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('renders the E_n formula caption with the canonical −13.6058 eV constant', () => {
    const store = createStore()
    const teardown = mountGrotrian(container, store)
    const caption = container.querySelector('[data-role="formula"]')
    expect(caption).not.toBeNull()
    expect(caption!.textContent).toContain('−13.6058')
    teardown()
  })

  it('updates the ΔE display when the store selection changes', () => {
    const store = createStore()
    const teardown = mountGrotrian(container, store)
    // Drive a Lyman-α selection (n=2 → n=1).
    store.setState((s) => ({
      ...s,
      selection: {
        ...s.selection,
        element: 'H',
        upper: hydrogenTermStateFromN(2),
        lower: hydrogenTermStateFromN(1),
      },
    }))
    const dE = container.querySelector('[data-role="delta-e"]')
    expect(dE).not.toBeNull()
    // E_2 − E_1 = −3.4 − (−13.6) = 10.2 eV
    expect(dE!.textContent).toContain('10.2000')
    teardown()
  })

  it('renders a dashed arrow when the source line is marked transitionType:forbidden', () => {
    // Patch the H 2→1 line to be forbidden for the duration of this test.
    const lyAlpha = elements.H.lines.find((l) => l.upper === 2 && l.lower === 1) as
      | EmissionLine
      | undefined
    expect(lyAlpha).toBeDefined()
    const original = lyAlpha!.transitionType
    ;(lyAlpha as { transitionType?: EmissionLine['transitionType'] }).transitionType = 'forbidden'
    try {
      const store = createStore()
      const teardown = mountGrotrian(container, store)
      const group = container.querySelector('[data-grotrian-arrow="2-1"]')
      expect(group).not.toBeNull()
      const stroke = group!.querySelector('[data-role="arrow-stroke"]')
      expect(stroke).not.toBeNull()
      expect(stroke!.getAttribute('stroke-dasharray')).toBe('4 3')
      expect(group!.getAttribute('data-transition-type')).toBe('forbidden')
      teardown()
    } finally {
      ;(lyAlpha as { transitionType?: EmissionLine['transitionType'] }).transitionType = original
    }
  })

  it('classifyTransition reports a forbidden M1 line with its declared kind', () => {
    const m1Line: EmissionLine = {
      element: 'H',
      wavelength_nm: 211060000,
      label: 'HI 21 cm',
      transition: 'F=1 → 0 (hyperfine)',
      series: 'hyperfine',
      transitionType: 'M1',
    }
    const verdict = classifyTransition(m1Line)
    expect(verdict.dashed).toBe('M1')
  })

  it('pulses the matching arrow when the fire bus emits', () => {
    vi.useFakeTimers()
    try {
      const bus = createFireBus()
      const store = createStore()
      // Default selection is 3 → 2 (Hα).
      const teardown = mountGrotrian(container, store, { bus })
      const arrow = container.querySelector('[data-grotrian-arrow="3-2"]')
      expect(arrow).not.toBeNull()
      expect(arrow!.classList.contains('grotrian-pulse')).toBe(false)
      bus.emit()
      // Advance a tick so any microtask scheduling has resolved.
      vi.advanceTimersByTime(50)
      expect(arrow!.classList.contains('grotrian-pulse')).toBe(true)
      // After the 800ms keyframe the class is cleared.
      vi.advanceTimersByTime(800)
      expect(arrow!.classList.contains('grotrian-pulse')).toBe(false)
      teardown()
    } finally {
      vi.useRealTimers()
    }
  })

  it('switching the energy unit updates the formula display label', () => {
    const store = createStore()
    const teardown = mountGrotrian(container, store)
    const cm1Pill = container.querySelector('button[data-unit="cm-1"]') as HTMLButtonElement | null
    expect(cm1Pill).not.toBeNull()
    cm1Pill!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const formula = container.querySelector('[data-role="formula"]')
    expect(formula).not.toBeNull()
    expect(formula!.textContent).toContain('cm⁻¹')
    const unitTag = container.querySelector('[data-role="formula-unit"]')
    expect(unitTag!.textContent).toContain('cm⁻¹')
    teardown()
  })
})
