/**
 * Atom View 3D — `cloud-3d` mode tests.
 *
 * Two layers:
 *   1. Pure-helper correctness — grid sampler, colormap, adaptive box.
 *      These run anywhere; no WebGL involved.
 *   2. DOM-mount behavior — `mountAtomView3D` returns a teardown, panes
 *      mount canvases, teardown removes them. JSDOM has no real WebGL,
 *      so we only test DOM-level effects here.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createStore } from '../../../src/store'
import {
  mountAtomView3D,
  buildPsiGrid3D,
  GRID_RESOLUTION_3D,
  compositeAlongRay,
  POS_COLOR,
  NEG_COLOR,
} from '../../../src/instruments/atom-view/modes/cloud-3d'
import { recommendedBoxHalfExtent_Bohr } from '../../../src/physics/atomic'

describe('cloud-3d — grid sampler', () => {
  it('builds a 96³ Float32Array with non-zero peak for hydrogen 1s', () => {
    const halfExtent = recommendedBoxHalfExtent_Bohr(1, 0, 1)
    const grid = buildPsiGrid3D({ n: 1, l: 0, m: 0, Z: 1 }, halfExtent)
    expect(grid.N).toBe(GRID_RESOLUTION_3D)
    expect(grid.field).toBeInstanceOf(Float32Array)
    expect(grid.field.length).toBe(GRID_RESOLUTION_3D ** 3)
    expect(grid.peakAbs).toBeGreaterThan(0)
  })

  it('rejects non-integer or too-small grid resolutions', () => {
    expect(() => buildPsiGrid3D({ n: 1, l: 0, m: 0, Z: 1 }, 5, 3)).toThrow()
    expect(() => buildPsiGrid3D({ n: 1, l: 0, m: 0, Z: 1 }, 5, 4.5)).toThrow()
  })

  it('rejects non-positive half-extents', () => {
    expect(() => buildPsiGrid3D({ n: 1, l: 0, m: 0, Z: 1 }, 0, 16)).toThrow()
    expect(() => buildPsiGrid3D({ n: 1, l: 0, m: 0, Z: 1 }, -1, 16)).toThrow()
  })

  it('samples distinct 3D fields when m changes', () => {
    const halfExtent = recommendedBoxHalfExtent_Bohr(2, 1, 1)
    const pz = buildPsiGrid3D({ n: 2, l: 1, m: 0, Z: 1 }, halfExtent, 16)
    const px = buildPsiGrid3D({ n: 2, l: 1, m: 1, Z: 1 }, halfExtent, 16)

    let totalDelta = 0
    for (let i = 0; i < pz.field.length; i++) {
      totalDelta += Math.abs(pz.field[i] - px.field[i])
    }
    expect(totalDelta).toBeGreaterThan(0)
  })
})

describe('cloud-3d — adaptive box scales with n', () => {
  it('3s extent is larger than 1s extent (same Z)', () => {
    const e1s = recommendedBoxHalfExtent_Bohr(1, 0, 1)
    const e3s = recommendedBoxHalfExtent_Bohr(3, 0, 1)
    expect(e3s).toBeGreaterThan(e1s)
  })

  it('grids built with the recommended extent fit their respective orbital sizes', () => {
    // The 3s grid must encompass radial nodes that 1s lacks; total integrated
    // probability stays ~1, but raw peak depends on l/n. Both peaks must be
    // strictly positive — this is the "did we sample the orbital at all" check.
    const e1s = recommendedBoxHalfExtent_Bohr(1, 0, 1)
    const e3s = recommendedBoxHalfExtent_Bohr(3, 0, 1)
    const g1s = buildPsiGrid3D({ n: 1, l: 0, m: 0, Z: 1 }, e1s, 32)
    const g3s = buildPsiGrid3D({ n: 3, l: 0, m: 0, Z: 1 }, e3s, 32)
    expect(g1s.peakAbs).toBeGreaterThan(0)
    expect(g3s.peakAbs).toBeGreaterThan(0)
  })
})

describe('cloud-3d — colormap', () => {
  it('pure-positive samples produce red-leaning final pixel (R > B)', () => {
    // 100 march steps of fully-saturated +ψ.
    const samples = new Float32Array(100)
    samples.fill(1)
    const peak = 1
    const out = compositeAlongRay(samples, peak)
    expect(out.r).toBeGreaterThan(out.b)
    // Ratio sanity: the +endpoint POS_COLOR.r/POS_COLOR.b sets the limit.
    expect(out.r / Math.max(out.b, 1e-9)).toBeGreaterThan(POS_COLOR.r / POS_COLOR.b - 0.5)
  })

  it('pure-negative samples produce blue-leaning final pixel (B > R)', () => {
    const samples = new Float32Array(100)
    samples.fill(-1)
    const peak = 1
    const out = compositeAlongRay(samples, peak)
    expect(out.b).toBeGreaterThan(out.r)
    expect(out.b / Math.max(out.r, 1e-9)).toBeGreaterThan(NEG_COLOR.b / NEG_COLOR.r - 0.5)
  })

  it('all-zero samples produce a fully-transparent black pixel', () => {
    const samples = new Float32Array(100)
    const out = compositeAlongRay(samples, 1)
    expect(out.a).toBeCloseTo(0, 6)
    expect(out.r).toBeCloseTo(0, 6)
    expect(out.g).toBeCloseTo(0, 6)
    expect(out.b).toBeCloseTo(0, 6)
  })
})

describe('cloud-3d — mount/teardown', () => {
  let host: HTMLDivElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    host.remove()
  })

  it('mountAtomView3D returns a teardown function', () => {
    const store = createStore()
    const teardown = mountAtomView3D(host, store)
    expect(typeof teardown).toBe('function')
    teardown()
  })

  it('after mount, two canvas elements exist (one per pane)', () => {
    const store = createStore()
    const teardown = mountAtomView3D(host, store)
    const canvases = host.querySelectorAll('canvas')
    expect(canvases.length).toBe(2)
    teardown()
  })

  it('teardown removes the instrument root from the host', () => {
    const store = createStore()
    const teardown = mountAtomView3D(host, store)
    expect(host.querySelector('.linelight-atomview3d')).not.toBeNull()
    teardown()
    expect(host.querySelector('.linelight-atomview3d')).toBeNull()
    expect(host.querySelectorAll('canvas').length).toBe(0)
  })

  it('mounts a "link rotation" pill (off by default)', () => {
    const store = createStore()
    const teardown = mountAtomView3D(host, store)
    const pill = host.querySelector<HTMLButtonElement>('.linelight-atomview3d-link')
    expect(pill).not.toBeNull()
    expect(pill?.textContent).toMatch(/off/i)
    teardown()
  })

  it('renders a per-pane mode pill that flips between volumetric and iso-surface', () => {
    const store = createStore()
    const teardown = mountAtomView3D(host, store)
    const pills = host.querySelectorAll<HTMLButtonElement>('.linelight-atomview3d-modepill')
    expect(pills.length).toBe(2)
    expect(pills[0].textContent).toMatch(/volumetric/)
    pills[0].click()
    expect(pills[0].textContent).toMatch(/iso-surface/)
    pills[0].click()
    expect(pills[0].textContent).toMatch(/volumetric/)
    teardown()
  })

  it('updates the upper pane when only TermState.m changes', () => {
    const store = createStore()
    const teardown = mountAtomView3D(host, store)
    const captions = host.querySelectorAll<HTMLDivElement>('.linelight-atomview3d-caption')
    expect(captions[0].textContent).toMatch(/m=0/)

    store.setState((state) => ({
      ...state,
      selection: {
        ...state.selection,
        upper: {
          ...state.selection.upper,
          m: 1,
        },
      },
    }))

    expect(captions[0].textContent).toMatch(/m=1/)
    teardown()
  })

  it('renders an independent iso-threshold slider per pane', () => {
    const store = createStore()
    const teardown = mountAtomView3D(host, store)
    const sliders = host.querySelectorAll<HTMLInputElement>('.linelight-atomview3d-isothreshold')
    const values = host.querySelectorAll<HTMLSpanElement>(
      '.linelight-atomview3d-isothreshold-value',
    )

    expect(sliders.length).toBe(2)
    expect(values.length).toBe(2)
    expect(Number(sliders[0].value)).toBeCloseTo(0.2, 6)
    expect(values[0].textContent).toBe('0.20')
    expect(values[1].textContent).toBe('0.20')

    sliders[0].value = '0.35'
    sliders[0].dispatchEvent(new Event('input', { bubbles: true }))

    expect(values[0].textContent).toBe('0.35')
    expect(values[1].textContent).toBe('0.20')
    teardown()
  })
})
