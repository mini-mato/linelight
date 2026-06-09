/**
 * Cockpit instrument tests.
 *
 * Three layers:
 *   1. Mount lifecycle — `mountCockpit` returns a teardown that unsubscribes
 *      and clears the container.
 *   2. Derived physics — ΔE and photon λ for the canonical Hα default match
 *      the closed-form Bohr/Rydberg result within tolerance.
 *   3. Fidelity routing — the panel names "exact" for hydrogen, "schematic"
 *      for multi-electron without a line, and flips back to "exact / Z=2"
 *      for an ionized helium series.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createStore } from '../../../src/store'
import { mountCockpit } from '../../../src/instruments/cockpit'
import { createFireBus } from '../../../src/store/fire-bus'
import { linesForElement } from '../../../src/data'
import type { LineSelection, Selection, TermState } from '../../../src/types'

/* --------------------------------------------------------------------- */
/* Fixtures                                                               */
/* --------------------------------------------------------------------- */

/** Hydrogen 2s¹ (E ≈ −3.4 eV). */
function h2s(): TermState {
  return {
    n: 2,
    l: 0,
    s: 0.5,
    j: 0.5,
    electronConfig: '2s¹',
    termSymbol: '²S₁/₂',
    energy_eV: -3.4,
  }
}

/** Hydrogen 3p¹ (E ≈ −1.51 eV). The Hα Balmer transition starts here. */
function h3p(): TermState {
  return {
    n: 3,
    l: 1,
    s: 0.5,
    j: 1.5,
    electronConfig: '3p¹',
    termSymbol: '²P₃/₂',
    energy_eV: -1.51,
  }
}

/** A canonical He II 30.4 nm ionized line (singly-ionized helium). */
function heIonizedLine(): LineSelection {
  return {
    id: 'He/30.4',
    element: 'He',
    wavelength_nm: 30.4,
    label: 'He II 30.4',
    transition: '2p → 1s',
  }
}

/**
 * The Hα LineSelection — its wavelength matches `linesForElement('H')`'s
 * 656.281 nm record, which carries the canonical `culturalContext` string
 * for star-forming nebulae.
 */
function hAlphaLine(): LineSelection {
  return {
    id: 'H/656.281',
    element: 'H',
    wavelength_nm: 656.281,
    label: 'Hα',
    transition: 'n=3 → 2',
  }
}

/** Hydrogen 2s¹ as the lower state for an n=2 → n=2 forbidden test. */
function h2p(): TermState {
  return {
    n: 2,
    l: 1,
    s: 0.5,
    j: 1.5,
    electronConfig: '2p¹',
    termSymbol: '²P₃/₂',
    energy_eV: -3.4,
  }
}

/** Read the cockpit row value for a given key. */
function rowValue(container: HTMLElement, key: string): string | null {
  const el = container.querySelector(`[data-cockpit-row-value="${key}"]`)
  return el ? el.textContent : null
}

/** Read the fidelity panel as raw text. */
function fidelityText(container: HTMLElement): string {
  const root = container.querySelector('[data-role="fidelity"]')
  return root ? (root.textContent ?? '') : ''
}

/** Read the math-panel rows as raw text (concatenated, newline-separated). */
function mathText(container: HTMLElement): string {
  const root = container.querySelector('[data-role="math"]')
  if (!root) return ''
  return Array.from(root.querySelectorAll('[data-cockpit-math-row]'))
    .map((el) => el.textContent ?? '')
    .join('\n')
}

/* --------------------------------------------------------------------- */
/* Tests                                                                  */
/* --------------------------------------------------------------------- */

describe('Cockpit — mount lifecycle', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })
  afterEach(() => {
    container.remove()
  })

  it('mountCockpit returns a teardown function', () => {
    const store = createStore()
    const teardown = mountCockpit(container, store)
    expect(typeof teardown).toBe('function')
    teardown()
  })

  it('teardown unsubscribes and clears the container', () => {
    const store = createStore()
    const teardown = mountCockpit(container, store)
    expect(container.children.length).toBeGreaterThan(0)

    teardown()
    expect(container.children.length).toBe(0)

    // Further setState produces no DOM updates (would throw if it tried to
    // touch the removed nodes).
    store.setState((s) => ({
      ...s,
      selection: { ...s.selection, line: null },
    }))
    expect(container.children.length).toBe(0)
  })
})

describe('Cockpit — derived physics: Hα default', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })
  afterEach(() => {
    container.remove()
  })

  it('ΔE for n=3 → 2 hydrogen is approximately 1.89 eV', () => {
    const store = createStore() // default selection: H, upper=3p, lower=2s
    const teardown = mountCockpit(container, store)
    const value = rowValue(container, 'delta-e') ?? ''
    const num = Number(value.match(/-?\d+(\.\d+)?/)?.[0])
    expect(num).toBeCloseTo(1.89, 1)
    teardown()
  })

  it('photon λ_vac for the default Hα selection is ≈ 656.279 nm (±2 nm)', () => {
    const store = createStore()
    const teardown = mountCockpit(container, store)
    const value = rowValue(container, 'lambda-vac') ?? ''
    const num = Number(value.match(/-?\d+(\.\d+)?/)?.[0])
    // Closed-form Bohr (Ry=13.6058 eV, n=3→2) → λ ≈ 656.11 nm. The default
    // TermStates use the spec's −13.6/n² rounded values, so allow a 2 nm
    // window which still excludes any other Balmer line.
    expect(num).toBeGreaterThan(654)
    expect(num).toBeLessThan(658)
    teardown()
  })
})

describe('Cockpit — fidelity panel', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })
  afterEach(() => {
    container.remove()
  })

  it('says "hydrogenic exact" when element === H', () => {
    const store = createStore()
    const teardown = mountCockpit(container, store)
    expect(fidelityText(container)).toMatch(/hydrogenic exact/)
    teardown()
  })

  it('says "schematic" when element === He and no line is set', () => {
    const store = createStore()
    const teardown = mountCockpit(container, store)
    store.setState((s) => ({
      ...s,
      selection: { ...s.selection, element: 'He', line: null },
    }))
    expect(fidelityText(container)).toMatch(/schematic/)
    teardown()
  })

  it('flips to "hydrogenic exact, Z=2" when an ionized He series line is selected', () => {
    const store = createStore()
    const teardown = mountCockpit(container, store)
    const heIonized: Selection = {
      element: 'He',
      upper: h3p(), // contents are arbitrary — only the line.series gates fidelity
      lower: h2s(),
      line: { ...heIonizedLine() },
    }
    store.setState((s) => ({ ...s, selection: heIonized }))
    const text = fidelityText(container)
    expect(text).toMatch(/hydrogenic exact/)
    expect(text).toMatch(/Z=2/)
    expect(text).toMatch(/ionized series/)
    teardown()
  })
})

describe('Cockpit — store subscription', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })
  afterEach(() => {
    container.remove()
  })

  it('rerenders the wavelength row when selection changes', () => {
    const store = createStore()
    const teardown = mountCockpit(container, store)
    const initialLambda = rowValue(container, 'lambda-vac')

    // Drive the store to a different transition: Lyman-α (n=2 → n=1, ΔE ≈ 10.2 eV)
    store.setState((s) => ({
      ...s,
      selection: {
        ...s.selection,
        upper: h2s(),
        lower: {
          n: 1,
          l: 0,
          s: 0.5,
          j: 0.5,
          electronConfig: '1s¹',
          termSymbol: '²S₁/₂',
          energy_eV: -13.6,
        },
      },
    }))

    const updatedLambda = rowValue(container, 'lambda-vac')
    expect(updatedLambda).not.toBe(initialLambda)
    // Ly α should land near 121.6 nm.
    const num = Number((updatedLambda ?? '').match(/-?\d+(\.\d+)?/)?.[0])
    expect(num).toBeGreaterThan(120)
    expect(num).toBeLessThan(124)
    teardown()
  })
})

describe('Cockpit — fire button', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })
  afterEach(() => {
    container.remove()
  })

  it('clicking the fire button calls bus.emit() exactly once', () => {
    const store = createStore()
    const bus = createFireBus()
    let count = 0
    bus.subscribe(() => {
      count += 1
    })
    const teardown = mountCockpit(container, store, { bus })

    const btn = container.querySelector<HTMLButtonElement>('[data-cockpit-fire-button]')
    expect(btn).not.toBeNull()
    btn!.click()

    expect(count).toBe(1)
    teardown()
  })
})

describe('Cockpit — math panel', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })
  afterEach(() => {
    container.remove()
  })

  it('renders ΔE for H 3p → 2s within ±0.01 eV of 1.89', () => {
    const store = createStore() // default selection: H, upper=3p (-1.51), lower=2s (-3.4)
    const teardown = mountCockpit(container, store)

    const text = mathText(container)
    const dELine = text.split('\n').find((l) => l.includes('ΔE')) ?? ''
    // Match the "= X.XXXX eV" tail of the chain.
    const m = dELine.match(/=\s*(-?\d+\.\d+)\s*eV\s*$/)
    expect(m).not.toBeNull()
    const dE = Number(m![1])
    expect(dE).toBeCloseTo(1.89, 2)
    teardown()
  })

  it('renders λ for H 3p → 2s within ±1 nm of 656.279', () => {
    const store = createStore()
    const teardown = mountCockpit(container, store)

    const text = mathText(container)
    const lambdaLine = text.split('\n').find((l) => l.includes('λ_vac')) ?? ''
    const m = lambdaLine.match(/=\s*(\d+\.\d+)\s*nm\s*$/)
    expect(m).not.toBeNull()
    const lambda = Number(m![1])
    expect(lambda).toBeGreaterThan(655)
    expect(lambda).toBeLessThan(658)
    teardown()
  })
})

describe('Cockpit — cultural context', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })
  afterEach(() => {
    container.remove()
  })

  it('renders the Hα culturalContext when the active line resolves to it', () => {
    // Sanity-check the data layer: the Hα line in the registry must carry
    // a non-empty culturalContext, otherwise this test asserts on a moving
    // target. (Pulled from the H line registry, not hardcoded.)
    const haRecord = linesForElement('H').find((l) => l.wavelength_nm === 656.281)
    expect(haRecord?.culturalContext).toBeTruthy()
    expect((haRecord!.culturalContext ?? '').length).toBeGreaterThan(0)

    const store = createStore()
    const teardown = mountCockpit(container, store)
    store.setState((s) => ({
      ...s,
      selection: { ...s.selection, line: hAlphaLine() },
    }))

    const culturalRoot = container.querySelector('[data-role="cultural"]')
    expect(culturalRoot?.textContent).toContain('star-forming nebulae')
    teardown()
  })
})

describe('Cockpit — selection-rule badge', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })
  afterEach(() => {
    container.remove()
  })

  it('shows allowed for the default Hα n=3 → n=2 transition', () => {
    const store = createStore() // default: H, 3p (n=3,l=1) → 2s (n=2,l=0) → ΔL=−1, allowed
    const teardown = mountCockpit(container, store)

    const badge = container.querySelector('[data-cockpit-rule]')
    expect(badge?.getAttribute('data-cockpit-rule')).toBe('allowed')
    teardown()
  })

  it('shows forbidden with a reason tooltip when ΔL violates E1 (2p → 2p)', () => {
    const store = createStore()
    const teardown = mountCockpit(container, store)
    // Force a Δn=0 transition — guaranteed forbidden by the E1 rules.
    store.setState((s) => ({
      ...s,
      selection: {
        ...s.selection,
        upper: h2p(),
        lower: h2p(),
      },
    }))

    const badge = container.querySelector('[data-cockpit-rule]')
    expect(badge?.getAttribute('data-cockpit-rule')).toBe('forbidden')
    expect(badge?.getAttribute('title') ?? '').toMatch(/Δn=0|ΔL/)
    teardown()
  })
})
