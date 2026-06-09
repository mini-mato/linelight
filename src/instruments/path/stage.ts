/**
 * Path Stage — the persistent Three.js scene that all 12 steps share.
 *
 * The stage owns:
 *   • a single WebGLRenderer + scene + camera (or stubs in jsdom)
 *   • a `tracked` set of Object3Ds that get auto-removed on step exit
 *   • an auxiliary 2D canvas that some steps activate (waveforms, Lorentzians)
 *   • a caption + math overlay element
 *   • a slider knob below the stage
 *
 * Steps register via `mountStep(step, knobValue)`. The stage handles teardown.
 */

import {
  AmbientLight,
  Color,
  DirectionalLight,
  Object3D,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { KnobConfig, Step, StepHandle, StageContext } from './types'
import type { Store } from '../../store'

const STAGE_3D_W = 800
const STAGE_3D_H = 580
const STAGE_2D_W = 800
const STAGE_2D_H = 220
const RAIL_W = 300

export type Stage = {
  root: HTMLDivElement
  has3D: boolean
  /** Mount a new step, replacing any current step (which is exited cleanly). */
  mountStep: (step: Step, knobValue: number, onKnobChange: (v: number) => void) => void
  /** Current step id, or null. */
  currentStepId: () => number | null
  /** Tear everything down. */
  dispose: () => void
}

export type StageOptions = {
  store: Store
}

export function createStage(opts: StageOptions): Stage {
  // ---- Root: two-column grid, stage left, side-rail right -------
  const root = document.createElement('div')
  root.className = 'linelight-path-stage'
  root.style.cssText = [
    'display: grid',
    `grid-template-columns: minmax(0, 1fr) ${RAIL_W}px`,
    'gap: 20px',
    'align-items: start',
  ].join(';')
  // Responsive: collapse to single column under 980px.
  const styleTag = document.createElement('style')
  styleTag.textContent = `
    @media (max-width: 980px) {
      .linelight-path-stage { grid-template-columns: 1fr !important; }
      .linelight-path-stage-rail { grid-row: 2; }
    }
  `
  root.appendChild(styleTag)

  // ---- Stage column (left): 3D viewport + slider + 2D aux -------
  const stageCol = document.createElement('div')
  stageCol.style.cssText = 'display: flex; flex-direction: column; gap: 12px; min-width: 0;'

  // 3D viewport with overlays.
  const viewport3D = document.createElement('div')
  viewport3D.style.cssText = `position: relative; width: 100%; aspect-ratio: ${STAGE_3D_W} / ${STAGE_3D_H}; background: #0a0a0a; border: 1px solid #1a1a1a; border-radius: 2px; overflow: hidden;`

  const canvas3D = document.createElement('canvas')
  canvas3D.width = STAGE_3D_W
  canvas3D.height = STAGE_3D_H
  canvas3D.style.cssText = 'display: block; width: 100%; height: 100%;'
  viewport3D.appendChild(canvas3D)

  // Step-id badge (top-left of 3D).
  const stepBadge = document.createElement('div')
  stepBadge.style.cssText = [
    'position: absolute',
    'top: 12px',
    'left: 14px',
    "font-family: 'JetBrains Mono', monospace",
    'font-size: 10px',
    'letter-spacing: 0.18em',
    'text-transform: uppercase',
    'color: rgba(255, 224, 102, 0.95)',
    'text-shadow: 0 0 4px rgba(0,0,0,0.85)',
    'pointer-events: none',
  ].join(';')
  viewport3D.appendChild(stepBadge)

  // Tools dock (top-right of 3D) — used by phase-wheel, prob-current toggle, etc.
  const toolsDock = document.createElement('div')
  toolsDock.style.cssText = [
    'position: absolute',
    'top: 12px',
    'right: 12px',
    'display: flex',
    'flex-direction: column',
    'gap: 6px',
    'align-items: flex-end',
  ].join(';')
  viewport3D.appendChild(toolsDock)

  stageCol.appendChild(viewport3D)

  // Slider tucked directly under the 3D viewport.
  const knobRow = document.createElement('div')
  knobRow.style.cssText = [
    'display: flex',
    'flex-wrap: wrap',
    'gap: 12px',
    'align-items: center',
    'width: 100%',
    "font-family: 'JetBrains Mono', monospace",
    'font-size: 11px',
    'color: #444',
    'padding: 6px 10px',
    'background: #fafafa',
    'border: 1px solid #e5e5e5',
    'border-radius: 2px',
  ].join(';')

  const knobLabel = document.createElement('label')
  knobLabel.style.cssText = 'min-width: 130px;'
  knobLabel.textContent = '—'
  knobRow.appendChild(knobLabel)

  const slider = document.createElement('input')
  slider.type = 'range'
  slider.style.cssText = 'flex: 1; min-width: 220px;'
  slider.min = '0'
  slider.max = '1'
  slider.step = '0.01'
  slider.value = '0'
  knobRow.appendChild(slider)

  const knobValueOut = document.createElement('span')
  knobValueOut.style.cssText = 'min-width: 90px; text-align: right;'
  knobValueOut.textContent = '0'
  knobRow.appendChild(knobValueOut)

  stageCol.appendChild(knobRow)

  // 2D auxiliary canvas — full width below 3D row, only shown when active.
  const viewport2D = document.createElement('div')
  viewport2D.style.cssText = `position: relative; width: 100%; aspect-ratio: ${STAGE_2D_W} / ${STAGE_2D_H}; background: #fafafa; border: 1px solid #0a0a0a; border-radius: 2px; display: none; overflow: hidden;`

  const aux2D = document.createElement('canvas')
  aux2D.width = STAGE_2D_W
  aux2D.height = STAGE_2D_H
  aux2D.style.cssText = 'display: block; width: 100%; height: 100%;'
  viewport2D.appendChild(aux2D)

  stageCol.appendChild(viewport2D)

  // Spectrum strip — always-visible thin band below the stage (used by photon-flight).
  const spectrumStrip = document.createElement('div')
  spectrumStrip.dataset.role = 'spectrum-strip'
  spectrumStrip.style.cssText = [
    'position: relative',
    'width: 100%',
    'height: 28px',
    'background: linear-gradient(to right, #2a004a 0%, #4400ff 9%, #00b3ff 23%, #00ff44 38%, #faff00 52%, #ff7700 66%, #c40000 80%, #2a0000 100%)',
    'border: 1px solid #0a0a0a',
    'border-radius: 2px',
    'overflow: hidden',
  ].join(';')
  stageCol.appendChild(spectrumStrip)

  root.appendChild(stageCol)

  // ---- Side rail (right): claim card + math card + tools card --
  const rail = document.createElement('aside')
  rail.className = 'linelight-path-stage-rail'
  rail.style.cssText = 'display: flex; flex-direction: column; gap: 12px; min-width: 0;'

  // Claim card.
  const claimCard = document.createElement('div')
  claimCard.dataset.role = 'claim-card'
  claimCard.style.cssText =
    "background: #fff; border: 1px solid #e5e5e5; border-radius: 2px; padding: 14px 16px; font-family: 'Newsreader', serif;"
  const claimTitle = document.createElement('div')
  claimTitle.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #888; margin-bottom: 8px;"
  claimTitle.textContent = 'claim'
  const claimBody = document.createElement('div')
  claimBody.dataset.role = 'claim-body'
  claimBody.style.cssText = 'font-size: 14px; line-height: 1.5; color: #1a1a1a;'
  claimCard.appendChild(claimTitle)
  claimCard.appendChild(claimBody)
  rail.appendChild(claimCard)

  // Caption card — longer prose.
  const captionCard = document.createElement('div')
  captionCard.style.cssText =
    'background: #fff; border: 1px solid #e5e5e5; border-radius: 2px; padding: 14px 16px;'
  const captionTitle = document.createElement('div')
  captionTitle.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #888; margin-bottom: 8px;"
  captionTitle.textContent = 'narrative'
  const caption = document.createElement('div')
  caption.dataset.role = 'caption-body'
  caption.style.cssText =
    "font-family: 'Newsreader', serif; font-size: 13.5px; line-height: 1.55; color: #1a1a1a;"
  captionCard.appendChild(captionTitle)
  captionCard.appendChild(caption)
  rail.appendChild(captionCard)

  // Math card.
  const mathCard = document.createElement('div')
  mathCard.style.cssText =
    'background: #0a0a0a; color: #f0f0f0; border: 1px solid #0a0a0a; border-radius: 2px; padding: 14px 16px;'
  const mathTitle = document.createElement('div')
  mathTitle.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #ffe066; margin-bottom: 8px;"
  mathTitle.textContent = 'math'
  const mathBody = document.createElement('pre')
  mathBody.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.6; color: #f0f0f0; margin: 0; white-space: pre-wrap;"
  mathCard.appendChild(mathTitle)
  mathCard.appendChild(mathBody)
  rail.appendChild(mathCard)

  // Tools card — dock for per-step toggles.
  const toolsCard = document.createElement('div')
  toolsCard.dataset.role = 'tools-card'
  toolsCard.style.cssText =
    'background: #fff; border: 1px solid #e5e5e5; border-radius: 2px; padding: 12px 14px; display: none;'
  const toolsTitle = document.createElement('div')
  toolsTitle.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #888; margin-bottom: 8px;"
  toolsTitle.textContent = 'tools'
  const toolsBody = document.createElement('div')
  toolsBody.dataset.role = 'tools-body'
  toolsBody.style.cssText = 'display: flex; flex-direction: column; gap: 6px;'
  toolsCard.appendChild(toolsTitle)
  toolsCard.appendChild(toolsBody)
  rail.appendChild(toolsCard)

  root.appendChild(rail)

  // ---- WebGL setup ----------------------------------------------
  let renderer: WebGLRenderer | null = null
  let has3D = false
  try {
    renderer = new WebGLRenderer({ canvas: canvas3D, antialias: true, alpha: false })
    renderer.setPixelRatio(globalThis.devicePixelRatio || 1)
    renderer.setSize(STAGE_3D_W, STAGE_3D_H, false)
    renderer.setClearColor(0x0a0a0a, 1)
    has3D = true
  } catch {
    renderer = null
    has3D = false
  }

  const scene = new Scene()
  scene.background = new Color(0x0a0a0a)
  scene.add(new AmbientLight(0x404040, 0.8))
  const sun = new DirectionalLight(0xffffff, 0.7)
  sun.position.set(3, 5, 4)
  scene.add(sun)

  const camera = new PerspectiveCamera(38, STAGE_3D_W / STAGE_3D_H, 0.05, 200)
  camera.position.set(0, 0, 12)
  camera.lookAt(0, 0, 0)

  // Skip OrbitControls. Each step takes ownership of the camera and would
  // fight controls.update() otherwise. If we want look-around in v1.2, we
  // can add it back with a per-step opt-in.
  const controls: OrbitControls | null = null

  // ---- Step lifecycle ------------------------------------------
  const tracked = new Set<Object3D>()
  let currentStep: Step | null = null
  let currentHandle: StepHandle | null = null
  let knobConfig: KnobConfig | null = null
  let currentKnob = 0
  let externalKnobListener: ((v: number) => void) | null = null

  const ctx: StageContext = {
    scene,
    camera,
    renderer,
    has3D,
    aux2D,
    setAux2DVisible(visible: boolean): void {
      viewport2D.style.display = visible ? 'block' : 'none'
    },
    trackObject<T extends Object3D>(obj: T): T {
      tracked.add(obj)
      scene.add(obj)
      return obj
    },
    setCaption(html: string): void {
      // Backwards-compatible: the previous API stuffed both the claim
      // (italic) and the body into one HTML string. Split on the first
      // `<br>` boundary if present so the claim card and narrative card
      // each get the right slice.
      const brIdx = html.indexOf('<br>')
      if (brIdx >= 0) {
        const claimHTML = html.slice(0, brIdx).replace(/^<em[^>]*>|<\/em>$/gi, '')
        const bodyHTML = html.slice(brIdx + 4)
        claimBody.innerHTML = claimHTML
        caption.innerHTML = bodyHTML
      } else {
        claimBody.innerHTML = ''
        caption.innerHTML = html
      }
    },
    setMath(html: string): void {
      // The math card on the right rail. Empty string hides the card.
      if (!html || !html.trim()) {
        mathCard.style.display = 'none'
      } else {
        mathCard.style.display = 'block'
        mathBody.innerHTML = html
      }
    },
    setKnobConfig(cfg: KnobConfig): void {
      knobConfig = cfg
      // If the persisted knob value is outside the step's slider range, fall
      // back to the step's default rather than rendering "N >> max" noise.
      if (!(currentKnob >= cfg.min && currentKnob <= cfg.max)) {
        currentKnob = cfg.default
        externalKnobListener?.(currentKnob)
      }
      knobRow.style.display = cfg.hidden ? 'none' : 'flex'
      knobLabel.textContent = cfg.label
      slider.min = String(cfg.min)
      slider.max = String(cfg.max)
      slider.step = String(cfg.step)
      slider.value = String(currentKnob)
      knobValueOut.textContent = cfg.format(currentKnob)
    },
    getKnob(): number {
      return currentKnob
    },
    setKnob(v: number): void {
      currentKnob = v
      if (knobConfig) {
        slider.value = String(v)
        knobValueOut.textContent = knobConfig.format(v)
      }
    },
    store: opts.store,
    toolsDock,
    toolsCardBody: toolsBody,
    setToolsCardVisible(visible: boolean): void {
      toolsCard.style.display = visible ? 'block' : 'none'
    },
    spectrumStrip,
  }

  function clearTrackedObjects(): void {
    for (const obj of tracked) {
      scene.remove(obj)
    }
    tracked.clear()
  }

  function mountStep(step: Step, knobValue: number, onKnobChange: (v: number) => void): void {
    if (currentHandle) {
      try {
        currentHandle.exit()
      } catch {
        // swallow — never let one step break the others
      }
      currentHandle = null
    }
    clearTrackedObjects()
    // Wipe any DOM widgets the previous step planted in the tool docks.
    toolsDock.innerHTML = ''
    toolsBody.innerHTML = ''
    toolsCard.style.display = 'none'
    currentKnob = knobValue
    externalKnobListener = onKnobChange
    stepBadge.textContent = `Step ${step.id.toString().padStart(2, '0')} · ${step.title}`
    ctx.setMath(step.math)
    ctx.setCaption(`<em style="color:#444;">${step.claim}</em><br>${step.caption}`)
    currentStep = step
    currentHandle = step.enter(ctx)
  }

  // Slider drives currentKnob + onKnob hook.
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value)
    currentKnob = v
    if (knobConfig) knobValueOut.textContent = knobConfig.format(v)
    if (currentHandle?.onKnob) currentHandle.onKnob(v)
    externalKnobListener?.(v)
  })

  // ---- rAF loop -------------------------------------------------
  let disposed = false
  let lastTickMs: number | null = null
  let t_s = 0

  function render(nowMs: number): void {
    if (disposed) return
    if (lastTickMs !== null) {
      t_s += (nowMs - lastTickMs) / 1000
    }
    lastTickMs = nowMs

    if (currentHandle?.tick) {
      currentHandle.tick({ t_s, knob: currentKnob })
    }

    if (renderer && has3D) {
      controls?.update()
      renderer.render(scene, camera)
    }

    rafHandle = requestAnimationFrame(render)
  }

  let rafHandle: number | null = null
  if (typeof requestAnimationFrame === 'function') {
    rafHandle = requestAnimationFrame(render)
  }

  function dispose(): void {
    disposed = true
    if (rafHandle !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafHandle)
    }
    if (currentHandle) {
      try {
        currentHandle.exit()
      } catch {
        // ignore
      }
      currentHandle = null
    }
    clearTrackedObjects()
    controls?.dispose()
    renderer?.dispose()
    root.remove()
  }

  return {
    root,
    has3D,
    mountStep,
    currentStepId(): number | null {
      return currentStep ? currentStep.id : null
    },
    dispose,
  }
}
