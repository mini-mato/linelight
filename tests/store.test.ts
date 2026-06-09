import { describe, expect, it } from 'vitest'
import { createStore, defaultState } from '../src/store'

describe('store', () => {
  it('initializes with the default selection (hydrogen Hα-adjacent)', () => {
    const store = createStore()
    const state = store.getState()
    expect(state.selection.element).toBe('H')
    expect(state.selection.upper.n).toBe(3)
    expect(state.selection.lower.n).toBe(2)
  })

  it('notifies subscribers on state change', () => {
    const store = createStore()
    let calls = 0
    store.subscribe(() => {
      calls += 1
    })
    store.setState((s) => ({
      ...s,
      conditions: { ...s.conditions, temperature_K: 500 },
    }))
    expect(calls).toBe(1)
    expect(store.getState().conditions.temperature_K).toBe(500)
  })

  it('skips notification when updater returns the same reference', () => {
    const store = createStore()
    let calls = 0
    store.subscribe(() => {
      calls += 1
    })
    store.setState((s) => s)
    expect(calls).toBe(0)
  })

  it('unsubscribes cleanly', () => {
    const store = createStore()
    let calls = 0
    const off = store.subscribe(() => {
      calls += 1
    })
    off()
    store.setState((s) => ({ ...s }))
    expect(calls).toBe(0)
  })

  it('uses defaultState as initial when none provided', () => {
    const store = createStore()
    expect(store.getState()).toEqual(defaultState)
  })
})
