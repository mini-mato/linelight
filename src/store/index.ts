/**
 * The synced spine.
 *
 * A minimal signal store. No Zustand, no Redux. Subscribers receive the new
 * state on every change; instruments are pure functions of state.
 *
 * Optional browser bindings (off by default) hydrate from URL hash →
 * localStorage → defaults at construction, then write the hash + storage on
 * every change (debounced). Hydration order is: hash overrides storage,
 * storage overrides default. Tests construct without bindings; `main.ts`
 * opts in.
 */

import type { State } from '../types'
import { defaultState } from './defaults'
import { decodeHashToState, encodeStateToHash, readHash, writeHash } from './url'
import { loadFromStorage, saveToStorage } from './persist'

export type Subscriber = (state: State) => void
export type Updater = (state: State) => State

export type Store = {
  getState: () => State
  setState: (updater: Updater) => void
  subscribe: (fn: Subscriber) => () => void
}

export type CreateStoreOptions = {
  /**
   * If true, hydrate from URL hash → localStorage → defaults at construction
   * time and persist to both hash + storage on every change (debounced 100ms).
   * Defaults to false so tests and Node-side callers see no side effects.
   */
  withBrowserBindings?: boolean
  /** Override the debounce interval in ms. Useful for tests. */
  persistDebounceMs?: number
}

/**
 * Shallow-merge a Partial<State> over a base State. We merge one level deep
 * for `selection` / `conditions` / `display` (and `display.modes`) so that an
 * incoming partial only overrides the keys it carries. `visibleInstruments`
 * (a Set) is replaced wholesale when present.
 */
function mergeState(base: State, patch: Partial<State> | null | undefined): State {
  if (!patch) return base
  const next: State = {
    selection: patch.selection ? { ...base.selection, ...patch.selection } : base.selection,
    conditions: patch.conditions ? { ...base.conditions, ...patch.conditions } : base.conditions,
    display: patch.display
      ? {
          ...base.display,
          ...patch.display,
          modes: patch.display.modes
            ? { ...base.display.modes, ...patch.display.modes }
            : base.display.modes,
          atomView: patch.display.atomView
            ? { ...base.display.atomView, ...patch.display.atomView }
            : base.display.atomView,
          clock: patch.display.clock
            ? { ...base.display.clock, ...patch.display.clock }
            : base.display.clock,
          path: patch.display.path
            ? {
                ...base.display.path,
                ...patch.display.path,
                knob: patch.display.path.knob
                  ? { ...base.display.path.knob, ...patch.display.path.knob }
                  : base.display.path.knob,
              }
            : base.display.path,
          visibleInstruments: patch.display.visibleInstruments ?? base.display.visibleInstruments,
        }
      : base.display,
  }
  return next
}

export function createStore(initial?: State, options?: CreateStoreOptions): Store {
  const withBindings = options?.withBrowserBindings === true
  const debounceMs = options?.persistDebounceMs ?? 100

  let state: State
  if (initial !== undefined) {
    state = initial
  } else if (withBindings) {
    // Hydrate: defaults ← storage ← hash.
    const fromStorage = loadFromStorage()
    const fromHash = decodeHashToState(readHash())
    state = mergeState(mergeState(defaultState, fromStorage), fromHash)
  } else {
    state = defaultState
  }

  const subs = new Set<Subscriber>()

  // Debounced persist: collect rapid setState calls into a single write.
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  const schedulePersist = () => {
    if (persistTimer !== null) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      writeHash(encodeStateToHash(state))
      saveToStorage(state)
    }, debounceMs)
  }

  const store: Store = {
    getState: () => state,
    setState: (updater) => {
      const next = updater(state)
      if (next === state) return
      state = next
      for (const sub of subs) sub(state)
      if (withBindings) schedulePersist()
    },
    subscribe: (fn) => {
      subs.add(fn)
      return () => {
        subs.delete(fn)
      }
    },
  }

  return store
}

export { defaultState }
