/**
 * Atom-view superposition mode — smoke tests.
 *
 * jsdom has no WebGL, so the Three.js renderer construction throws and the
 * pane reports `hasGL = false`. Tests verify DOM scaffold, store wiring,
 * and teardown.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createStore } from '../../src/store'
import { mountAtomViewSuperposition } from '../../src/instruments/atom-view/modes/superposition/index'

describe('mountAtomViewSuperposition — DOM scaffold', () => {
  let host: HTMLDivElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    host.remove()
  })

  it('returns a teardown function', () => {
    const store = createStore()
    const teardown = mountAtomViewSuperposition(host, store)
    expect(typeof teardown).toBe('function')
    teardown()
  })

  it('renders a canvas element', () => {
    const store = createStore()
    const teardown = mountAtomViewSuperposition(host, store)
    expect(host.querySelector('canvas')).not.toBeNull()
    teardown()
  })

  it('renders a fidelity tag mentioning schematic time', () => {
    const store = createStore()
    const teardown = mountAtomViewSuperposition(host, store)
    const text = host.textContent || ''
    expect(text).toMatch(/schematic/i)
    teardown()
  })
})

describe('mountAtomViewSuperposition — teardown', () => {
  let host: HTMLDivElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    host.remove()
  })

  it('removes its root from the host on teardown', () => {
    const store = createStore()
    const teardown = mountAtomViewSuperposition(host, store)
    expect(host.querySelector('canvas')).not.toBeNull()
    teardown()
    expect(host.querySelector('canvas')).toBeNull()
  })

  it('does not throw when store changes after teardown', () => {
    const store = createStore()
    const teardown = mountAtomViewSuperposition(host, store)
    teardown()
    expect(() => {
      store.setState((s) => ({
        ...s,
        display: {
          ...s.display,
          clock: { ...s.display.clock, frozen: !s.display.clock.frozen },
        },
      }))
    }).not.toThrow()
  })
})
