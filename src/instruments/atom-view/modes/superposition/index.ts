/**
 * Atom View — `superposition` mode.
 *
 * Single Three.js pane rendering the time-evolved 50/50 superposition of the
 * currently-selected upper and lower hydrogenic states. The probability
 * density |Ψ(r, t)|² breathes at the optical frequency `ω₂₁ = (E_u − E_l)/ℏ`,
 * visibly the SAME oscillation that radiates the photon. A yellow arrow
 * traces the instantaneous dipole expectation ⟨d(t)⟩ = e · ⟨ψ_lo|r|ψ_hi⟩ · cos(ω·t).
 *
 * Dipole-forbidden transitions render the breathing density (cross-term still
 * exists) but suppress the arrow — selection rules become visually obvious.
 *
 * Time axis is `schematic` — real ω₂₁ is rescaled by `clock.displayHzScale`
 * so the breathing is visible on screen. The caption shows both numbers.
 */

import type { Store, Subscriber } from '../../../../store'
import type { State, TermState } from '../../../../types'
import { effectiveZ, recommendedBoxHalfExtent_Bohr } from '../../../../physics/atomic'
import { createSuperpositionPane, type ClockSnapshot, type PaneInput } from './pane'

const PANE_SIZE = 480

function magneticQuantumNumber(term: TermState, displayM?: number): number {
  const m = Number.isInteger(term.m) ? term.m : displayM
  if (typeof m !== 'number' || !Number.isInteger(m)) return 0
  return Math.abs(m) <= term.l ? m : 0
}

function quantaFromTermState(
  element: string,
  term: TermState,
  displayM?: number,
): { n: number; l: number; m: number; Z: number } {
  let Z = 1
  try {
    Z = effectiveZ(element, term.n, term.l)
  } catch {
    Z = element === 'H' ? 1 : 0.5
  }
  return {
    n: term.n,
    l: term.l,
    m: magneticQuantumNumber(term, displayM),
    Z: Math.max(0.5, Z),
  }
}

function paneInputFromState(state: State): PaneInput {
  const upperQ = quantaFromTermState(
    state.selection.element,
    state.selection.upper,
    state.display.atomView.upperM,
  )
  const lowerQ = quantaFromTermState(
    state.selection.element,
    state.selection.lower,
    state.display.atomView.lowerM,
  )
  const halfExtent =
    1.05 *
    Math.max(
      recommendedBoxHalfExtent_Bohr(upperQ.n, upperQ.l, upperQ.Z),
      recommendedBoxHalfExtent_Bohr(lowerQ.n, lowerQ.l, lowerQ.Z),
    )
  return {
    upper: { ...upperQ, energy_eV: state.selection.upper.energy_eV },
    lower: { ...lowerQ, energy_eV: state.selection.lower.energy_eV },
    halfExtent_Bohr: halfExtent,
  }
}

/**
 * Mount the Superposition mode into `container`. Returns a teardown that
 * disposes WebGL resources, removes DOM, and unsubscribes from the store.
 */
export function mountAtomViewSuperposition(container: HTMLElement, store: Store): () => void {
  const initial = store.getState()

  const root = document.createElement('div')
  root.className = 'linelight-atomview-superposition'
  root.style.cssText = 'display: flex; flex-direction: column; gap: 10px; color: #d0d0d0;'

  // Header eyebrow.
  const header = document.createElement('div')
  header.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b;"
  header.textContent = 'instrument · atom view · superposition (Ψ = ½ ψ_lower + ½ ψ_upper · e^−iωt)'
  root.appendChild(header)

  const paneWrap = document.createElement('div')
  paneWrap.style.cssText = `position: relative; width: ${PANE_SIZE}px; max-width: 100%; align-self: center;`
  root.appendChild(paneWrap)

  // Caption stack overlaid on the pane.
  const caption = document.createElement('div')
  caption.style.cssText = [
    'position: absolute',
    'left: 10px',
    'bottom: 10px',
    'right: 10px',
    "font-family: 'JetBrains Mono', monospace",
    'font-size: 10px',
    'line-height: 1.5',
    'color: rgba(255, 255, 255, 0.85)',
    'pointer-events: none',
    'text-shadow: 0 0 4px rgba(0,0,0,0.85)',
  ].join(';')
  paneWrap.appendChild(caption)

  // Top-right fidelity tag.
  const fidelityTag = document.createElement('div')
  fidelityTag.style.cssText = [
    'position: absolute',
    'right: 10px',
    'top: 10px',
    "font-family: 'JetBrains Mono', monospace",
    'font-size: 9px',
    'letter-spacing: 0.08em',
    'text-transform: uppercase',
    'color: rgba(255, 224, 102, 0.95)',
    'pointer-events: none',
    'text-shadow: 0 0 4px rgba(0,0,0,0.85)',
  ].join(';')
  paneWrap.appendChild(fidelityTag)

  let lastInfo = {
    omega_real_rad_per_s: 0,
    omega_display_rad_per_s: 0,
    dipoleMagnitude_a0: null as number | null,
  }

  function refreshCaption(forbidden: boolean): void {
    const realPHz = lastInfo.omega_real_rad_per_s / 1e15
    const displayHz = lastInfo.omega_display_rad_per_s / (2 * Math.PI)
    const dipoleStr =
      lastInfo.dipoleMagnitude_a0 === null
        ? '|D| = (n>7, schematic)'
        : `|D| = ${lastInfo.dipoleMagnitude_a0.toFixed(3)} a₀`
    const forbiddenTag = forbidden
      ? '  ·  <span style="color: #ff6a6a;">dipole-forbidden — no radiation</span>'
      : ''
    caption.innerHTML =
      `ω_real = ${realPHz.toFixed(3)} PHz  ·  ω_display = ${displayHz.toFixed(2)} Hz<br>` +
      `${dipoleStr}${forbiddenTag}`
  }

  function refreshFidelityTag(scale: number): void {
    fidelityTag.textContent = `spatial: exact · time: schematic ×${scale.toExponential(0)}`
  }

  const initialClock: ClockSnapshot = {
    speed: initial.display.clock.speed,
    frozen: initial.display.clock.frozen,
    displayHzScale: initial.display.clock.displayHzScale,
  }

  const pane = createSuperpositionPane({
    size: PANE_SIZE,
    initialInput: paneInputFromState(initial),
    initialClock,
    onTick: (info) => {
      lastInfo = {
        omega_real_rad_per_s: info.omega_real_rad_per_s,
        omega_display_rad_per_s: info.omega_display_rad_per_s,
        dipoleMagnitude_a0: info.dipoleMagnitude_a0,
      }
      const forbidden = info.dipoleMagnitude_a0 !== null && info.dipoleMagnitude_a0 < 1e-6
      refreshCaption(forbidden)
    },
  })

  paneWrap.insertBefore(pane.root, caption)
  refreshFidelityTag(initialClock.displayHzScale)

  // Initial caption while waiting for first tick (in jsdom there's no rAF).
  {
    const c = pane.getCurrent()
    lastInfo = {
      omega_real_rad_per_s: c.omega_real_rad_per_s,
      omega_display_rad_per_s: c.omega_display_rad_per_s,
      dipoleMagnitude_a0: c.dipoleMagnitude_a0,
    }
    const forbidden = c.dipoleMagnitude_a0 !== null && c.dipoleMagnitude_a0 < 1e-6
    refreshCaption(forbidden)
  }

  container.appendChild(root)

  // Watch the store for selection / clock changes.
  let lastUpper = initial.selection.upper
  let lastLower = initial.selection.lower
  let lastElement = initial.selection.element
  let lastUpperM = initial.display.atomView.upperM
  let lastLowerM = initial.display.atomView.lowerM
  let lastClock = initialClock

  const onState: Subscriber = (next) => {
    const elementChanged = next.selection.element !== lastElement
    const selectionChanged =
      elementChanged ||
      next.selection.upper.n !== lastUpper.n ||
      next.selection.upper.l !== lastUpper.l ||
      next.selection.lower.n !== lastLower.n ||
      next.selection.lower.l !== lastLower.l ||
      next.display.atomView.upperM !== lastUpperM ||
      next.display.atomView.lowerM !== lastLowerM ||
      next.selection.upper.energy_eV !== lastUpper.energy_eV ||
      next.selection.lower.energy_eV !== lastLower.energy_eV

    if (selectionChanged) pane.setInput(paneInputFromState(next))

    const clockChanged =
      next.display.clock.speed !== lastClock.speed ||
      next.display.clock.frozen !== lastClock.frozen ||
      next.display.clock.displayHzScale !== lastClock.displayHzScale
    if (clockChanged) {
      const snap: ClockSnapshot = {
        speed: next.display.clock.speed,
        frozen: next.display.clock.frozen,
        displayHzScale: next.display.clock.displayHzScale,
      }
      pane.setClock(snap)
      refreshFidelityTag(snap.displayHzScale)
      lastClock = snap
    }

    lastUpper = next.selection.upper
    lastLower = next.selection.lower
    lastElement = next.selection.element
    lastUpperM = next.display.atomView.upperM
    lastLowerM = next.display.atomView.lowerM
  }

  const unsubscribe = store.subscribe(onState)

  return function teardown(): void {
    unsubscribe()
    pane.dispose()
    root.remove()
  }
}
