/**
 * linelight — entry point.
 *
 * Mounts the page shell, wires the store, and hosts the instruments.
 *
 * v0.3 pedagogy pass:
 *   - Cockpit sticky at top
 *   - Spectrum Bar full-width
 *   - Grotrian + Atom View side-by-side at ≥1100px (two-column grid)
 *   - Atom View 2D / 3D as tabs (one mounted at a time)
 *   - Color-pipeline toggle + live state JSON tucked into a collapsed
 *     <details> at the bottom (developer-only, default closed)
 */

import { createStore } from './store'
import type { State } from './types'
import type { AtomViewMode, AtomViewPane, AtomViewSlicePlane, TermState } from './types'
import type { ColorPipeline } from './physics/color'
import { hydrogenicEnergy_eV, listOrbitals, type OrbitalDescriptor } from './physics/atomic'
import { mountSpectrumBar } from './instruments/spectrum-bar'
import { mountGrotrian } from './instruments/grotrian'
import { mountAtomView2D } from './instruments/atom-view/modes/cloud-2d'
import { mountAtomView3D } from './instruments/atom-view/modes/cloud-3d'
import { mountAtomViewShells } from './instruments/atom-view/modes/shells'
import { mountAtomViewTermTable } from './instruments/atom-view/modes/term-table'
import { mountAtomViewSuperposition } from './instruments/atom-view/modes/superposition'
import { mountCockpit } from './instruments/cockpit'
import { mountPropagatorView } from './instruments/propagator-view'
import { mountPath } from './instruments/path'
import { setAudioEnabled, isAudioEnabled } from './instruments/path/tools/audio-tone'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('linelight: #app mount missing from index.html')

const store = createStore(undefined, { withBrowserBindings: true })

const PIPELINE_CYCLE: ColorPipeline[] = ['cie1931', 'bruton1996', 'monochrome']
const PIPELINE_LABEL: Record<ColorPipeline, string> = {
  cie1931: 'CIE 1931 (colorimetric)',
  bruton1996: 'Bruton 1996 (didactic)',
  monochrome: 'monochrome (luminance only)',
}

// Shared style fragments (kept inline per project pattern).
const EYEBROW_STYLE =
  "font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b; margin-bottom: 12px;"
const TAB_BUTTON_STYLE_BASE =
  "font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.06em; padding: 6px 14px; border: 1px solid #0a0a0a; cursor: pointer;"
const CONTROL_BUTTON_STYLE_BASE =
  "font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.06em; padding: 5px 9px; border: 1px solid #0a0a0a; cursor: pointer;"
const ATOM_MODES: readonly { mode: AtomViewMode; label: string }[] = [
  { mode: 'cloud-2d', label: '2D slice' },
  { mode: 'cloud-3d', label: '3D cloud' },
  { mode: 'shells', label: 'shells' },
  { mode: 'term-table', label: 'term table' },
  { mode: 'superposition', label: 'breathing Ψ' },
]
const ATOM_PANES: readonly AtomViewPane[] = ['upper', 'lower']
const SLICE_PLANES: readonly AtomViewSlicePlane[] = ['xz', 'xy', 'yz']
const ORBITALS = listOrbitals()

root.innerHTML = `
  <style>
    .ll-two-col {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 32px;
      margin-bottom: 48px;
    }
    @media (min-width: 1100px) {
      .ll-two-col {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
    }
  </style>

  <header id="top-bar" style="position: sticky; top: 0; z-index: 20; background: #fff; border-bottom: 1px solid #e5e5e5; height: 40px;">
    <div style="height: 100%; padding: 0 20px; max-width: 1480px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px;">
      <div style="display: flex; align-items: baseline; gap: 12px; min-width: 0;">
        <span style="font-family: 'Newsreader', serif; font-style: italic; font-weight: 500; font-size: 16px;">linelight</span>
        <span style="font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #888;">·  the path</span>
      </div>
      <div id="top-bar-tools" style="display: flex; gap: 8px; align-items: center;">
        <button id="top-tool-audio" type="button" data-tool="audio" data-active="0" style="font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.08em; padding: 4px 10px; border: 1px solid #0a0a0a; background: #fff; color: #0a0a0a; cursor: pointer;" title="Toggle audio tone at ω₂₁">🔊 audio</button>
      </div>
    </div>
  </header>

  <main style="padding: 16px 20px 32px; max-width: 1480px; margin: 0 auto;">
    <section style="margin-bottom: 32px;">
      <div id="path-mount"></div>
    </section>

    <section style="margin-top: 48px; border-top: 1px solid #e5e5e5; padding-top: 24px;">
      <details>
        <summary style="font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #6b6b6b; cursor: pointer; padding: 8px 0;">
          Lab bench — free-exploration instruments (click to expand)
        </summary>
        <div style="padding-top: 24px;">
          <section style="margin-bottom: 32px;">
            <div style="${EYEBROW_STYLE}">
              Cockpit — selected transition · fidelity
            </div>
            <div id="cockpit-mount"></div>
          </section>

          <section style="margin-bottom: 48px;">
            <div style="${EYEBROW_STYLE}">
              Spectrum — where photons land
            </div>
            <div id="spectrum-bar-mount"></div>
          </section>

          <section class="ll-two-col">
      <div style="min-width: 0;">
        <div style="${EYEBROW_STYLE}">
          Grotrian — where electrons sit
        </div>
        <div id="grotrian-mount"></div>
      </div>
      <div style="min-width: 0;">
        <div style="${EYEBROW_STYLE}">
          Atom — what the electron looks like
        </div>
        <div id="atom-control-mount" style="display: grid; gap: 8px; margin-bottom: 12px;">
          <div role="tablist" aria-label="Atom view mode" style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${ATOM_MODES.map(
              ({ mode, label: atomLabel }) =>
                `<button data-atom-mode="${mode}" type="button" role="tab" aria-selected="false" style="${TAB_BUTTON_STYLE_BASE} background: #fff; color: #0a0a0a;">${atomLabel}</button>`,
            ).join('')}
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
            ${ATOM_PANES.map(
              (pane) =>
                `<button data-atom-pane="${pane}" type="button" style="${CONTROL_BUTTON_STYLE_BASE} background: #fff; color: #0a0a0a;">${pane}</button>`,
            ).join('')}
            <select
              id="atom-orbital-select"
              aria-label="Hydrogenic orbital"
              style="font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.04em; padding: 5px 8px; border: 1px solid #0a0a0a; background: #fff; color: #0a0a0a; max-width: 220px;"
            ></select>
            ${SLICE_PLANES.map(
              (plane) =>
                `<button data-atom-plane="${plane}" type="button" style="${CONTROL_BUTTON_STYLE_BASE} background: #fff; color: #0a0a0a;">${plane}</button>`,
            ).join('')}
            <button id="atom-nodes-toggle" type="button" style="${CONTROL_BUTTON_STYLE_BASE} background: #fff; color: #0a0a0a;">nodes</button>
          </div>
        </div>
        <div id="atom-view-mount"></div>
      </div>
    </section>

          <section style="margin-top: 64px;">
            <div style="${EYEBROW_STYLE}">
              Propagator — where lines are poles · expert tier
            </div>
            <div id="propagator-view-mount"></div>
          </section>
        </div>
      </details>
    </section>

    <section style="margin-top: 32px;">
      <details>
        <summary style="font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b; cursor: pointer; padding: 8px 0;">
          Developer — color pipeline · live state
        </summary>
        <div style="padding-top: 16px;">
          <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px;">
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b;">
              global · color pipeline
            </div>
            <button
              id="pipeline-toggle"
              style="font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.06em; padding: 6px 12px; border: 1px solid #0a0a0a; background: #fff; color: #0a0a0a; cursor: pointer;"
            >color · <span id="pipeline-label">CIE 1931 (colorimetric)</span></button>
          </div>
          <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b; margin-bottom: 8px;">
            live state
          </div>
          <pre id="state-readout" style="background: #fafafa; border: 1px solid #e5e5e5; padding: 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.5; overflow: auto; max-height: 40vh;"></pre>
        </div>
      </details>
    </section>
  </main>
`

const readout = root.querySelector<HTMLPreElement>('#state-readout')
const toggle = root.querySelector<HTMLButtonElement>('#pipeline-toggle')
const label = root.querySelector<HTMLSpanElement>('#pipeline-label')
const cockpitMount = root.querySelector<HTMLDivElement>('#cockpit-mount')
const spectrumMount = root.querySelector<HTMLDivElement>('#spectrum-bar-mount')
const grotrianMount = root.querySelector<HTMLDivElement>('#grotrian-mount')
const atomViewMount = root.querySelector<HTMLDivElement>('#atom-view-mount')
const atomModeButtons = root.querySelectorAll<HTMLButtonElement>('[data-atom-mode]')
const atomPaneButtons = root.querySelectorAll<HTMLButtonElement>('[data-atom-pane]')
const atomPlaneButtons = root.querySelectorAll<HTMLButtonElement>('[data-atom-plane]')
const atomOrbitalSelect = root.querySelector<HTMLSelectElement>('#atom-orbital-select')
const atomNodesToggle = root.querySelector<HTMLButtonElement>('#atom-nodes-toggle')
if (
  !readout ||
  !toggle ||
  !label ||
  !cockpitMount ||
  !spectrumMount ||
  !grotrianMount ||
  !atomViewMount ||
  atomModeButtons.length !== ATOM_MODES.length ||
  atomPaneButtons.length !== ATOM_PANES.length ||
  atomPlaneButtons.length !== SLICE_PLANES.length ||
  !atomOrbitalSelect ||
  !atomNodesToggle
) {
  throw new Error('linelight: required mount targets missing')
}
const atomHost = atomViewMount
const orbitalControl = atomOrbitalSelect
const nodesButton = atomNodesToggle

mountCockpit(cockpitMount, store)
mountSpectrumBar(spectrumMount, store)
mountGrotrian(grotrianMount, store)
const propagatorMount = root.querySelector<HTMLDivElement>('#propagator-view-mount')
if (propagatorMount) mountPropagatorView(propagatorMount, store)
const pathMount = root.querySelector<HTMLDivElement>('#path-mount')
if (pathMount) mountPath(pathMount, store)

// Top-bar audio toggle.
const audioBtn = root.querySelector<HTMLButtonElement>('#top-tool-audio')
if (audioBtn) {
  audioBtn.addEventListener('click', () => {
    const next = !isAudioEnabled()
    setAudioEnabled(next)
    audioBtn.dataset.active = next ? '1' : '0'
    audioBtn.style.background = next ? '#0a0a0a' : '#fff'
    audioBtn.style.color = next ? '#fff' : '#0a0a0a'
  })
}

for (const orbital of ORBITALS) {
  const opt = document.createElement('option')
  opt.value = orbital.id
  opt.textContent = `${orbital.label} · ${orbital.shellLabel} · nodes ${orbital.totalNodes}`
  orbitalControl.appendChild(opt)
}

function buttonStyle(base: string, active: boolean): string {
  return `${base} background: ${active ? '#0a0a0a' : '#fff'}; color: ${active ? '#fff' : '#0a0a0a'};`
}

function orbitalById(id: string): OrbitalDescriptor | null {
  return ORBITALS.find((orbital) => orbital.id === id) ?? null
}

function selectedOrbitalForPane(state: State, pane: AtomViewPane): OrbitalDescriptor | null {
  const term = pane === 'upper' ? state.selection.upper : state.selection.lower
  const m = pane === 'upper' ? state.display.atomView.upperM : state.display.atomView.lowerM
  return (
    ORBITALS.find((orbital) => orbital.n === term.n && orbital.l === term.l && orbital.m === m) ??
    ORBITALS.find((orbital) => orbital.n === term.n && orbital.l === term.l && orbital.m === 0) ??
    null
  )
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

function setActivePaneOrbital(orbital: OrbitalDescriptor): void {
  store.setState((s) => {
    const pane = s.display.atomView.activePane
    const atomView = {
      ...s.display.atomView,
      [pane === 'upper' ? 'upperM' : 'lowerM']: orbital.m,
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

function syncAtomControls(state: State): void {
  const { atomView } = state.display
  atomModeButtons.forEach((button) => {
    const mode = button.dataset.atomMode as AtomViewMode
    const active = mode === atomView.mode
    button.setAttribute('style', buttonStyle(TAB_BUTTON_STYLE_BASE, active))
    button.setAttribute('aria-selected', active ? 'true' : 'false')
  })
  atomPaneButtons.forEach((button) => {
    const pane = button.dataset.atomPane as AtomViewPane
    button.setAttribute(
      'style',
      buttonStyle(CONTROL_BUTTON_STYLE_BASE, pane === atomView.activePane),
    )
  })
  atomPlaneButtons.forEach((button) => {
    const plane = button.dataset.atomPlane as AtomViewSlicePlane
    button.setAttribute(
      'style',
      buttonStyle(CONTROL_BUTTON_STYLE_BASE, plane === atomView.slicePlane),
    )
  })
  nodesButton.setAttribute('style', buttonStyle(CONTROL_BUTTON_STYLE_BASE, atomView.nodesVisible))
  nodesButton.textContent = `nodes · ${atomView.nodesVisible ? 'on' : 'off'}`
  const selected = selectedOrbitalForPane(state, atomView.activePane)
  if (selected) orbitalControl.value = selected.id
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
nodesButton.addEventListener('click', () => {
  store.setState((s) => ({
    ...s,
    display: {
      ...s.display,
      atomView: { ...s.display.atomView, nodesVisible: !s.display.atomView.nodesVisible },
    },
  }))
})
orbitalControl.addEventListener('change', () => {
  const orbital = orbitalById(orbitalControl.value)
  if (orbital) setActivePaneOrbital(orbital)
})

mountAtomMode(store.getState().display.atomView.mode)
syncAtomControls(store.getState())
store.subscribe((state) => {
  mountAtomMode(state.display.atomView.mode)
  syncAtomControls(state)
})

function renderState(state: State): void {
  if (readout) {
    readout.textContent = JSON.stringify(
      state,
      (_key, value) => (value instanceof Set ? [...value] : value),
      2,
    )
  }
  if (label) label.textContent = PIPELINE_LABEL[state.display.modes.colorPipeline]
}

renderState(store.getState())
store.subscribe(renderState)

toggle.addEventListener('click', () => {
  const current = store.getState().display.modes.colorPipeline
  const next = PIPELINE_CYCLE[(PIPELINE_CYCLE.indexOf(current) + 1) % PIPELINE_CYCLE.length]
  store.setState((s) => ({
    ...s,
    display: { ...s.display, modes: { ...s.display.modes, colorPipeline: next } },
  }))
})
