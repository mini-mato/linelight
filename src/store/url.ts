/**
 * URL hash codec — shareable preset state.
 *
 * Encodes the persistable subset of `State` to a terse, human-readable hash
 * fragment and back. The codec is intentionally permissive on decode: missing
 * keys remain default at the call site (we return a `Partial<State>`), and
 * unknown keys are ignored. Returns `null` only when the hash is shaped so
 * badly we can't even split it into `key=value` segments.
 *
 * Canonical example:
 *   #H/u=3p-1.5/l=2s-0.5/line=H_656.281/T=300/B=0/E=0/v=0
 *     /color=cie1931/show=spectrum-bar,grotrian,atom-view
 *     /layout=grid-2x2/wlf=vacuum/eu=eV/ss=linear/fl=always
 *
 * The element symbol is the bare first segment (no `key=`); everything else
 * uses `key=value`. Slashes separate segments.
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
  'propagator-view',
]

const L_LETTERS = ['s', 'p', 'd', 'f', 'g', 'h', 'i', 'k']

function lToLetter(l: number): string {
  return L_LETTERS[l] ?? 's'
}

function letterToL(letter: string): number | null {
  const idx = L_LETTERS.indexOf(letter)
  return idx === -1 ? null : idx
}

function encodeTerm(t: TermState): string {
  return `${t.n}${lToLetter(t.l)}-${t.j}`
}

/**
 * Schematic TermState reconstruction from `nLetter-j`. We don't have the
 * original `s` / `electronConfig` / `termSymbol` / `energy_eV` in the URL — the
 * caller is expected to merge this back over a base state where those fields
 * already exist, OR to refresh the term states via the same pathway used by
 * other selection mutations.
 */
function decodeTerm(s: string): TermState | null {
  const m = /^(\d+)([a-z])-(-?\d+(?:\.\d+)?)$/.exec(s)
  if (!m) return null
  const n = Number(m[1])
  const l = letterToL(m[2])
  const j = Number(m[3])
  if (l === null || !Number.isFinite(n) || !Number.isFinite(j)) return null
  // Schematic spin: hydrogenic single-electron defaults. Callers that need
  // exact fidelity should merge this Partial<State> over a base state that
  // already holds the canonical TermState shape.
  const sSpin = 0.5
  return {
    n,
    l,
    s: sSpin,
    j,
    electronConfig: `${n}${lToLetter(l)}¹`,
    termSymbol: '',
    energy_eV: 0,
  }
}

function encodeLine(line: LineSelection | null): string | null {
  if (!line) return null
  // Replace forward slash in id (e.g. "H/656.281") with underscore so the
  // hash segment delimiter stays unambiguous.
  return line.id.replace(/\//g, '_')
}

function decodeLine(raw: string, element: ElementSymbol): LineSelection | null {
  // Reverse the slash → underscore swap: split on the LAST underscore so a
  // wavelength like 656.281 isn't mangled.
  const idx = raw.lastIndexOf('_')
  if (idx === -1) return null
  const elem = raw.slice(0, idx)
  const wlStr = raw.slice(idx + 1)
  const wavelength_nm = Number(wlStr)
  if (!Number.isFinite(wavelength_nm)) return null
  const elementSym = (ELEMENTS.includes(elem as ElementSymbol) ? elem : element) as ElementSymbol
  return {
    id: `${elementSym}/${wavelength_nm}`,
    element: elementSym,
    wavelength_nm,
    label: '',
    transition: '',
  }
}

function isElement(s: string): s is ElementSymbol {
  return (ELEMENTS as readonly string[]).includes(s)
}

function pickEnum<T extends string>(value: string, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null
}

/** Encode the persistable subset of state to a URL hash fragment (without the leading #). */
export function encodeStateToHash(state: State): string {
  const { selection, conditions, display } = state
  const parts: string[] = []
  parts.push(selection.element)
  parts.push(`u=${encodeTerm(selection.upper)}`)
  parts.push(`l=${encodeTerm(selection.lower)}`)
  const lineSeg = encodeLine(selection.line)
  if (lineSeg) parts.push(`line=${lineSeg}`)
  parts.push(`T=${conditions.temperature_K}`)
  parts.push(`B=${conditions.bField_T}`)
  parts.push(`E=${conditions.eField_V_per_m}`)
  parts.push(`v=${conditions.bulkVelocity_m_per_s}`)
  parts.push(`color=${display.modes.colorPipeline}`)
  const show = [...display.visibleInstruments].join(',')
  parts.push(`show=${show}`)
  parts.push(`layout=${display.layout}`)
  parts.push(`wlf=${display.modes.wavelengthFrame}`)
  parts.push(`eu=${display.modes.energyUnit}`)
  parts.push(`ss=${display.modes.spectrumScale}`)
  parts.push(`fl=${display.modes.fidelityLabel}`)
  parts.push(`av=${display.atomView.mode}`)
  parts.push(`avp=${display.atomView.activePane}`)
  parts.push(`plane=${display.atomView.slicePlane}`)
  parts.push(`um=${display.atomView.upperM}`)
  parts.push(`lm=${display.atomView.lowerM}`)
  parts.push(`iso=${display.atomView.isoThreshold}`)
  parts.push(`nodes=${display.atomView.nodesVisible ? 1 : 0}`)
  parts.push(`shells=${display.atomView.shellMode}`)
  parts.push(`cspd=${display.clock.speed}`)
  parts.push(`cfrz=${display.clock.frozen ? 1 : 0}`)
  parts.push(`chs=${display.clock.displayHzScale}`)
  return parts.join('/')
}

/** Decode a hash fragment into a Partial<State>; missing keys remain default. Returns null if the hash is unparseable. */
export function decodeHashToState(hash: string): Partial<State> | null {
  if (typeof hash !== 'string') return null
  let raw = hash
  if (raw.startsWith('#')) raw = raw.slice(1)
  if (raw.length === 0) return null

  const segments = raw.split('/').filter((s) => s.length > 0)
  if (segments.length === 0) return null

  let element: ElementSymbol | null = null
  const kv = new Map<string, string>()

  for (const seg of segments) {
    const eq = seg.indexOf('=')
    if (eq === -1) {
      // Bare segment — only the element symbol is allowed without a key.
      if (element === null && isElement(seg)) {
        element = seg
      }
      // Unknown bare segments are silently dropped.
      continue
    }
    const key = seg.slice(0, eq)
    const value = seg.slice(eq + 1)
    if (key.length === 0) return null
    kv.set(key, value)
  }

  // If there's nothing recognizable at all, treat as unparseable.
  if (element === null && kv.size === 0) return null

  const out: Partial<State> = {}

  // Selection
  const selection: Partial<State['selection']> = {}
  if (element !== null) selection.element = element
  const u = kv.get('u')
  if (u !== undefined) {
    const term = decodeTerm(u)
    if (term) selection.upper = term
  }
  const l = kv.get('l')
  if (l !== undefined) {
    const term = decodeTerm(l)
    if (term) selection.lower = term
  }
  if (kv.has('line')) {
    const lineRaw = kv.get('line') as string
    const lineEl = (selection.element ?? element ?? 'H') as ElementSymbol
    const line = decodeLine(lineRaw, lineEl)
    if (line) selection.line = line
  }
  if (Object.keys(selection).length > 0) {
    out.selection = selection as State['selection']
  }

  // Conditions
  const conditions: Partial<State['conditions']> = {}
  const numKeys: Array<[string, keyof State['conditions']]> = [
    ['T', 'temperature_K'],
    ['B', 'bField_T'],
    ['E', 'eField_V_per_m'],
    ['v', 'bulkVelocity_m_per_s'],
  ]
  for (const [hashKey, stateKey] of numKeys) {
    const v = kv.get(hashKey)
    if (v === undefined) continue
    const n = Number(v)
    if (Number.isFinite(n)) conditions[stateKey] = n
  }
  if (Object.keys(conditions).length > 0) {
    out.conditions = conditions as State['conditions']
  }

  // Display
  const modes: Partial<Display['modes']> = {}
  const color = kv.get('color')
  if (color !== undefined) {
    const v = pickEnum(color, COLOR_PIPELINES)
    if (v) modes.colorPipeline = v
  }
  const wlf = kv.get('wlf')
  if (wlf !== undefined) {
    const v = pickEnum(wlf, WAVELENGTH_FRAMES)
    if (v) modes.wavelengthFrame = v
  }
  const eu = kv.get('eu')
  if (eu !== undefined) {
    const v = pickEnum(eu, ENERGY_UNITS)
    if (v) modes.energyUnit = v
  }
  const ss = kv.get('ss')
  if (ss !== undefined) {
    const v = pickEnum(ss, SPECTRUM_SCALES)
    if (v) modes.spectrumScale = v
  }
  const fl = kv.get('fl')
  if (fl !== undefined) {
    const v = pickEnum(fl, FIDELITY_LABELS)
    if (v) modes.fidelityLabel = v
  }

  const display: Partial<Display> = {}
  const atomView: Partial<Display['atomView']> = {}
  if (Object.keys(modes).length > 0) {
    display.modes = modes as Display['modes']
  }
  const layout = kv.get('layout')
  if (layout !== undefined) {
    const v = pickEnum(layout, LAYOUTS)
    if (v) display.layout = v
  }
  const show = kv.get('show')
  if (show !== undefined) {
    const ids = show
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is InstrumentId => (INSTRUMENTS as readonly string[]).includes(s))
    display.visibleInstruments = new Set(ids)
  }
  const av = kv.get('av')
  if (av !== undefined) {
    const v = pickEnum(av, ATOM_VIEW_MODES)
    if (v) atomView.mode = v
  }
  const avp = kv.get('avp')
  if (avp !== undefined) {
    const v = pickEnum(avp, ATOM_VIEW_PANES)
    if (v) atomView.activePane = v
  }
  const plane = kv.get('plane')
  if (plane !== undefined) {
    const v = pickEnum(plane, ATOM_VIEW_SLICE_PLANES)
    if (v) atomView.slicePlane = v
  }
  const shellMode = kv.get('shells')
  if (shellMode !== undefined) {
    const v = pickEnum(shellMode, ATOM_VIEW_SHELL_MODES)
    if (v) atomView.shellMode = v
  }
  const um = kv.get('um')
  if (um !== undefined) {
    const n = Number(um)
    if (Number.isInteger(n)) atomView.upperM = n
  }
  const lm = kv.get('lm')
  if (lm !== undefined) {
    const n = Number(lm)
    if (Number.isInteger(n)) atomView.lowerM = n
  }
  const iso = kv.get('iso')
  if (iso !== undefined) {
    const n = Number(iso)
    if (Number.isFinite(n) && n > 0 && n < 1) atomView.isoThreshold = n
  }
  const nodes = kv.get('nodes')
  if (nodes !== undefined) {
    if (nodes === '1') atomView.nodesVisible = true
    if (nodes === '0') atomView.nodesVisible = false
  }
  if (Object.keys(atomView).length > 0) {
    display.atomView = atomView as Display['atomView']
  }

  const clock: Partial<Display['clock']> = {}
  const cspd = kv.get('cspd')
  if (cspd !== undefined) {
    const n = Number(cspd)
    if (Number.isFinite(n) && n >= 0) clock.speed = n
  }
  const cfrz = kv.get('cfrz')
  if (cfrz === '1') clock.frozen = true
  if (cfrz === '0') clock.frozen = false
  const chs = kv.get('chs')
  if (chs !== undefined) {
    const n = Number(chs)
    if (Number.isFinite(n) && n > 0) clock.displayHzScale = n
  }
  if (Object.keys(clock).length > 0) {
    display.clock = clock as Display['clock']
  }

  if (Object.keys(display).length > 0) {
    out.display = display as Display
  }

  return out
}

/** Browser-side helper: read the current location.hash (no-op in non-browser env). */
export function readHash(): string {
  if (typeof window === 'undefined' || !window.location) return ''
  return window.location.hash || ''
}

/** Browser-side helper: write the location.hash (no-op in non-browser env). */
export function writeHash(hash: string): void {
  if (typeof window === 'undefined' || !window.location) return
  const next = hash.startsWith('#') ? hash : `#${hash}`
  // Use history.replaceState when available so we don't pollute back-button history.
  if (typeof window.history !== 'undefined' && typeof window.history.replaceState === 'function') {
    const url = `${window.location.pathname}${window.location.search}${next}`
    window.history.replaceState(null, '', url)
    return
  }
  window.location.hash = next
}
