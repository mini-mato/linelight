/**
 * Atom View 2D — instrument tests.
 *
 * Three layers, mirroring the Grotrian test discipline:
 *   1. Pure functions: colormap math, caption formatting.
 *   2. Field-sampling sanity: adaptive box scale.
 *   3. DOM mount behavior: pane structure, re-render on selection,
 *      teardown.
 *
 * jsdom provides a Canvas2D shim; we exercise the public surface and
 * inspect ImageData via getContext('2d') where possible. We don't assert
 * on per-pixel RGB beyond center-pixel alpha — jsdom's Canvas isn't
 * pixel-accurate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from '../../../src/store'
import { mountAtomView2D } from '../../../src/instruments/atom-view/modes/cloud-2d'
import {
  signedThermal,
  ZERO_COLOR,
} from '../../../src/instruments/atom-view/modes/cloud-2d/colormap'
import { sampleField } from '../../../src/instruments/atom-view/modes/cloud-2d/field'
import {
  paneCaption,
  transitionString,
  psiFormula,
  nodeCount,
} from '../../../src/instruments/atom-view/modes/cloud-2d/caption'
import { createFireBus } from '../../../src/store/fire-bus'
import { recommendedBoxHalfExtent_Bohr } from '../../../src/physics/atomic'
import type { TermState } from '../../../src/types'

// Reusable factory for hydrogenic TermStates in tests.
function hState(
  n: number,
  l: number,
  electronConfig: string,
  termSymbol: string,
  energy_eV: number,
): TermState {
  return { n, l, s: 0.5, j: 0.5, electronConfig, termSymbol, energy_eV }
}

describe('Atom View 2D — colormap (signed-thermal)', () => {
  it('maps zero amplitude to white', () => {
    const c = signedThermal(0)
    expect(c.r).toBe(ZERO_COLOR.r)
    expect(c.g).toBe(ZERO_COLOR.g)
    expect(c.b).toBe(ZERO_COLOR.b)
  })

  it('maps positive amplitude to a redder pixel than zero', () => {
    const pos = signedThermal(0.8)
    // Red channel decreases as we leave white toward red endpoint #c2185b.
    // Blue channel decreases more sharply, so red dominates: R > B.
    expect(pos.r).toBeGreaterThan(pos.b)
    expect(pos.r).toBeGreaterThan(pos.g)
  })

  it('maps negative amplitude to a bluer pixel than zero', () => {
    const neg = signedThermal(-0.8)
    // Blue endpoint #1f4ea8: blue dominates over red and green.
    expect(neg.b).toBeGreaterThan(neg.r)
    expect(neg.b).toBeGreaterThan(neg.g)
  })

  it('clamps inputs outside [-1, +1] to the endpoints', () => {
    const a = signedThermal(2)
    const b = signedThermal(1)
    expect(a).toEqual(b)
    const c = signedThermal(-2)
    const d = signedThermal(-1)
    expect(c).toEqual(d)
  })

  it('applies gamma 0.7 — magnitude lifted above linear at small |t|', () => {
    // At t=0.1 with γ=0.7, |t|^0.7 ≈ 0.199, so we expect roughly 20%
    // departure from white, not 10%. Test by checking the red channel is
    // farther from 255 than a linear ramp would predict.
    const c = signedThermal(0.1)
    const linearR = Math.round(255 + (0xc2 - 255) * 0.1) // 230
    expect(c.r).toBeLessThan(linearR)
  })
})

describe('Atom View 2D — caption formatting', () => {
  it('renders the role, n, l, term symbol, and energy in the caption', () => {
    const t = hState(2, 1, '2p¹', '²P₃/₂', -3.4)
    const cap = paneCaption('upper', t)
    expect(cap).toContain('upper')
    expect(cap).toContain('2p')
    expect(cap).toContain('n=2')
    expect(cap).toContain('ℓ=1')
    expect(cap).toContain('²P₃/₂')
    expect(cap).toMatch(/3\.40 eV/)
  })

  it('renders the transition string from upper/lower TermStates', () => {
    const upper = hState(3, 1, '3p¹', '²P₃/₂', -1.51)
    const lower = hState(2, 0, '2s¹', '²S₁/₂', -3.4)
    expect(transitionString(upper, lower)).toBe('3p → 2s')
  })
})

describe('Atom View 2D — adaptive box scaling', () => {
  it('returns a larger half-extent for 3s than for 1s at Z=1', () => {
    const small = recommendedBoxHalfExtent_Bohr(1, 0, 1)
    const big = recommendedBoxHalfExtent_Bohr(3, 0, 1)
    expect(big).toBeGreaterThan(small)
  })

  it('1s field at Z=1 has its peak |ψ| at the center pixel', () => {
    const half = recommendedBoxHalfExtent_Bohr(1, 0, 1)
    const N = 21 // odd so a single center pixel exists
    const field = sampleField({ n: 1, l: 0, Z: 1, halfExtent_Bohr: half, pixelsW: N, pixelsH: N })
    const center = field.data[Math.floor(N / 2) * N + Math.floor(N / 2)]
    expect(Math.abs(center)).toBeCloseTo(field.peak, 6)
  })

  it('honors nonzero m and slice plane when sampling p orbitals', () => {
    const half = recommendedBoxHalfExtent_Bohr(2, 1, 1)
    const N = 41
    const pxOnXz = sampleField({
      n: 2,
      l: 1,
      m: 1,
      Z: 1,
      plane: 'xz',
      halfExtent_Bohr: half,
      pixelsW: N,
      pixelsH: N,
    })
    const pxOnYz = sampleField({
      n: 2,
      l: 1,
      m: 1,
      Z: 1,
      plane: 'yz',
      halfExtent_Bohr: half,
      pixelsW: N,
      pixelsH: N,
    })
    expect(pxOnXz.peak).toBeGreaterThan(0)
    expect(pxOnYz.peak).toBeCloseTo(0, 12)
  })
})

describe('Atom View 2D — mount and teardown', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('mountAtomView2D returns a teardown function', () => {
    const store = createStore()
    const teardown = mountAtomView2D(container, store)
    expect(typeof teardown).toBe('function')
    teardown()
  })

  it('creates exactly two canvas elements (upper + lower panes)', () => {
    const store = createStore()
    const teardown = mountAtomView2D(container, store)
    const canvases = container.querySelectorAll('canvas')
    expect(canvases.length).toBe(2)
    teardown()
  })

  it('default state (H, 3p → 2s) writes ImageData with non-zero alpha to the canvas', () => {
    // jsdom does not implement Canvas2D natively; install a minimal stub so
    // we can verify that the instrument calls putImageData with non-empty
    // pixels. This tests behavior (rendering happens) without coupling to
    // the rendering implementation details.
    const lastImageData: { data: Uint8ClampedArray | null } = { data: null }
    const stubCtx = {
      canvas: null as HTMLCanvasElement | null,
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
      putImageData: (img: ImageData) => {
        lastImageData.data = img.data
      },
      // overlay drawing helpers (axes / ring) — no-ops in the stub
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      arc: () => {},
      strokeStyle: '',
      lineWidth: 0,
    }
    const proto = HTMLCanvasElement.prototype as unknown as {
      getContext: (id: string) => unknown
    }
    const original = proto.getContext
    proto.getContext = function (this: HTMLCanvasElement) {
      stubCtx.canvas = this
      return stubCtx
    }
    try {
      const store = createStore()
      const teardown = mountAtomView2D(container, store)
      // The renderer wrote ImageData; somewhere in those bytes we must
      // see non-zero alpha and at least one non-white pixel (since ψ is
      // non-trivially signed across the field).
      expect(lastImageData.data).not.toBeNull()
      const data = lastImageData.data!
      let nonzeroAlpha = 0
      let nonWhite = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) nonzeroAlpha++
        if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) nonWhite++
      }
      expect(nonzeroAlpha).toBeGreaterThan(0)
      expect(nonWhite).toBeGreaterThan(0)
      teardown()
    } finally {
      proto.getContext = original
    }
  })

  it('captions render with the transition labels for the default selection', () => {
    const store = createStore()
    const teardown = mountAtomView2D(container, store)
    const captions = container.querySelectorAll('[data-role="caption"]')
    expect(captions.length).toBe(2)
    const upperText = captions[0].textContent ?? ''
    const lowerText = captions[1].textContent ?? ''
    // Default selection: upper = 3p, lower = 2s
    expect(upperText).toContain('upper')
    expect(upperText).toContain('3p')
    expect(upperText).toContain('²P₃/₂')
    expect(lowerText).toContain('lower')
    expect(lowerText).toContain('2s')
    expect(lowerText).toContain('²S₁/₂')
    teardown()
  })

  it('re-renders the affected pane caption when selection changes', () => {
    const store = createStore()
    const teardown = mountAtomView2D(container, store)
    const captions = container.querySelectorAll('[data-role="caption"]')
    const upperBefore = captions[0].textContent ?? ''
    expect(upperBefore).toContain('3p')

    // Drive the upper state to 4d.
    store.setState((s) => ({
      ...s,
      selection: {
        ...s.selection,
        upper: hState(4, 2, '4d¹', '²D₅/₂', -0.85),
      },
    }))

    const upperAfter = captions[0].textContent ?? ''
    expect(upperAfter).toContain('4d')
    expect(upperAfter).toContain('²D₅/₂')
    teardown()
  })

  it('re-renders formula captions when m and slice plane settings change', () => {
    const store = createStore()
    const teardown = mountAtomView2D(container, store)
    store.setState((s) => ({
      ...s,
      display: {
        ...s.display,
        atomView: {
          ...s.display.atomView,
          slicePlane: 'xy',
          upperM: 1,
        },
      },
    }))

    const formulas = container.querySelectorAll('[data-role="formula"]')
    expect(formulas[0].textContent).toContain('m=1')
    expect(formulas[0].textContent).toContain('xy')
    teardown()
  })

  it('teardown empties the container', () => {
    const store = createStore()
    const teardown = mountAtomView2D(container, store)
    expect(container.children.length).toBeGreaterThan(0)
    teardown()
    expect(container.children.length).toBe(0)
  })

  it('teardown unsubscribes — later store updates do not repopulate the DOM', () => {
    const store = createStore()
    const teardown = mountAtomView2D(container, store)
    teardown()
    store.setState((s) => ({
      ...s,
      selection: { ...s.selection, upper: hState(5, 0, '5s¹', '²S₁/₂', -0.544) },
    }))
    expect(container.children.length).toBe(0)
  })
})

describe('Atom View 2D — psi formula caption', () => {
  it('returns the closed-form 2p formula for (n=2, l=1)', () => {
    expect(psiFormula(2, 1)).toContain('exp(−Zr/2a₀)')
  })

  it('returns a fallback formula for (n, l) outside the lookup table', () => {
    const fallback = psiFormula(5, 2)
    expect(fallback).toContain('R_')
    expect(fallback).toContain('Y_')
  })

  it('covers every (n, l) for n ∈ 1..4 with a non-fallback closed-form entry', () => {
    for (let n = 1; n <= 4; n++) {
      for (let l = 0; l < n; l++) {
        const f = psiFormula(n, l)
        // A fallback formula contains "R_" and "Y_"; closed-form entries do not.
        expect(f).not.toContain('R_')
      }
    }
  })
})

describe('Atom View 2D — node count callout', () => {
  it('reports zero nodes for the 1s ground state', () => {
    expect(nodeCount(1, 0)).toBe('nodes: 0 total (0 radial · 0 angular)')
  })

  it('reports the correct radial/angular split for 3p', () => {
    expect(nodeCount(3, 1)).toBe('nodes: 2 total (1 radial · 1 angular)')
  })

  it('reports the correct radial/angular split for 3s', () => {
    expect(nodeCount(3, 0)).toBe('nodes: 2 total (2 radial · 0 angular)')
  })
})

describe('Atom View 2D — pedagogical DOM content (mounted)', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('renders a psi formula caption per pane for the default (H 3p / 2s) selection', () => {
    const store = createStore()
    const teardown = mountAtomView2D(container, store)
    const formulas = container.querySelectorAll('[data-role="formula"]')
    expect(formulas.length).toBe(2)
    // Upper = 3p (n=3, l=1); the formula contains the ψ₃₁ subscript or its
    // closed-form fragment. We accept either to keep the assertion behavioural.
    const upperText = formulas[0].textContent ?? ''
    expect(upperText.length).toBeGreaterThan(0)
    expect(upperText).toMatch(/ψ₃₁|R_₃₁/)
    teardown()
  })

  it('renders the 3p node-count text in the upper pane for the default selection', () => {
    const store = createStore()
    const teardown = mountAtomView2D(container, store)
    const nodes = container.querySelectorAll('[data-role="nodes"]')
    expect(nodes.length).toBe(2)
    // Default upper = 3p → "2 total (1 radial · 1 angular)"
    expect(nodes[0].textContent).toBe('nodes: 2 total (1 radial · 1 angular)')
    teardown()
  })
})

describe('Atom View 2D — fire-bus crossfade animation', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    // Mock RAF and performance.now so the animation's time-based easing is
    // deterministic under vi.advanceTimersByTime. setTimeout is included
    // because the RAF fallback in jsdom-without-RAF is setTimeout-driven.
    vi.useFakeTimers({
      toFake: [
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'Date',
        'setTimeout',
        'clearTimeout',
      ],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    container.remove()
  })

  it('drops the upper-pane opacity below 1 mid-animation after a fire event', () => {
    const store = createStore()
    const bus = createFireBus()
    const teardown = mountAtomView2D(container, store, bus)
    const wraps = container.querySelectorAll<HTMLDivElement>('[data-role="canvas-wrap"]')
    expect(wraps.length).toBe(2)

    bus.emit()
    // Advance into Phase B (the crossfade itself), where upper is fading.
    vi.advanceTimersByTime(750)
    const upperO = parseFloat(wraps[0].style.opacity || '1')
    expect(upperO).toBeLessThan(1)
    expect(upperO).toBeGreaterThan(0)
    teardown()
  })

  it('settles both panes back to opacity 1 within ~1500 ms of a fire event', () => {
    const store = createStore()
    const bus = createFireBus()
    const teardown = mountAtomView2D(container, store, bus)
    const wraps = container.querySelectorAll<HTMLDivElement>('[data-role="canvas-wrap"]')

    bus.emit()
    vi.advanceTimersByTime(1600)
    const upperO = parseFloat(wraps[0].style.opacity || '1')
    const lowerO = parseFloat(wraps[1].style.opacity || '1')
    expect(upperO).toBe(1)
    expect(lowerO).toBe(1)
    teardown()
  })
})
