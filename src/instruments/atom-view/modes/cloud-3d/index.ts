/**
 * Atom View — `cloud-3d` mode.
 *
 * Two side-by-side Three.js panes, one per selection (`upper` / `lower`),
 * each rendering a |ψ_nlm|² volumetric raymarch with a MarchingCubes
 * iso-surface fallback. Synced spine: panes are pure functions of the
 * store's `selection` field.
 *
 * Entry point: `mountAtomView3D(container, store)` — appends the UI to
 * `container` and returns a teardown function.
 */

import type { Store, Subscriber } from '../../../../store'
import type { State, TermState } from '../../../../types'
import { effectiveZ, recommendedBoxHalfExtent_Bohr } from '../../../../physics/atomic'
import { createPane, type Pane, type PaneInput } from './pane'

export type { PaneMode } from './pane'
export { buildPsiGrid3D, GRID_RESOLUTION_3D } from './grid'
export type { PsiGrid3D, Quanta } from './grid'
export { compositeAlongRay, stepColor, POS_COLOR, NEG_COLOR } from './colormap'

const PANE_SIZE = 480

/**
 * Compute the (n, l, m, Z) quanta for a given TermState + element.
 * TermState.m is optional while orbital-basis controls are rolling in; fall
 * back to m = 0 so older selections keep the same aligned-lobe behavior.
 */
function magneticQuantumNumber(term: TermState, displayM?: number): number {
  const m = Number.isInteger(term.m) ? term.m : displayM
  if (typeof m !== 'number' || !Number.isInteger(m)) return 0
  return Math.abs(m) <= term.l ? m : 0
}

function quantaFromTermState(
  element: string,
  term: TermState,
  displayM?: number,
): {
  n: number
  l: number
  m: number
  Z: number
} {
  let Z = 1
  try {
    Z = effectiveZ(element, term.n, term.l)
  } catch {
    Z = element === 'H' ? 1 : 0.5
  }
  return { n: term.n, l: term.l, m: magneticQuantumNumber(term, displayM), Z: Math.max(0.5, Z) }
}

/** Build a caption string for one pane (state label, element, term, energy). */
function captionFor(
  label: 'upper' | 'lower',
  element: string,
  term: TermState,
  displayM?: number,
): string {
  const energy = term.energy_eV.toFixed(3)
  const m = magneticQuantumNumber(term, displayM)
  return `${label} · ${element} ${term.electronConfig} · ${term.termSymbol} · m=${m} · ${energy} eV`
}

function paneInputFor(label: 'upper' | 'lower', state: State): PaneInput {
  const term = label === 'upper' ? state.selection.upper : state.selection.lower
  const displayM = label === 'upper' ? state.display.atomView.upperM : state.display.atomView.lowerM
  const q = quantaFromTermState(state.selection.element, term, displayM)
  const halfExtent = recommendedBoxHalfExtent_Bohr(q.n, q.l, q.Z)
  return {
    quanta: q,
    halfExtent_Bohr: halfExtent,
    caption: captionFor(label, state.selection.element, term, displayM),
  }
}

/**
 * Mount the dual-pane Atom View 3D into `container`. Returns a teardown
 * function that removes all DOM, disposes WebGL resources, and unsubscribes
 * from the store.
 */
export function mountAtomView3D(container: HTMLElement, store: Store): () => void {
  const initialState = store.getState()

  // Wrapper.
  const root = document.createElement('div')
  root.className = 'linelight-atomview3d'
  root.style.cssText = 'display: flex; flex-direction: column; gap: 12px; color: #d0d0d0;'

  // Header row (instrument label + global "link rotation" pill).
  const header = document.createElement('div')
  header.style.cssText =
    'display: flex; justify-content: space-between; align-items: baseline; gap: 16px;'

  const headerLabel = document.createElement('div')
  headerLabel.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b;"
  headerLabel.textContent = 'instrument · atom view 3d (volumetric / iso-surface)'

  const linkPill = document.createElement('button')
  linkPill.className = 'linelight-atomview3d-link'
  linkPill.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.06em; padding: 4px 10px; border: 1px solid #6b6b6b; background: #1a1a1a; color: #d0d0d0; cursor: pointer;"
  let linkRotation = false
  linkPill.textContent = `link rotation · off`
  linkPill.addEventListener('click', () => {
    linkRotation = !linkRotation
    linkPill.textContent = `link rotation · ${linkRotation ? 'on' : 'off'}`
    if (linkRotation) {
      // Adopt upper as the source of truth on enable.
      lower.syncFrom(upper)
    }
  })

  header.appendChild(headerLabel)
  header.appendChild(linkPill)
  root.appendChild(header)

  // Two-pane grid.
  const panes = document.createElement('div')
  panes.style.cssText = `display: grid; grid-template-columns: repeat(2, ${PANE_SIZE}px); gap: 16px; justify-content: center;`
  root.appendChild(panes)

  // Build pane inputs.
  const upperInput = paneInputFor('upper', initialState)
  const lowerInput = paneInputFor('lower', initialState)

  // Re-entrancy guard for camera-sync (so syncFrom inside a 'change' handler
  // doesn't trigger another change → another sync, ad infinitum).
  let syncing = false

  // Mutual-reference cell: each pane needs to read the other one in its
  // camera-change callback. We populate the ref in the next two statements.
  const refs: { upper: Pane | null; lower: Pane | null } = { upper: null, lower: null }

  const upper: Pane = createPane({
    size: PANE_SIZE,
    initialMode: 'volumetric',
    initialInput: upperInput,
    onCameraChange: () => {
      if (!linkRotation || syncing || !refs.upper || !refs.lower) return
      syncing = true
      refs.lower.applyCameraSnapshot(refs.upper.getCameraSnapshot())
      syncing = false
    },
  })
  refs.upper = upper

  const lower: Pane = createPane({
    size: PANE_SIZE,
    initialMode: 'volumetric',
    initialInput: lowerInput,
    onCameraChange: () => {
      if (!linkRotation || syncing || !refs.upper || !refs.lower) return
      syncing = true
      refs.upper.applyCameraSnapshot(refs.lower.getCameraSnapshot())
      syncing = false
    },
  })
  refs.lower = lower

  panes.appendChild(upper.root)
  panes.appendChild(lower.root)

  container.appendChild(root)

  // Track current selection so we don't rebuild grids on irrelevant state
  // updates (e.g. `display.modes.colorPipeline` toggles).
  let lastUpper = initialState.selection.upper
  let lastLower = initialState.selection.lower
  let lastElement = initialState.selection.element
  let lastUpperM = initialState.display.atomView.upperM
  let lastLowerM = initialState.display.atomView.lowerM

  const onState: Subscriber = (next) => {
    const elementChanged = next.selection.element !== lastElement
    const nextUpperM = next.display.atomView.upperM
    const nextLowerM = next.display.atomView.lowerM
    const upperChanged =
      elementChanged ||
      next.selection.upper.n !== lastUpper.n ||
      next.selection.upper.l !== lastUpper.l ||
      magneticQuantumNumber(next.selection.upper, nextUpperM) !==
        magneticQuantumNumber(lastUpper, lastUpperM) ||
      next.selection.upper.energy_eV !== lastUpper.energy_eV
    const lowerChanged =
      elementChanged ||
      next.selection.lower.n !== lastLower.n ||
      next.selection.lower.l !== lastLower.l ||
      magneticQuantumNumber(next.selection.lower, nextLowerM) !==
        magneticQuantumNumber(lastLower, lastLowerM) ||
      next.selection.lower.energy_eV !== lastLower.energy_eV

    if (upperChanged) upper.setInput(paneInputFor('upper', next))
    if (lowerChanged) lower.setInput(paneInputFor('lower', next))

    lastUpper = next.selection.upper
    lastLower = next.selection.lower
    lastElement = next.selection.element
    lastUpperM = nextUpperM
    lastLowerM = nextLowerM
  }

  const unsubscribe = store.subscribe(onState)

  return function teardown(): void {
    unsubscribe()
    upper.dispose()
    lower.dispose()
    root.remove()
  }
}
