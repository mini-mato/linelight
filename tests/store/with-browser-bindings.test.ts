/**
 * createStore({ withBrowserBindings: true }) tests.
 *
 * Covers:
 *  - hydration order: hash > storage > defaults
 *  - debounced persist on setState (writes both hash + localStorage)
 *  - default-off behavior: no side effects on hash or storage
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore } from '../../src/store'
import { PERSIST_KEY, saveToStorage } from '../../src/store/persist'
import { defaultState } from '../../src/store/defaults'
import type { State } from '../../src/types'

beforeEach(() => {
  window.localStorage.clear()
  // Reset the hash to a clean slate.
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
})

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
})

describe('createStore — default (bindings off)', () => {
  it('does not read or write the URL hash', () => {
    window.location.hash = '#H/T=9999'
    const store = createStore()
    // Defaults preserved; hash override ignored.
    expect(store.getState().conditions.temperature_K).toBe(300)
    // setState does not modify the hash.
    store.setState((s) => ({
      ...s,
      conditions: { ...s.conditions, temperature_K: 500 },
    }))
    // The hash we set above is still the literal hash; the store didn't rewrite it.
    expect(window.location.hash).toBe('#H/T=9999')
  })

  it('does not read or write localStorage', () => {
    saveToStorage({
      ...defaultState,
      conditions: { ...defaultState.conditions, temperature_K: 1234 },
    })
    const store = createStore()
    expect(store.getState().conditions.temperature_K).toBe(300)

    // setState should not write to storage either.
    const before = window.localStorage.getItem(PERSIST_KEY)
    store.setState((s) => ({
      ...s,
      conditions: { ...s.conditions, temperature_K: 999 },
    }))
    const after = window.localStorage.getItem(PERSIST_KEY)
    expect(after).toBe(before)
  })
})

describe('createStore — hydration order', () => {
  it('falls back to defaults when neither hash nor storage is set', () => {
    const store = createStore(undefined, { withBrowserBindings: true })
    expect(store.getState().conditions.temperature_K).toBe(300)
  })

  it('hydrates from localStorage when no hash is present', () => {
    saveToStorage({
      ...defaultState,
      conditions: { ...defaultState.conditions, temperature_K: 5778 },
    })
    const store = createStore(undefined, { withBrowserBindings: true })
    expect(store.getState().conditions.temperature_K).toBe(5778)
  })

  it('hydrates from the URL hash when no storage is present', () => {
    window.location.hash = '#H/T=4500'
    const store = createStore(undefined, { withBrowserBindings: true })
    expect(store.getState().conditions.temperature_K).toBe(4500)
  })

  it('lets the hash override storage when both are set', () => {
    saveToStorage({
      ...defaultState,
      conditions: { ...defaultState.conditions, temperature_K: 5778 },
    })
    window.location.hash = '#H/T=12000'
    const store = createStore(undefined, { withBrowserBindings: true })
    expect(store.getState().conditions.temperature_K).toBe(12000)
  })

  it('merges partial overrides — storage value survives when hash omits the key', () => {
    saveToStorage({
      ...defaultState,
      conditions: { ...defaultState.conditions, temperature_K: 5778 },
    })
    // Hash carries only the layout, not temperature.
    window.location.hash = '#layout=single-focus'
    const store = createStore(undefined, { withBrowserBindings: true })
    expect(store.getState().display.layout).toBe('single-focus')
    expect(store.getState().conditions.temperature_K).toBe(5778)
  })
})

describe('createStore — debounced persist on setState', () => {
  it('writes both hash and storage after the debounce interval', () => {
    vi.useFakeTimers()
    const store = createStore(undefined, {
      withBrowserBindings: true,
      persistDebounceMs: 50,
    })
    store.setState((s: State) => ({
      ...s,
      conditions: { ...s.conditions, temperature_K: 7777 },
    }))
    // Before the debounce elapses, nothing is written yet.
    expect(window.localStorage.getItem(PERSIST_KEY)).toBeNull()
    vi.advanceTimersByTime(50)
    expect(window.localStorage.getItem(PERSIST_KEY)).not.toBeNull()
    expect(window.location.hash).toContain('T=7777')
  })

  it('coalesces rapid setState calls into a single write', () => {
    vi.useFakeTimers()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const store = createStore(undefined, {
      withBrowserBindings: true,
      persistDebounceMs: 50,
    })
    store.setState((s) => ({
      ...s,
      conditions: { ...s.conditions, temperature_K: 100 },
    }))
    store.setState((s) => ({
      ...s,
      conditions: { ...s.conditions, temperature_K: 200 },
    }))
    store.setState((s) => ({
      ...s,
      conditions: { ...s.conditions, temperature_K: 300 },
    }))
    vi.advanceTimersByTime(50)
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toContain('T=300')
    setItem.mockRestore()
  })
})
