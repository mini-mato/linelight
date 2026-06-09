import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createStore } from '../../src/store'
import {
  formatTermEnergy,
  mountAtomViewTermTable,
} from '../../src/instruments/atom-view/modes/term-table'
import type { LineSelection, TermState } from '../../src/types'

function term(electronConfig: string, termSymbol: string, energy_eV: number): TermState {
  return {
    n: 3,
    l: 1,
    s: 0.5,
    j: 1.5,
    electronConfig,
    termSymbol,
    energy_eV,
  }
}

function line(): LineSelection {
  return {
    id: 'Na/588.995',
    element: 'Na',
    wavelength_nm: 588.995,
    label: 'D₂',
    transition: '3²P₃/₂ → 3²S₁/₂',
  }
}

describe('Atom View term table — formatting', () => {
  it('formats finite eV values with three decimals', () => {
    expect(formatTermEnergy(-1.51)).toBe('-1.510 eV')
  })

  it('labels non-finite energies schematic', () => {
    expect(formatTermEnergy(Number.NaN)).toBe('schematic')
  })
})

describe('Atom View term table — mount lifecycle', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('mountAtomViewTermTable returns a teardown function', () => {
    const store = createStore()
    const teardown = mountAtomViewTermTable(container, store)
    expect(typeof teardown).toBe('function')
    teardown()
  })

  it('renders element plus upper/lower config, symbol, energy, and active labels', () => {
    const store = createStore()
    const teardown = mountAtomViewTermTable(container, store)

    expect(container.querySelector('[data-term-element="H"]')?.textContent).toContain('H')
    expect(container.querySelector('[data-term-field="upper-config"]')?.textContent).toBe('3p¹')
    expect(container.querySelector('[data-term-field="lower-symbol"]')?.textContent).toBe('²S₁/₂')
    expect(container.querySelector('[data-term-field="upper-energy"]')?.textContent).toBe(
      '-1.510 eV',
    )
    expect(container.querySelector('[data-term-active-label="lower"]')?.textContent).toBe(
      'lower active',
    )

    teardown()
  })

  it('shows the focused line label when selection.line is set', () => {
    const store = createStore()
    const teardown = mountAtomViewTermTable(container, store)

    store.setState((state) => ({
      ...state,
      selection: { ...state.selection, element: 'Na', line: line() },
    }))

    expect(container.querySelector('[data-term-line-label="D₂"]')?.textContent).toContain(
      '588.995 nm',
    )
    teardown()
  })

  it('updates row content when the store selection changes', () => {
    const store = createStore()
    const teardown = mountAtomViewTermTable(container, store)

    store.setState((state) => ({
      ...state,
      selection: {
        ...state.selection,
        element: 'Na',
        upper: term('[Ne] 3p¹', '²P₃/₂', -3.04),
        lower: term('[Ne] 3s¹', '²S₁/₂', -5.14),
      },
    }))

    expect(container.querySelector('[data-term-element="Na"]')?.textContent).toContain('Na')
    expect(container.querySelector('[data-term-field="upper-config"]')?.textContent).toBe(
      '[Ne] 3p¹',
    )
    expect(container.querySelector('[data-term-field="lower-energy"]')?.textContent).toBe(
      '-5.140 eV',
    )

    teardown()
  })

  it('teardown removes the term table renderer and unsubscribes from updates', () => {
    const store = createStore()
    const teardown = mountAtomViewTermTable(container, store)
    expect(container.querySelector('.linelight-atomview-term-table')).not.toBeNull()

    teardown()
    expect(container.querySelector('.linelight-atomview-term-table')).toBeNull()

    store.setState((state) => ({
      ...state,
      selection: { ...state.selection, upper: term('1s²', '¹S₀', 0) },
    }))
    expect(container.querySelector('.linelight-atomview-term-table')).toBeNull()
  })
})
