/**
 * Type definitions — the synced spine.
 *
 * Every instrument is a pure function of `Selection + Conditions + Display`.
 * No instrument owns state that affects another's rendering.
 */

export type ElementSymbol = 'H' | 'He' | 'Li' | 'Na' | 'Hg' | 'Ne'

export type TermState = {
  n: number
  l: number
  /** Magnetic quantum number for orbital visualization. Not the same as mJ. */
  m?: number
  s: number
  j: number
  mJ?: number
  electronConfig: string
  termSymbol: string
  energy_eV: number
}

export type LineSelection = {
  /** ISO-style id: `${element}/${wavelength_nm}` */
  id: string
  element: ElementSymbol
  wavelength_nm: number
  label: string
  transition: string
}

export type Selection = {
  element: ElementSymbol
  upper: TermState
  lower: TermState
  /** When set, instruments visually focus on this line. null = all-on default. */
  line: LineSelection | null
}

export type Conditions = {
  temperature_K: number
  pressure_Pa: number
  numberDensity_per_m3: number
  bField_T: number
  eField_V_per_m: number
  bulkVelocity_m_per_s: number
  gravitationalPotential_J_per_kg: number
}

export type ColorPipeline = 'cie1931' | 'bruton1996' | 'monochrome'
export type WavelengthFrame = 'vacuum' | 'air'
export type EnergyUnit = 'eV' | 'cm-1' | 'Hz' | 'nm'
export type SpectrumScale = 'linear' | 'log'
export type FidelityLabel = 'always' | 'on-hover' | 'hidden'
export type AtomViewMode = 'cloud-2d' | 'cloud-3d' | 'shells' | 'term-table' | 'superposition'
export type AtomViewPane = 'upper' | 'lower'
export type AtomViewSlicePlane = 'xz' | 'xy' | 'yz'
export type AtomViewShellMode = 'full' | 'collapsed' | 'hidden'

export type AtomViewSettings = {
  mode: AtomViewMode
  activePane: AtomViewPane
  slicePlane: AtomViewSlicePlane
  upperM: number
  lowerM: number
  isoThreshold: number
  nodesVisible: boolean
  shellMode: AtomViewShellMode
}

export type InstrumentId =
  | 'atom-view'
  | 'grotrian'
  | 'spectrum-bar'
  | 'photon-anim'
  | 'phenomena-inspector'
  | 'astrophysical-context'
  | 'propagator-view'

/**
 * Global animation clock — the time axis of the synced spine.
 *
 * Settings live in the store. The instantaneous `t` is derived per-instrument
 * from `(performance.now() - sessionStart) * speed / 1000` so every animating
 * panel stays implicitly in sync without a high-frequency store write loop.
 *
 * `displayHzScale` collapses the real optical frequency `ω₂₁` (~10¹⁵ rad/s)
 * down to a perceivable display frequency. `t_display = t_real / displayHzScale`.
 * The Cockpit shows the ratio so the schematic-time nature is visible.
 */
export type ClockSettings = {
  /** Multiplier applied to wall-clock seconds. 1.0 = real time on the display axis. */
  speed: number
  /** When true, t does not advance. */
  frozen: boolean
  /** ω_display = ω_real / displayHzScale. Default 1e14 → ~few Hz on screen. */
  displayHzScale: number
}

/** v1.1 single-stage proof chain. 12 steps (0..11). */
export type PathStepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11

export const PATH_STEP_COUNT = 12 as const

export type PathSettings = {
  /** Current step in the proof chain. */
  currentStep: PathStepIndex
  /** Show the math overlay (default true). */
  mathVisible: boolean
  /** Per-step knob value, keyed by step index. Floats. */
  knob: Readonly<Record<number, number>>
}

export type Display = {
  visibleInstruments: ReadonlySet<InstrumentId>
  layout: 'stacked' | 'grid-2x2' | 'grid-3x2' | 'single-focus'
  modes: {
    colorPipeline: ColorPipeline
    wavelengthFrame: WavelengthFrame
    energyUnit: EnergyUnit
    spectrumScale: SpectrumScale
    fidelityLabel: FidelityLabel
  }
  atomView: AtomViewSettings
  clock: ClockSettings
  path: PathSettings
}

export type State = {
  selection: Selection
  conditions: Conditions
  display: Display
}
