/**
 * URL hash codec tests — round-trip integrity, missing-key tolerance,
 * unparseable handling, and special-char safety.
 */

import { describe, expect, it } from 'vitest'
import { decodeHashToState, encodeStateToHash } from '../../src/store/url'
import { defaultState } from '../../src/store/defaults'
import type { LineSelection, State } from '../../src/types'

const halphaLine: LineSelection = {
  id: 'H/656.281',
  element: 'H',
  wavelength_nm: 656.281,
  label: 'Hα',
  transition: 'n=3 → 2',
}

function stateWithLine(): State {
  return {
    ...defaultState,
    selection: { ...defaultState.selection, line: halphaLine },
  }
}

describe('encodeStateToHash', () => {
  it('produces a slash-separated, key=value hash for the default state', () => {
    const hash = encodeStateToHash(defaultState)
    expect(hash).toContain('H/u=3p-1.5/l=2s-0.5')
    expect(hash).toContain('T=300')
    expect(hash).toContain('color=cie1931')
    expect(hash).toContain('layout=grid-2x2')
    expect(hash).toContain('av=cloud-2d')
    expect(hash).toContain('plane=xz')
  })

  it('omits the line= segment when selection.line is null', () => {
    const hash = encodeStateToHash(defaultState)
    expect(hash).not.toContain('line=')
  })

  it('encodes a LineSelection with slash → underscore', () => {
    const hash = encodeStateToHash(stateWithLine())
    const lineSeg = hash.split('/').find((p) => p.startsWith('line='))
    expect(lineSeg).toBe('line=H_656.281')
  })
})

describe('decodeHashToState — round-trip', () => {
  it('round-trips the default state on the persistable subset', () => {
    const hash = encodeStateToHash(defaultState)
    const decoded = decodeHashToState(hash)
    expect(decoded).not.toBeNull()
    expect(decoded!.selection!.element).toBe(defaultState.selection.element)
    expect(decoded!.selection!.upper!.n).toBe(defaultState.selection.upper.n)
    expect(decoded!.selection!.upper!.l).toBe(defaultState.selection.upper.l)
    expect(decoded!.selection!.upper!.j).toBe(defaultState.selection.upper.j)
    expect(decoded!.selection!.lower!.n).toBe(defaultState.selection.lower.n)
    expect(decoded!.conditions!.temperature_K).toBe(300)
    expect(decoded!.display!.layout).toBe('grid-2x2')
    expect(decoded!.display!.modes!.colorPipeline).toBe('cie1931')
    expect(decoded!.display!.atomView!.mode).toBe('cloud-2d')
    expect(decoded!.display!.atomView!.slicePlane).toBe('xz')
  })

  it('round-trips a non-default temperature value', () => {
    const state: State = {
      ...defaultState,
      conditions: { ...defaultState.conditions, temperature_K: 5778 },
    }
    const decoded = decodeHashToState(encodeStateToHash(state))
    expect(decoded!.conditions!.temperature_K).toBe(5778)
  })

  it('round-trips a LineSelection through encode/decode', () => {
    const decoded = decodeHashToState(encodeStateToHash(stateWithLine()))
    expect(decoded!.selection!.line).not.toBeNull()
    expect(decoded!.selection!.line!.id).toBe('H/656.281')
    expect(decoded!.selection!.line!.wavelength_nm).toBeCloseTo(656.281, 3)
    expect(decoded!.selection!.line!.element).toBe('H')
  })

  it('round-trips visibleInstruments as a Set', () => {
    const decoded = decodeHashToState(encodeStateToHash(defaultState))
    const set = decoded!.display!.visibleInstruments
    expect(set).toBeInstanceOf(Set)
    expect(set!.has('atom-view')).toBe(true)
    expect(set!.has('grotrian')).toBe(true)
    expect(set!.has('spectrum-bar')).toBe(true)
  })

  it('round-trips a custom layout value', () => {
    const state: State = {
      ...defaultState,
      display: { ...defaultState.display, layout: 'single-focus' },
    }
    const decoded = decodeHashToState(encodeStateToHash(state))
    expect(decoded!.display!.layout).toBe('single-focus')
  })

  it('round-trips Atom View mode, pane, m, plane, threshold, nodes, and shell mode', () => {
    const state: State = {
      ...defaultState,
      display: {
        ...defaultState.display,
        atomView: {
          mode: 'cloud-3d',
          activePane: 'lower',
          slicePlane: 'xy',
          upperM: 1,
          lowerM: -1,
          isoThreshold: 0.35,
          nodesVisible: false,
          shellMode: 'collapsed',
        },
      },
    }
    const decoded = decodeHashToState(encodeStateToHash(state))
    expect(decoded!.display!.atomView).toMatchObject({
      mode: 'cloud-3d',
      activePane: 'lower',
      slicePlane: 'xy',
      upperM: 1,
      lowerM: -1,
      isoThreshold: 0.35,
      nodesVisible: false,
      shellMode: 'collapsed',
    })
  })
})

describe('decodeHashToState — partial / unparseable input', () => {
  it('returns null on the empty string', () => {
    expect(decodeHashToState('')).toBeNull()
  })

  it('returns null on a hash with no recognizable keys or element', () => {
    expect(decodeHashToState('#nothing-useful-here')).toBeNull()
  })

  it('tolerates a hash carrying only the element symbol', () => {
    const decoded = decodeHashToState('#He')
    expect(decoded).not.toBeNull()
    expect(decoded!.selection!.element).toBe('He')
    expect(decoded!.conditions).toBeUndefined()
  })

  it('tolerates missing keys (only a temperature override)', () => {
    const decoded = decodeHashToState('#T=1500')
    expect(decoded).not.toBeNull()
    expect(decoded!.conditions!.temperature_K).toBe(1500)
    expect(decoded!.selection).toBeUndefined()
    expect(decoded!.display).toBeUndefined()
  })

  it('drops unknown enum values silently rather than failing', () => {
    const decoded = decodeHashToState('#H/color=neon-rainbow')
    expect(decoded).not.toBeNull()
    expect(decoded!.display).toBeUndefined()
    expect(decoded!.selection!.element).toBe('H')
  })

  it('drops malformed term tokens silently', () => {
    const decoded = decodeHashToState('#H/u=zzz')
    expect(decoded).not.toBeNull()
    expect(decoded!.selection!.upper).toBeUndefined()
    expect(decoded!.selection!.element).toBe('H')
  })

  it('strips a leading # before parsing', () => {
    const withHash = decodeHashToState('#T=400')
    const withoutHash = decodeHashToState('T=400')
    expect(withHash!.conditions!.temperature_K).toBe(400)
    expect(withoutHash!.conditions!.temperature_K).toBe(400)
  })
})

describe('decodeHashToState — line.id round-trip safety', () => {
  it('preserves a line id whose original form contains a slash', () => {
    const tricky: LineSelection = {
      id: 'Na/588.995',
      element: 'Na',
      wavelength_nm: 588.995,
      label: 'Na D2',
      transition: '3p → 3s',
    }
    const state: State = {
      ...defaultState,
      selection: { ...defaultState.selection, element: 'Na', line: tricky },
    }
    const hash = encodeStateToHash(state)
    expect(hash).toContain('line=Na_588.995')
    const decoded = decodeHashToState(hash)
    expect(decoded!.selection!.line!.id).toBe('Na/588.995')
  })
})
