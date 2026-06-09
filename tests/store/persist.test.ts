/**
 * localStorage persistence tests — round-trip via jsdom's localStorage,
 * schema-drift tolerance, and no-op behavior when storage is unavailable.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PERSIST_KEY, clearStorage, loadFromStorage, saveToStorage } from '../../src/store/persist'
import { defaultState } from '../../src/store/defaults'
import type { State } from '../../src/types'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('saveToStorage / loadFromStorage — round-trip', () => {
  it('returns null when the key is missing', () => {
    expect(loadFromStorage()).toBeNull()
  })

  it('writes and reads back the default state', () => {
    saveToStorage(defaultState)
    const loaded = loadFromStorage()
    expect(loaded).not.toBeNull()
    expect(loaded!.selection!.element).toBe('H')
    expect(loaded!.conditions!.temperature_K).toBe(300)
    expect(loaded!.display!.layout).toBe('grid-2x2')
    expect(loaded!.display!.atomView!.mode).toBe('cloud-2d')
    expect(loaded!.display!.atomView!.slicePlane).toBe('xz')
  })

  it('preserves visibleInstruments as a Set after a round-trip', () => {
    saveToStorage(defaultState)
    const loaded = loadFromStorage()
    expect(loaded!.display!.visibleInstruments).toBeInstanceOf(Set)
    expect(loaded!.display!.visibleInstruments!.has('atom-view')).toBe(true)
  })

  it('round-trips a non-null line selection', () => {
    const state: State = {
      ...defaultState,
      selection: {
        ...defaultState.selection,
        line: {
          id: 'H/656.281',
          element: 'H',
          wavelength_nm: 656.281,
          label: 'Hα',
          transition: 'n=3 → 2',
        },
      },
    }
    saveToStorage(state)
    const loaded = loadFromStorage()
    expect(loaded!.selection!.line).not.toBeNull()
    expect(loaded!.selection!.line!.id).toBe('H/656.281')
  })

  it('round-trips a non-default temperature override', () => {
    const state: State = {
      ...defaultState,
      conditions: { ...defaultState.conditions, temperature_K: 5778 },
    }
    saveToStorage(state)
    const loaded = loadFromStorage()
    expect(loaded!.conditions!.temperature_K).toBe(5778)
  })

  it('round-trips Atom View display settings', () => {
    const state: State = {
      ...defaultState,
      display: {
        ...defaultState.display,
        atomView: {
          mode: 'cloud-3d',
          activePane: 'lower',
          slicePlane: 'yz',
          upperM: 1,
          lowerM: -1,
          isoThreshold: 0.4,
          nodesVisible: false,
          shellMode: 'hidden',
        },
      },
    }
    saveToStorage(state)
    const loaded = loadFromStorage()
    expect(loaded!.display!.atomView).toMatchObject(state.display.atomView)
  })
})

describe('loadFromStorage — schema-drift tolerance', () => {
  it('returns null for a corrupt JSON blob without throwing', () => {
    window.localStorage.setItem(PERSIST_KEY, 'not-valid-json{{{')
    expect(() => loadFromStorage()).not.toThrow()
    expect(loadFromStorage()).toBeNull()
  })

  it('returns null when the parsed value is not an object', () => {
    window.localStorage.setItem(PERSIST_KEY, JSON.stringify(['array', 'not', 'object']))
    expect(loadFromStorage()).toBeNull()
  })

  it('drops fields whose types do not match expectations', () => {
    window.localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        conditions: { temperature_K: 'not a number' },
        display: { layout: 'bogus-layout' },
      }),
    )
    expect(loadFromStorage()).toBeNull()
  })

  it('keeps valid fields and drops invalid ones from the same blob', () => {
    window.localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        conditions: { temperature_K: 1234, bField_T: 'not a number' },
      }),
    )
    const loaded = loadFromStorage()
    expect(loaded!.conditions!.temperature_K).toBe(1234)
    expect(loaded!.conditions!.bField_T).toBeUndefined()
  })

  it('drops an unknown element symbol silently', () => {
    window.localStorage.setItem(PERSIST_KEY, JSON.stringify({ selection: { element: 'Pu' } }))
    expect(loadFromStorage()).toBeNull()
  })
})

describe('clearStorage', () => {
  it('removes a previously-saved blob', () => {
    saveToStorage(defaultState)
    expect(window.localStorage.getItem(PERSIST_KEY)).not.toBeNull()
    clearStorage()
    expect(window.localStorage.getItem(PERSIST_KEY)).toBeNull()
    expect(loadFromStorage()).toBeNull()
  })
})

describe('non-browser env — saveToStorage no-ops without throwing', () => {
  it('does not throw when window.localStorage throws on access', () => {
    // Stub out localStorage temporarily with a throwing accessor.
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })
    try {
      expect(() => saveToStorage(defaultState)).not.toThrow()
      expect(() => loadFromStorage()).not.toThrow()
      expect(loadFromStorage()).toBeNull()
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original)
    }
  })
})
