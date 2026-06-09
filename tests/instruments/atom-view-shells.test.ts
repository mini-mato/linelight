import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createStore } from '../../src/store'
import {
  mountAtomViewShells,
  parseElectronConfiguration,
} from '../../src/instruments/atom-view/modes/shells'
import type { TermState } from '../../src/types'

function term(electronConfig: string): TermState {
  return {
    n: 3,
    l: 0,
    s: 0.5,
    j: 0.5,
    electronConfig,
    termSymbol: '²S₁/₂',
    energy_eV: -1,
  }
}

function shellCount(config: string, name: string): string | null {
  const shell = parseElectronConfiguration(config).find((entry) => entry.name === name)
  return shell ? `${shell.electrons}/${shell.capacity}` : null
}

describe('Atom View shells — configuration parsing', () => {
  it('parses single-electron hydrogen config', () => {
    expect(shellCount('1s¹', 'K')).toBe('1/2')
  })

  it('parses closed K shell config', () => {
    expect(shellCount('1s²', 'K')).toBe('2/2')
  })

  it('expands a noble-gas core before parsing valence occupancy', () => {
    const shells = parseElectronConfiguration('[Ne] 3s¹')
    expect(shells.map((shell) => `${shell.name}:${shell.electrons}`)).toEqual(['K:2', 'L:8', 'M:1'])
  })

  it('parses concatenated multi-electron fragments with implicit valence occupancy', () => {
    const shells = parseElectronConfiguration('2p⁵3p')
    expect(shells.map((shell) => `${shell.name}:${shell.electrons}`)).toEqual(['L:5', 'M:1'])
  })
})

describe('Atom View shells — mount lifecycle', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('mountAtomViewShells returns a teardown function', () => {
    const store = createStore()
    const teardown = mountAtomViewShells(container, store)
    expect(typeof teardown).toBe('function')
    teardown()
  })

  it('renders upper and lower shell panels from the selected term configs', () => {
    const store = createStore()
    const teardown = mountAtomViewShells(container, store)

    expect(
      container.querySelector('[data-shell-panel="upper"] [data-shell-name="M"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-shell-panel="lower"] [data-shell-name="L"]'),
    ).not.toBeNull()
    expect(container.querySelector('[data-shell-active-label="upper"]')?.textContent).toBe(
      'upper active',
    )

    teardown()
  })

  it('updates shell occupancy when the store selection changes', () => {
    const store = createStore()
    const teardown = mountAtomViewShells(container, store)

    store.setState((state) => ({
      ...state,
      selection: {
        ...state.selection,
        element: 'Na',
        upper: term('[Ne] 3s¹'),
      },
    }))

    const upper = container.querySelector('[data-shell-panel="upper"]')
    expect(upper?.querySelector('[data-shell-legend-count="K"]')?.textContent).toBe('2/2')
    expect(upper?.querySelector('[data-shell-legend-count="L"]')?.textContent).toBe('8/8')
    expect(upper?.querySelector('[data-shell-legend-count="M"]')?.textContent).toBe('1/18')

    teardown()
  })

  it('teardown removes the shell renderer and unsubscribes from store updates', () => {
    const store = createStore()
    const teardown = mountAtomViewShells(container, store)
    expect(container.querySelector('.linelight-atomview-shells')).not.toBeNull()

    teardown()
    expect(container.querySelector('.linelight-atomview-shells')).toBeNull()

    store.setState((state) => ({
      ...state,
      selection: { ...state.selection, upper: term('1s²') },
    }))
    expect(container.querySelector('.linelight-atomview-shells')).toBeNull()
  })
})
