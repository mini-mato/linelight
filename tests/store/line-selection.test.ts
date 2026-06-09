/**
 * Line-isolation feature — store + helper tests.
 *
 * The line slot is the cross-instrument focus signal: when set, every
 * instrument visually narrows to that one emission line. These tests pin the
 * default-state contract and the schematic TermState construction the
 * spectrum-bar's click handler uses to populate `selection.upper/lower` from
 * a parsed transition string.
 */

import { describe, expect, it } from 'vitest'
import { createStore, defaultState } from '../../src/store'
import { lineId, termStatesFromParsed } from '../../src/instruments/spectrum-bar'
import { parseTransition } from '../../src/physics/atomic'
import type { LineSelection } from '../../src/types'

describe('selection.line — default and round-trip', () => {
  it('starts as null on a freshly-created store', () => {
    const store = createStore()
    expect(store.getState().selection.line).toBeNull()
  })

  it('is null in the exported defaultState', () => {
    expect(defaultState.selection.line).toBeNull()
  })

  it('round-trips a LineSelection through setState', () => {
    const store = createStore()
    const focus: LineSelection = {
      id: 'H/656.281',
      element: 'H',
      wavelength_nm: 656.281,
      label: 'Hα',
      transition: 'n=3 → 2',
    }
    store.setState((s) => ({ ...s, selection: { ...s.selection, line: focus } }))
    expect(store.getState().selection.line).toEqual(focus)
  })
})

describe('lineId — ISO-style id format', () => {
  it('joins element and wavelength_nm with a forward slash', () => {
    expect(lineId('H', 656.281)).toBe('H/656.281')
  })

  it('preserves the wavelength precision the data carries', () => {
    expect(lineId('Na', 588.995)).toBe('Na/588.995')
  })
})

describe('termStatesFromParsed — schematic TermState construction', () => {
  it('builds a hydrogenic upper/lower pair from a parsed n=3 → 2 transition', () => {
    const parsed = parseTransition('n=3 → 2')
    expect(parsed).not.toBeNull()
    const states = termStatesFromParsed(parsed!, 'H')
    expect(states.upper.n).toBe(3)
    expect(states.lower.n).toBe(2)
    expect(states.upper.energy_eV).toBeCloseTo(-13.605693 / 9, 3)
    expect(states.lower.energy_eV).toBeCloseTo(-13.605693 / 4, 3)
  })

  it('expands a raw bare H transition to a representative allowed E1 branch', () => {
    const parsed = parseTransition('n=3 → 2')
    expect(parsed).not.toBeNull()
    const states = termStatesFromParsed(parsed!, 'H', 'n=3 → 2')
    expect(states.upper).toMatchObject({ n: 3, l: 1, m: 0, electronConfig: '3p¹' })
    expect(states.lower).toMatchObject({ n: 2, l: 0, m: 0, electronConfig: '2s¹' })
  })

  it('builds states from a configuration-style transition (3d → 2p)', () => {
    const parsed = parseTransition('3d → 2p')
    expect(parsed).not.toBeNull()
    const states = termStatesFromParsed(parsed!, 'H')
    expect(states.upper.n).toBe(3)
    expect(states.upper.l).toBe(2)
    expect(states.lower.n).toBe(2)
    expect(states.lower.l).toBe(1)
    // electronConfig encodes the principal + subshell letter for the renderer
    expect(states.upper.electronConfig).toBe('3d¹')
    expect(states.lower.electronConfig).toBe('2p¹')
  })

  it('preserves the term-symbol hint when the parser captured one', () => {
    const parsed = parseTransition('3²P → 2²S')
    expect(parsed).not.toBeNull()
    const states = termStatesFromParsed(parsed!, 'H')
    // the hint string is the original raw upper-side token
    expect(states.upper.termSymbol).toContain('P')
    expect(states.lower.termSymbol).toContain('S')
  })

  it('returns finite non-zero energies for an Na 3p → 3s transition (schematic)', () => {
    const parsed = parseTransition('3p → 3s')
    expect(parsed).not.toBeNull()
    const states = termStatesFromParsed(parsed!, 'Na')
    expect(Number.isFinite(states.upper.energy_eV)).toBe(true)
    expect(Number.isFinite(states.lower.energy_eV)).toBe(true)
    expect(states.upper.energy_eV).toBeLessThan(0)
    expect(states.lower.energy_eV).toBeLessThan(0)
  })
})
