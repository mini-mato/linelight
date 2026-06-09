/**
 * Propagator View — mount lifecycle tests.
 *
 * canvas.getContext('2d') returns null in jsdom; render passes are silently
 * skipped. Tests verify DOM scaffold, store wiring, and teardown.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createStore } from '../../src/store'
import { mountPropagatorView } from '../../src/instruments/propagator-view/index'

describe('mountPropagatorView — DOM scaffold', () => {
  let host: HTMLDivElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    host.remove()
  })

  it('renders a canvas element', () => {
    const store = createStore()
    const teardown = mountPropagatorView(host, store)
    expect(host.querySelector('[data-role="canvas"]')).not.toBeNull()
    teardown()
  })

  it('renders the B-field slider', () => {
    const store = createStore()
    const teardown = mountPropagatorView(host, store)
    expect(host.querySelector('[data-role="slider-b"]')).not.toBeNull()
    teardown()
  })

  it('renders the pressure slider', () => {
    const store = createStore()
    const teardown = mountPropagatorView(host, store)
    expect(host.querySelector('[data-role="slider-p"]')).not.toBeNull()
    teardown()
  })

  it('renders the fidelity pill', () => {
    const store = createStore()
    const teardown = mountPropagatorView(host, store)
    expect(host.querySelector('[data-role="fidelity-pill"]')).not.toBeNull()
    teardown()
  })
})

describe('mountPropagatorView — teardown', () => {
  let host: HTMLDivElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    host.remove()
  })

  it('clears host.innerHTML on teardown', () => {
    const store = createStore()
    const teardown = mountPropagatorView(host, store)
    teardown()
    expect(host.innerHTML).toBe('')
  })

  it('does not throw when store changes after teardown', () => {
    const store = createStore()
    const teardown = mountPropagatorView(host, store)
    teardown()
    expect(() => {
      store.setState((s) => ({
        ...s,
        conditions: { ...s.conditions, bField_T: 1 },
      }))
    }).not.toThrow()
  })
})

describe('mountPropagatorView — store wiring', () => {
  let host: HTMLDivElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    host.remove()
  })

  it('updates store.conditions.bField_T when slider-b fires an input event', () => {
    const store = createStore()
    const teardown = mountPropagatorView(host, store)

    const slider = host.querySelector<HTMLInputElement>('[data-role="slider-b"]')!
    slider.value = '2.5'
    slider.dispatchEvent(new Event('input'))

    expect(store.getState().conditions.bField_T).toBe(2.5)
    teardown()
  })
})
