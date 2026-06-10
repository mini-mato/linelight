/**
 * localStorage persistence — durable preset state across reloads.
 *
 * Stores the same persistable subset the URL codec carries, in a versioned
 * key. Every read is defensive: if the JSON is malformed, the shape doesn't
 * match expectations, or the storage API throws (Safari private mode, quota,
 * SecurityError under file://), we return `null` and let the caller fall back
 * to defaults. We never throw out to the store.
 */

import type {
  AtomViewMode,
  AtomViewPane,
  AtomViewShellMode,
  AtomViewSlicePlane,
  ColorPipeline,
  Display,
  ElementSymbol,
  EnergyUnit,
  FidelityLabel,
  InstrumentId,
  LineSelection,
  SpectrumScale,
  State,
  TermState,
  WavelengthFrame,
} from '../types'

export const PERSIST_KEY = 'linelight.state.v1'

const ELEMENTS: readonly ElementSymbol[] = ['H', 'He', 'Li', 'Na', 'Hg', 'Ne']
const COLOR_PIPELINES: readonly ColorPipeline[] = ['cie1931', 'bruton1996', 'monochrome']
const WAVELENGTH_FRAMES: readonly WavelengthFrame[] = ['vacuum', 'air']
const ENERGY_UNITS: readonly EnergyUnit[] = ['eV', 'cm-1', 'Hz', 'nm']
const SPECTRUM_SCALES: readonly SpectrumScale[] = ['linear', 'log']
const FIDELITY_LABELS: readonly FidelityLabel[] = ['always', 'on-hover', 'hidden']
const ATOM_VIEW_MODES: readonly AtomViewMode[] = [
  'cloud-2d',
  'cloud-3d',
  'shells',
  'term-table',
  'superposition',
]
const ATOM_VIEW_PANES: readonly AtomViewPane[] = ['upper', 'lower']
const ATOM_VIEW_SLICE_PLANES: readonly AtomViewSlicePlane[] = ['xz', 'xy', 'yz']
const ATOM_VIEW_SHELL_MODES: readonly AtomViewShellMode[] = ['full', 'collapsed', 'hidden']
const LAYOUTS: readonly Display['layout'][] = ['stacked', 'grid-2x2', 'grid-3x2', 'single-focus']
const INSTRUMENTS: readonly InstrumentId[] = [
  'atom-view',
  'grotrian',
  'spectrum-bar',
  'photon-anim',
  'phenomena-inspector',
  'astrophysical-context',
]

type PersistedTerm = {
  n: number
  l: number
  s: number
  j: number
  electronConfig: string
  termSymbol: string
  energy_eV: number
}

type PersistedLine = {
  id: string
  element: ElementSymbol
  wavelength_nm: number
  label: string
  transition: string
}

type PersistedBlob = {
  selection?: {
    element?: ElementSymbol
    upper?: PersistedTerm
    lower?: PersistedTerm
    line?: PersistedLine | null
  }
  conditions?: {
    temperature_K?: number
    bField_T?: number
    eField_V_per_m?: number
    bulkVelocity_m_per_s?: number
  }
  display?: {
    visibleInstruments?: InstrumentId[]
    layout?: Display['layout']
    modes?: Partial<Display['modes']>
    atomView?: Partial<Display['atomView']>
    clock?: Partial<Display['clock']>
  }
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function validTerm(v: unknown): v is PersistedTerm {
  if (!isPlainObject(v)) return false
  return (
    isFiniteNumber(v.n) &&
    isFiniteNumber(v.l) &&
    isFiniteNumber(v.s) &&
    isFiniteNumber(v.j) &&
    typeof v.electronConfig === 'string' &&
    typeof v.termSymbol === 'string' &&
    isFiniteNumber(v.energy_eV)
  )
}

function validLine(v: unknown): v is PersistedLine {
  if (!isPlainObject(v)) return false
  return (
    typeof v.id === 'string' &&
    typeof v.element === 'string' &&
    (ELEMENTS as readonly string[]).includes(v.element as string) &&
    isFiniteNumber(v.wavelength_nm) &&
    typeof v.label === 'string' &&
    typeof v.transition === 'string'
  )
}

function termFromPersisted(t: PersistedTerm): TermState {
  return {
    n: t.n,
    l: t.l,
    s: t.s,
    j: t.j,
    electronConfig: t.electronConfig,
    termSymbol: t.termSymbol,
    energy_eV: t.energy_eV,
  }
}

function lineFromPersisted(l: PersistedLine): LineSelection {
  return {
    id: l.id,
    element: l.element,
    wavelength_nm: l.wavelength_nm,
    label: l.label,
    transition: l.transition,
  }
}

/**
 * Read the persisted state from localStorage.
 * Returns null if not present, unparseable, or shape-mismatched.
 */
export function loadFromStorage(): Partial<State> | null {
  const storage = getStorage()
  if (!storage) return null

  let raw: string | null = null
  try {
    raw = storage.getItem(PERSIST_KEY)
  } catch {
    return null
  }
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isPlainObject(parsed)) return null

  const blob = parsed as PersistedBlob
  const out: Partial<State> = {}

  // Selection
  if (isPlainObject(blob.selection)) {
    const sel: Partial<State['selection']> = {}
    if (
      typeof blob.selection.element === 'string' &&
      (ELEMENTS as readonly string[]).includes(blob.selection.element)
    ) {
      sel.element = blob.selection.element as ElementSymbol
    }
    if (validTerm(blob.selection.upper)) {
      sel.upper = termFromPersisted(blob.selection.upper)
    }
    if (validTerm(blob.selection.lower)) {
      sel.lower = termFromPersisted(blob.selection.lower)
    }
    if (blob.selection.line === null) {
      sel.line = null
    } else if (validLine(blob.selection.line)) {
      sel.line = lineFromPersisted(blob.selection.line)
    }
    if (Object.keys(sel).length > 0) out.selection = sel as State['selection']
  }

  // Conditions
  if (isPlainObject(blob.conditions)) {
    const cond: Partial<State['conditions']> = {}
    type CondKey = keyof NonNullable<PersistedBlob['conditions']> & keyof State['conditions']
    const keys: readonly CondKey[] = [
      'temperature_K',
      'bField_T',
      'eField_V_per_m',
      'bulkVelocity_m_per_s',
    ] as const
    for (const k of keys) {
      const v = blob.conditions[k]
      if (isFiniteNumber(v)) cond[k] = v
    }
    if (Object.keys(cond).length > 0) out.conditions = cond as State['conditions']
  }

  // Display
  if (isPlainObject(blob.display)) {
    const disp: Partial<Display> = {}
    if (Array.isArray(blob.display.visibleInstruments)) {
      const ids = blob.display.visibleInstruments.filter(
        (id): id is InstrumentId =>
          typeof id === 'string' && (INSTRUMENTS as readonly string[]).includes(id),
      )
      disp.visibleInstruments = new Set(ids)
    }
    if (
      typeof blob.display.layout === 'string' &&
      (LAYOUTS as readonly string[]).includes(blob.display.layout)
    ) {
      disp.layout = blob.display.layout
    }
    if (isPlainObject(blob.display.modes)) {
      const m: Partial<Display['modes']> = {}
      const cp = blob.display.modes.colorPipeline
      if (typeof cp === 'string' && (COLOR_PIPELINES as readonly string[]).includes(cp)) {
        m.colorPipeline = cp as ColorPipeline
      }
      const wf = blob.display.modes.wavelengthFrame
      if (typeof wf === 'string' && (WAVELENGTH_FRAMES as readonly string[]).includes(wf)) {
        m.wavelengthFrame = wf as WavelengthFrame
      }
      const eu = blob.display.modes.energyUnit
      if (typeof eu === 'string' && (ENERGY_UNITS as readonly string[]).includes(eu)) {
        m.energyUnit = eu as EnergyUnit
      }
      const ss = blob.display.modes.spectrumScale
      if (typeof ss === 'string' && (SPECTRUM_SCALES as readonly string[]).includes(ss)) {
        m.spectrumScale = ss as SpectrumScale
      }
      const fl = blob.display.modes.fidelityLabel
      if (typeof fl === 'string' && (FIDELITY_LABELS as readonly string[]).includes(fl)) {
        m.fidelityLabel = fl as FidelityLabel
      }
      if (Object.keys(m).length > 0) disp.modes = m as Display['modes']
    }
    if (isPlainObject(blob.display.atomView)) {
      const av: Partial<Display['atomView']> = {}
      const mode = blob.display.atomView.mode
      if (typeof mode === 'string' && (ATOM_VIEW_MODES as readonly string[]).includes(mode)) {
        av.mode = mode as AtomViewMode
      }
      const activePane = blob.display.atomView.activePane
      if (
        typeof activePane === 'string' &&
        (ATOM_VIEW_PANES as readonly string[]).includes(activePane)
      ) {
        av.activePane = activePane as AtomViewPane
      }
      const slicePlane = blob.display.atomView.slicePlane
      if (
        typeof slicePlane === 'string' &&
        (ATOM_VIEW_SLICE_PLANES as readonly string[]).includes(slicePlane)
      ) {
        av.slicePlane = slicePlane as AtomViewSlicePlane
      }
      const shellMode = blob.display.atomView.shellMode
      if (
        typeof shellMode === 'string' &&
        (ATOM_VIEW_SHELL_MODES as readonly string[]).includes(shellMode)
      ) {
        av.shellMode = shellMode as AtomViewShellMode
      }
      const upperM = blob.display.atomView.upperM
      if (Number.isInteger(upperM)) av.upperM = upperM as number
      const lowerM = blob.display.atomView.lowerM
      if (Number.isInteger(lowerM)) av.lowerM = lowerM as number
      const isoThreshold = blob.display.atomView.isoThreshold
      if (isFiniteNumber(isoThreshold) && isoThreshold > 0 && isoThreshold < 1) {
        av.isoThreshold = isoThreshold
      }
      const nodesVisible = blob.display.atomView.nodesVisible
      if (typeof nodesVisible === 'boolean') av.nodesVisible = nodesVisible
      if (Object.keys(av).length > 0) disp.atomView = av as Display['atomView']
    }
    if (isPlainObject(blob.display.clock)) {
      const ck: Partial<Display['clock']> = {}
      const speed = blob.display.clock.speed
      if (isFiniteNumber(speed) && speed >= 0) ck.speed = speed
      const frozen = blob.display.clock.frozen
      if (typeof frozen === 'boolean') ck.frozen = frozen
      const displayHzScale = blob.display.clock.displayHzScale
      if (isFiniteNumber(displayHzScale) && displayHzScale > 0) {
        ck.displayHzScale = displayHzScale
      }
      if (Object.keys(ck).length > 0) disp.clock = ck as Display['clock']
    }
    if (Object.keys(disp).length > 0) out.display = disp as Display
  }

  if (Object.keys(out).length === 0) return null
  return out
}

/** Serialize and write state to localStorage. No-ops in non-browser env or on storage errors. */
export function saveToStorage(state: State): void {
  const storage = getStorage()
  if (!storage) return

  const blob: PersistedBlob = {
    selection: {
      element: state.selection.element,
      upper: { ...state.selection.upper },
      lower: { ...state.selection.lower },
      line: state.selection.line ? { ...state.selection.line } : null,
    },
    conditions: {
      temperature_K: state.conditions.temperature_K,
      bField_T: state.conditions.bField_T,
      eField_V_per_m: state.conditions.eField_V_per_m,
      bulkVelocity_m_per_s: state.conditions.bulkVelocity_m_per_s,
    },
    display: {
      visibleInstruments: [...state.display.visibleInstruments],
      layout: state.display.layout,
      modes: { ...state.display.modes },
      atomView: { ...state.display.atomView },
      clock: { ...state.display.clock },
    },
  }

  try {
    storage.setItem(PERSIST_KEY, JSON.stringify(blob))
  } catch {
    // Quota exceeded, security error, etc. — silently ignore.
  }
}

/** Clear the persisted blob. */
export function clearStorage(): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(PERSIST_KEY)
  } catch {
    // ignore
  }
}
