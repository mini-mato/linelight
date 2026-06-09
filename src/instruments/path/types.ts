/**
 * Single-stage proof-chain — types.
 *
 * The Path instrument runs a 12-step derivation on one morphing Three.js
 * scene plus a coordinated 2D auxiliary canvas. Each step is a thin module
 * exporting a `Step` descriptor that the Stage knows how to mount / tear down.
 */

import type { Object3D, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import type { Store } from '../../store'

export type KnobConfig = {
  /** Slider label. */
  label: string
  min: number
  max: number
  /** Slider granularity. */
  step: number
  /** Default value for first-time visits (store carries the latest after that). */
  default: number
  /** Read-out formatter for the current value. */
  format: (v: number) => string
  /** Hide the slider when this step has no manual knob. */
  hidden?: boolean
}

/**
 * Per-step handle returned by `step.enter(...)`. The Stage calls `exit()` when
 * advancing/retreating, and `tick()` (if defined) on every animation frame.
 */
export type StepHandle = {
  /** Per-frame update. Receives the accumulated stage time (s) and the live knob value. */
  tick?: (info: { t_s: number; knob: number }) => void
  /** Knob changed by the user. Called immediately on slider input. */
  onKnob?: (v: number) => void
  /** Tear down step-owned objects, listeners, allocations. */
  exit: () => void
}

/**
 * The Stage hands each step this context. Steps add objects via `trackObject`
 * so the Stage can auto-remove them on exit. The aux 2D canvas is hidden by
 * default; call `setAux2DVisible(true)` to reveal it.
 */
export type StageContext = {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer | null
  has3D: boolean
  aux2D: HTMLCanvasElement
  setAux2DVisible: (visible: boolean) => void
  /** Add a Three.js Object3D to the scene; it will be removed automatically on step exit. */
  trackObject: <T extends Object3D>(obj: T) => T
  /** Update the narrative caption (HTML allowed). */
  setCaption: (html: string) => void
  /** Update the math overlay (HTML allowed). Empty string hides it. */
  setMath: (html: string) => void
  /** Configure the step's interactive slider. */
  setKnobConfig: (cfg: KnobConfig) => void
  /** Current knob value for this step. */
  getKnob: () => number
  /** Programmatically write the knob (used by tick-driven steps like the collapse animation). */
  setKnob: (v: number) => void
  /** The underlying store, for steps that want to push state to other instruments. */
  store: Store
  /** Top-right in-viewport dock for tool widgets (phase wheel, etc.). */
  toolsDock: HTMLDivElement
  /** Right-rail card body where step-specific tool toggles render. */
  toolsCardBody: HTMLDivElement
  /** Show/hide the right-rail Tools card. */
  setToolsCardVisible: (visible: boolean) => void
  /** Always-visible spectrum strip below the stage. Used by photon-flight. */
  spectrumStrip: HTMLDivElement
}

/**
 * A step in the proof chain. Pure data + a single `enter` function. Steps
 * never reach across to each other.
 */
export type Step = {
  id: number
  /** Short title for the navigator pill. */
  title: string
  /** One-sentence claim being proved (top of caption, italic). */
  claim: string
  /** Long-form narrative (HTML allowed). */
  caption: string
  /** Math equation (HTML; Unicode + sub/super tags are fine). */
  math: string
  /** Build the scene + return the per-step handle. */
  enter: (ctx: StageContext) => StepHandle
}
