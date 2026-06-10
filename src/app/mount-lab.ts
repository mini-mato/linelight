/**
 * Lab bench — primary linelight experience (synced hydrogen instruments).
 */

import type { Store } from '../store'
import type { State } from '../types'
import type { AtomViewMode, AtomViewPane, AtomViewSlicePlane, TermState } from '../types'
import type { ColorPipeline } from '../physics/color'
import { getOrbital, hydrogenicEnergy_eV, type OrbitalDescriptor } from '../physics/atomic'
import { hydrogenAlphaSelection } from '../selection/h-alpha'
import { fireBus } from '../store/fire-bus'
import { mountSpectrumBar } from '../instruments/spectrum-bar'
import { mountGrotrian } from '../instruments/grotrian'
import { mountAtomView2D } from '../instruments/atom-view/modes/cloud-2d'
import { mountAtomView3D } from '../instruments/atom-view/modes/cloud-3d'
import { mountAtomViewShells } from '../instruments/atom-view/modes/shells'
import { mountAtomViewTermTable } from '../instruments/atom-view/modes/term-table'
import { mountAtomViewSuperposition } from '../instruments/atom-view/modes/superposition'
import { mountCockpit } from '../instruments/cockpit'
import { mountPropagatorView } from '../instruments/propagator-view'

const PIPELINE_CYCLE: ColorPipeline[] = ['cie1931', 'bruton1996', 'monochrome']
const PIPELINE_LABEL: Record<ColorPipeline, string> = {
  cie1931: 'CIE 1931',
  bruton1996: 'Bruton 1996',
  monochrome: 'Monochrome',
}

const ATOM_MODES: readonly { mode: AtomViewMode; label: string }[] = [
  { mode: 'superposition', label: 'Breathing Ψ' },
  { mode: 'cloud-2d', label: '2D slice' },
  { mode: 'cloud-3d', label: '3D cloud' },
  { mode: 'shells', label: 'Shells' },
  { mode: 'term-table', label: 'Term table' },
]

const ATOM_PANES: readonly AtomViewPane[] = ['upper', 'lower']
const SLICE_PLANES: readonly AtomViewSlicePlane[] = ['xz', 'xy', 'yz']

function isDevMode(): boolean {
  return new URLSearchParams(location.search).has('dev')
}

function termFromOrbital(base: TermState, orbital: OrbitalDescriptor): TermState {
  const letter = orbital.subshell.toUpperCase()
  return {
    ...base,
    n: orbital.n,
    l: orbital.l,
    m: orbital.m,
    j: orbital.l + 0.5,
    electronConfig: `${orbital.subshellLabel}¹`,
    termSymbol: `²${letter}`,
    energy_eV: hydrogenicEnergy_eV(orbital.n, 1),
  }
}

function selectedOrbital(state: State, pane: AtomViewPane): OrbitalDescriptor | null {
  const term = pane === 'upper' ? state.selection.upper : state.selection.lower
  const m = pane === 'upper' ? state.display.atomView.upperM : state.display.atomView.lowerM
  return getOrbital(term.n, term.l, m) ?? getOrbital(term.n, term.l, 0) ?? null
}

export function mountLab(root: HTMLElement, store: Store): () => void {
  const dev = isDevMode()

  root.innerHTML = `
    <header class="ll-header">
      <div class="ll-header__inner">
        <a class="ll-brand" href="./">linelight</a>
        <nav class="ll-nav" aria-label="linelight sections">
          <a href="./" aria-current="page">Lab</a>
          <a href="./learn.html">Learn</a>
          <a href="./atlas/">Atlas</a>
        </nav>
        <div class="ll-header__tools">
          <button type="button" id="pipeline-toggle" class="ll-btn ll-btn--sm" title="Cycle color pipeline">
            Color · <span id="pipeline-label">${PIPELINE_LABEL.cie1931}</span>
          </button>
        </div>
      </div>
    </header>

    <main class="ll-main">
      <section class="ll-hero" aria-label="Quick start">
        <h1 class="ll-hero__title">Hydrogen lab</h1>
        <p class="ll-hero__lede">
          Pick a spectral line and every instrument updates together — spectrum, energy ladder,
          orbital view, and readout. v1 is hydrogen-first; other elements show lines for context in the
          <a href="./atlas/">atlas</a>.
        </p>
        <div class="ll-hero__actions">
          <button type="button" id="hero-ha" class="ll-btn ll-btn--primary">Show Hα · 656 nm</button>
          <button type="button" id="hero-fire" class="ll-btn">Fire transition</button>
        </div>
      </section>

      <section class="ll-section">
        <h2 class="ll-eyebrow">Cockpit · selected transition</h2>
        <div id="cockpit-mount" class="ll-panel"></div>
      </section>

      <section class="ll-section">
        <h2 class="ll-eyebrow">Spectrum · where photons land</h2>
        <div id="spectrum-bar-mount" class="ll-panel"></div>
      </section>

      <section class="ll-two-col">
        <div>
          <h2 class="ll-eyebrow">Grotrian · energy levels</h2>
          <div id="grotrian-mount" class="ll-panel"></div>
        </div>
        <div>
          <h2 class="ll-eyebrow">Atom · orbital view</h2>
          <div id="atom-control-mount" class="ll-control-row" role="toolbar" aria-label="Atom view controls">
            <div role="tablist" aria-label="Atom view mode" class="ll-control-row" style="margin:0">
              ${ATOM_MODES.map(
                ({ mode, label }) =>
                  `<button type="button" class="ll-btn ll-btn--sm" data-atom-mode="${mode}" role="tab">${label}</button>`,
              ).join('')}
            </div>
            <div class="ll-control-row" style="margin:0">
              ${ATOM_PANES.map(
                (pane) =>
                  `<button type="button" class="ll-btn ll-btn--sm" data-atom-pane="${pane}">${pane}</button>`,
              ).join('')}
              <span class="ll-orbital-readout" id="orbital-readout" aria-live="polite"></span>
            </div>
            <div class="ll-control-row" style="margin:0">
              <span class="ll-control-group">n <input type="range" id="orbital-n" min="1" max="7" step="1" /></span>
              <span class="ll-control-group">l <input type="range" id="orbital-l" min="0" max="6" step="1" /></span>
              <span class="ll-control-group">m <input type="range" id="orbital-m" min="-6" max="6" step="1" /></span>
              ${SLICE_PLANES.map(
                (plane) =>
                  `<button type="button" class="ll-btn ll-btn--sm" data-atom-plane="${plane}">${plane}</button>`,
              ).join('')}
              <button type="button" class="ll-btn ll-btn--sm" id="atom-nodes-toggle">nodes</button>
            </div>
          </div>
          <div id="atom-view-mount" class="ll-panel"></div>
        </div>
      </section>

      <section class="ll-section">
        <h2 class="ll-eyebrow">Propagator · lines as poles</h2>
        <div id="propagator-view-mount" class="ll-panel"></div>
      </section>

      ${
        dev
          ? `<section class="ll-dev-panel">
        <h2 class="ll-eyebrow">Developer · live state (?dev=1)</h2>
        <pre id="state-readout"></pre>
      </section>`
          : ''
      }

      <p class="ll-footnote">
        Scientific accuracy is the floor — every number is measured, derived, or labeled schematic.
        <a href="./learn.html">Twelve-step derivation</a> · <a href="./atlas/">Primitive atlas</a>
      </p>
    </main>
  `

  const pipelineToggle = root.querySelector<HTMLButtonElement>('#pipeline-toggle')
  const pipelineLabel = root.querySelector<HTMLSpanElement>('#pipeline-label')
  const heroHa = root.querySelector<HTMLButtonElement>('#hero-ha')
  const heroFire = root.querySelector<HTMLButtonElement>('#hero-fire')
  const cockpitMount = root.querySelector<HTMLDivElement>('#cockpit-mount')
  const spectrumMount = root.querySelector<HTMLDivElement>('#spectrum-bar-mount')
  const grotrianMount = root.querySelector<HTMLDivElement>('#grotrian-mount')
  const atomViewMount = root.querySelector<HTMLDivElement>('#atom-view-mount')
  const propagatorMount = root.querySelector<HTMLDivElement>('#propagator-view-mount')
  const readout = root.querySelector<HTMLPreElement>('#state-readout')
  const orbitalReadout = root.querySelector<HTMLSpanElement>('#orbital-readout')
  const orbitalN = root.querySelector<HTMLInputElement>('#orbital-n')
  const orbitalL = root.querySelector<HTMLInputElement>('#orbital-l')
  const orbitalM = root.querySelector<HTMLInputElement>('#orbital-m')
  const nodesButton = root.querySelector<HTMLButtonElement>('#atom-nodes-toggle')

  if (
    !pipelineToggle ||
    !pipelineLabel ||
    !heroHa ||
    !heroFire ||
    !cockpitMount ||
    !spectrumMount ||
    !grotrianMount ||
    !atomViewMount ||
    !propagatorMount ||
    !orbitalReadout ||
    !orbitalN ||
    !orbitalL ||
    !orbitalM ||
    !nodesButton
  ) {
    throw new Error('mount-lab: scaffold targets missing')
  }

  const atomHost = atomViewMount
  const orbitalNInput = orbitalN
  const orbitalLInput = orbitalL
  const orbitalMInput = orbitalM
  const orbitalReadoutEl = orbitalReadout
  const nodesToggle = nodesButton

  const atomModeButtons = root.querySelectorAll<HTMLButtonElement>('[data-atom-mode]')
  const atomPaneButtons = root.querySelectorAll<HTMLButtonElement>('[data-atom-pane]')
  const atomPlaneButtons = root.querySelectorAll<HTMLButtonElement>('[data-atom-plane]')

  mountCockpit(cockpitMount, store)
  mountSpectrumBar(spectrumMount, store)
  mountGrotrian(grotrianMount, store)
  mountPropagatorView(propagatorMount, store)

  function applyHydrogenAlpha(): void {
    const sel = hydrogenAlphaSelection()
    store.setState((s) => ({
      ...s,
      selection: { ...s.selection, ...sel },
      display: {
        ...s.display,
        atomView: {
          ...s.display.atomView,
          upperM: sel.upper.m ?? 0,
          lowerM: sel.lower.m ?? 0,
          mode: 'superposition',
        },
      },
    }))
  }

  heroHa.addEventListener('click', applyHydrogenAlpha)
  heroFire.addEventListener('click', () => fireBus.emit())

  function setAtomMode(mode: AtomViewMode): void {
    store.setState((s) => ({
      ...s,
      display: { ...s.display, atomView: { ...s.display.atomView, mode } },
    }))
  }

  function setAtomPane(activePane: AtomViewPane): void {
    store.setState((s) => ({
      ...s,
      display: { ...s.display, atomView: { ...s.display.atomView, activePane } },
    }))
  }

  function setAtomPlane(slicePlane: AtomViewSlicePlane): void {
    store.setState((s) => ({
      ...s,
      display: { ...s.display, atomView: { ...s.display.atomView, slicePlane } },
    }))
  }

  function setActivePaneOrbital(n: number, l: number, m: number): void {
    const lMax = n - 1
    const lClamped = Math.max(0, Math.min(lMax, l))
    const mClamped = Math.max(-lClamped, Math.min(lClamped, m))
    const orbital = getOrbital(n, lClamped, mClamped) ?? getOrbital(n, lClamped, 0)
    if (!orbital) return
    store.setState((s) => {
      const pane = s.display.atomView.activePane
      const atomView = {
        ...s.display.atomView,
        [pane === 'upper' ? 'upperM' : 'lowerM']: mClamped,
      }
      const selection =
        pane === 'upper'
          ? {
              ...s.selection,
              upper: termFromOrbital(s.selection.upper, orbital),
              line: null,
            }
          : {
              ...s.selection,
              lower: termFromOrbital(s.selection.lower, orbital),
              line: null,
            }
      return { ...s, selection, display: { ...s.display, atomView } }
    })
  }

  let mountedAtomMode: AtomViewMode | null = null
  let atomTeardown: (() => void) | null = null

  function mountAtomMode(mode: AtomViewMode): void {
    if (mode === mountedAtomMode) return
    if (atomTeardown) atomTeardown()
    atomTeardown = null
    atomHost.innerHTML = ''
    mountedAtomMode = mode
    if (mode === 'cloud-2d') atomTeardown = mountAtomView2D(atomHost, store)
    if (mode === 'cloud-3d') atomTeardown = mountAtomView3D(atomHost, store)
    if (mode === 'shells') atomTeardown = mountAtomViewShells(atomHost, store)
    if (mode === 'term-table') atomTeardown = mountAtomViewTermTable(atomHost, store)
    if (mode === 'superposition') atomTeardown = mountAtomViewSuperposition(atomHost, store)
  }

  function syncOrbitalSliders(state: State): void {
    const pane = state.display.atomView.activePane
    const term = pane === 'upper' ? state.selection.upper : state.selection.lower
    const m = pane === 'upper' ? state.display.atomView.upperM : state.display.atomView.lowerM
    const lMax = term.n - 1
    orbitalNInput.value = String(term.n)
    orbitalNInput.max = '7'
    orbitalLInput.min = '0'
    orbitalLInput.max = String(lMax)
    orbitalLInput.value = String(Math.min(term.l, lMax))
    orbitalMInput.min = String(-term.l)
    orbitalMInput.max = String(term.l)
    orbitalMInput.value = String(m)
    const orb = selectedOrbital(state, pane)
    orbitalReadoutEl.textContent = orb ? `${orb.label} · m=${m}` : `${term.n}ℓ${term.l} · m=${m}`
  }

  function syncAtomControls(state: State): void {
    const { atomView } = state.display
    atomModeButtons.forEach((button) => {
      const mode = button.dataset.atomMode as AtomViewMode
      const active = mode === atomView.mode
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-selected', active ? 'true' : 'false')
    })
    atomPaneButtons.forEach((button) => {
      const pane = button.dataset.atomPane as AtomViewPane
      button.classList.toggle('is-active', pane === atomView.activePane)
    })
    atomPlaneButtons.forEach((button) => {
      const plane = button.dataset.atomPlane as AtomViewSlicePlane
      button.classList.toggle('is-active', plane === atomView.slicePlane)
    })
    nodesToggle.classList.toggle('is-active', atomView.nodesVisible)
    nodesToggle.textContent = `nodes · ${atomView.nodesVisible ? 'on' : 'off'}`
    syncOrbitalSliders(state)
  }

  atomModeButtons.forEach((button) => {
    button.addEventListener('click', () => setAtomMode(button.dataset.atomMode as AtomViewMode))
  })
  atomPaneButtons.forEach((button) => {
    button.addEventListener('click', () => setAtomPane(button.dataset.atomPane as AtomViewPane))
  })
  atomPlaneButtons.forEach((button) => {
    button.addEventListener('click', () =>
      setAtomPlane(button.dataset.atomPlane as AtomViewSlicePlane),
    )
  })
  nodesToggle.addEventListener('click', () => {
    store.setState((s) => ({
      ...s,
      display: {
        ...s.display,
        atomView: { ...s.display.atomView, nodesVisible: !s.display.atomView.nodesVisible },
      },
    }))
  })

  const onOrbitalInput = (): void => {
    const state = store.getState()
    const pane = state.display.atomView.activePane
    const term = pane === 'upper' ? state.selection.upper : state.selection.lower
    setActivePaneOrbital(
      Number(orbitalNInput.value) || term.n,
      Number(orbitalLInput.value) || term.l,
      Number(orbitalMInput.value) || 0,
    )
  }
  orbitalNInput.addEventListener('input', onOrbitalInput)
  orbitalLInput.addEventListener('input', onOrbitalInput)
  orbitalMInput.addEventListener('input', onOrbitalInput)

  mountAtomMode(store.getState().display.atomView.mode)
  syncAtomControls(store.getState())

  const unsubscribe = store.subscribe((state) => {
    mountAtomMode(state.display.atomView.mode)
    syncAtomControls(state)
    if (readout) {
      readout.textContent = JSON.stringify(
        state,
        (_key, value) => (value instanceof Set ? [...value] : value),
        2,
      )
    }
    if (pipelineLabel) {
      pipelineLabel.textContent = PIPELINE_LABEL[state.display.modes.colorPipeline]
    }
  })

  pipelineToggle.addEventListener('click', () => {
    const current = store.getState().display.modes.colorPipeline
    const next = PIPELINE_CYCLE[(PIPELINE_CYCLE.indexOf(current) + 1) % PIPELINE_CYCLE.length]
    store.setState((s) => ({
      ...s,
      display: { ...s.display, modes: { ...s.display.modes, colorPipeline: next } },
    }))
  })

  return () => {
    unsubscribe()
    if (atomTeardown) atomTeardown()
    root.innerHTML = ''
  }
}
