/**
 * Atom View — 2D cloud mode.
 *
 * Two side-by-side Canvas2D panes showing |ψ|² of the upper and lower
 * states of the active transition, sliced through the xz-plane (y=0,
 * axially symmetric — Bransden / Hyperphysics / Falstad convention).
 *
 * Each pane is sized adaptively to (n, l, Z_eff) via
 * `recommendedBoxHalfExtent_Bohr` — across n the field-of-view ratio is
 * roughly n²:n²; failing to scale would let high-n orbitals collapse to
 * specks. The signed-thermal colormap (red = +ψ, blue = −ψ, white = 0)
 * lives in `./colormap`.
 *
 * The instrument re-renders only the affected pane on selection change
 * (compared by n / l / electronConfig). It does NOT subscribe to
 * `display.modes.colorPipeline` — Atom View doesn't use the wavelength
 * color pipeline.
 *
 * Pedagogical content (added in the formula/animation upgrade):
 *   - A monospace ψ formula caption per pane (closed-form ψ_nlm).
 *   - A node-count callout: "nodes: N total (R radial · A angular)".
 *   - A fire-bus crossfade animation: on each FireEvent the upper pane
 *     fades down while the lower fades in, then both return; a glow ring
 *     briefly pulses around the lower pane. Animation total ≈ 1500 ms.
 *     Subsequent fires while an animation is active are debounced.
 */

import type { Store } from '../../../../store'
import type {
  AtomViewSettings,
  AtomViewSlicePlane,
  ElementSymbol,
  TermState,
} from '../../../../types'
import { fireBus, type FireBus } from '../../../../store/fire-bus'
import { effectiveZ, recommendedBoxHalfExtent_Bohr } from '../../../../physics/atomic'
import { sampleField } from './field'
import { renderField } from './render'
import { paneCaption, transitionString, psiFormula, nodeCount, type PaneRole } from './caption'

const CSS_PX = 360 // logical pane size; backing store scales by DPR
const FONT_MONO = "'JetBrains Mono', monospace"
const FONT_UI = "'Inter', system-ui, sans-serif"

/**
 * Animation timing (ms). Three equal phases plus the total.
 *   Phase A [0,    PHASE_MS):     upper solid (1.0); lower faded (0.2)
 *   Phase B [PHASE_MS, 2*PHASE_MS): upper 1→0.2; lower 0.2→1
 *   Phase C [2*PHASE_MS, 3*PHASE_MS): both → 1; glow ring on lower fades 1→0
 */
const PHASE_MS = 500
const ANIM_TOTAL_MS = PHASE_MS * 3
const FADED_OPACITY = 0.2

type Pane = {
  root: HTMLDivElement
  /** Wraps canvas + glow overlay so opacity transitions don't disturb layout. */
  canvasWrap: HTMLDivElement
  canvas: HTMLCanvasElement
  /** Glow-ring overlay used in phase C of the fire animation. */
  glow: HTMLDivElement
  caption: HTMLDivElement
  formulaCaption: HTMLDivElement
  nodesCaption: HTMLDivElement
  /** Last-rendered TermState; used to compare on subscribe to skip re-render. */
  lastTerm: TermState | null
}

/** Compare two TermStates for "did the orbital change visually?" */
function termOrbitalEquals(a: TermState | null, b: TermState | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.n === b.n &&
    a.l === b.l &&
    a.m === b.m &&
    a.electronConfig === b.electronConfig &&
    a.termSymbol === b.termSymbol &&
    a.energy_eV === b.energy_eV
  )
}

function roleM(settings: AtomViewSettings, role: PaneRole, term: TermState): number {
  const m = role === 'upper' ? settings.upperM : settings.lowerM
  return Number.isInteger(m) && Math.abs(m) <= term.l ? m : 0
}

function renderKey(
  element: ElementSymbol,
  term: TermState,
  m: number,
  plane: AtomViewSlicePlane,
  nodesVisible: boolean,
): string {
  return [
    element,
    term.n,
    term.l,
    term.m ?? '',
    m,
    plane,
    nodesVisible ? 1 : 0,
    term.electronConfig,
  ].join(':')
}

/** Resolve the device-pixel-ratio backing-store size for a pane. */
function backingPixels(): number {
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1
  // Clamp DPR to a sane range to avoid pathological allocations on weird env.
  const clamped = Math.max(1, Math.min(3, dpr))
  return Math.round(CSS_PX * clamped)
}

function buildPane(role: PaneRole): Pane {
  const root = document.createElement('div')
  root.setAttribute('data-pane', role)
  root.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  `

  // Wrap the canvas in a position:relative div so the glow overlay can sit on
  // top without disturbing layout. Opacity is applied to the wrap so the glow
  // and canvas can fade together (or independently when needed).
  const canvasWrap = document.createElement('div')
  canvasWrap.setAttribute('data-role', 'canvas-wrap')
  canvasWrap.style.cssText = `
    position: relative;
    width: ${CSS_PX}px;
    height: ${CSS_PX}px;
    opacity: 1;
    transition: none;
  `

  const canvas = document.createElement('canvas')
  const px = backingPixels()
  canvas.width = px
  canvas.height = px
  canvas.style.cssText = `
    width: ${CSS_PX}px;
    height: ${CSS_PX}px;
    border: 1px solid #0a0a0a;
    background: #fff;
    image-rendering: auto;
    display: block;
    opacity: 1;
  `

  // Glow ring: 1px brand-blue ring with a soft outer shadow. Hidden until the
  // fire animation drives it up. Pointer-events disabled so it never blocks.
  const glow = document.createElement('div')
  glow.setAttribute('data-role', 'glow')
  glow.style.cssText = `
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 2px solid rgba(31, 78, 168, 0.85);
    box-shadow: 0 0 18px 4px rgba(31, 78, 168, 0.45);
    pointer-events: none;
    opacity: 0;
  `

  canvasWrap.appendChild(canvas)
  canvasWrap.appendChild(glow)

  // Pedagogical formula caption — small monospace gray, one line above the
  // existing label caption.
  const formulaCaption = document.createElement('div')
  formulaCaption.setAttribute('data-role', 'formula')
  formulaCaption.style.cssText = `
    font-family: ${FONT_MONO};
    font-size: 10px;
    letter-spacing: 0.02em;
    color: #6b6b6b;
    text-align: center;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: ${CSS_PX}px;
  `

  const nodesCaption = document.createElement('div')
  nodesCaption.setAttribute('data-role', 'nodes')
  nodesCaption.style.cssText = `
    font-family: ${FONT_MONO};
    font-size: 10px;
    letter-spacing: 0.02em;
    color: #6b6b6b;
    text-align: center;
    line-height: 1.4;
  `

  const caption = document.createElement('div')
  caption.setAttribute('data-role', 'caption')
  caption.style.cssText = `
    font-family: ${FONT_MONO};
    font-size: 11px;
    letter-spacing: 0.04em;
    color: #0a0a0a;
    text-align: center;
    line-height: 1.4;
  `

  root.appendChild(canvasWrap)
  root.appendChild(formulaCaption)
  root.appendChild(nodesCaption)
  root.appendChild(caption)

  return {
    root,
    canvasWrap,
    canvas,
    glow,
    caption,
    formulaCaption,
    nodesCaption,
    lastTerm: null,
  }
}

function buildHeader(): {
  root: HTMLDivElement
  elementEl: HTMLSpanElement
  transitionEl: HTMLSpanElement
} {
  const root = document.createElement('div')
  root.style.cssText = `
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  `

  const tag = document.createElement('div')
  tag.style.cssText = `
    font-family: ${FONT_MONO};
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #6b6b6b;
  `
  tag.textContent = 'atom view · 2d slice'

  const meta = document.createElement('div')
  meta.style.cssText = `
    font-family: ${FONT_MONO};
    font-size: 11px;
    letter-spacing: 0.04em;
    color: #0a0a0a;
    display: flex;
    gap: 14px;
    align-items: baseline;
  `
  const elementEl = document.createElement('span')
  elementEl.setAttribute('data-role', 'element')
  const transitionEl = document.createElement('span')
  transitionEl.setAttribute('data-role', 'transition')
  meta.appendChild(elementEl)
  meta.appendChild(transitionEl)

  root.appendChild(tag)
  root.appendChild(meta)
  return { root, elementEl, transitionEl }
}

/**
 * Effective nuclear charge for a state in `element` at (n, l), with a
 * physically-defensible floor.
 *
 * Slater's rules are calibrated to ground-state configurations. For an
 * EXCITED state of a single-electron atom (e.g. hydrogen 3p), the rules
 * over-screen — they treat the still-empty 1s as fully-occupied "inner
 * shell" and return Z_eff ≤ 0. For a single-electron atom there's
 * nothing actually screening the active electron, so we floor at 1.0.
 *
 * For multi-electron elements, we still floor at a small positive value
 * to keep the renderer numerically well-defined; in practice ground-
 * state Slater never goes below ~0.3 for realistic species.
 */
function resolveEffectiveZ(element: ElementSymbol, n: number, l: number): number {
  let raw = 1
  try {
    raw = effectiveZ(element, n, l)
  } catch {
    raw = element === 'H' ? 1 : 0.5
  }
  if (raw >= 1) return raw
  // Hydrogen always has Z=1 nuclear; any excited state has the lone
  // electron in the active orbital and nothing screening it.
  if (element === 'H') return 1
  // Any other element: clamp away from 0 so box.ts doesn't reject it.
  return Math.max(raw, 0.5)
}

function canUseCanvas2D(canvas: HTMLCanvasElement): boolean {
  const isJSDOM =
    typeof navigator !== 'undefined' &&
    typeof navigator.userAgent === 'string' &&
    navigator.userAgent.toLowerCase().includes('jsdom')
  if (!isJSDOM) return true
  return canvas.getContext.name !== 'getContext'
}

/** Paint a single pane for a (term, element) pair. */
function paintPane(
  pane: Pane,
  role: PaneRole,
  element: ElementSymbol,
  term: TermState,
  m: number,
  plane: AtomViewSlicePlane,
  nodesVisible: boolean,
): void {
  // Set the captions first so DOM-only environments (jsdom without canvas
  // support) still get legible caption updates.
  pane.caption.textContent = paneCaption(role, term)
  pane.formulaCaption.textContent = `m=${m} · ${plane} · ${psiFormula(term.n, term.l)}`
  pane.nodesCaption.textContent = nodesVisible ? nodeCount(term.n, term.l) : ''
  pane.lastTerm = term

  if (!canUseCanvas2D(pane.canvas)) return
  const Z = resolveEffectiveZ(element, term.n, term.l)
  const halfExtent = recommendedBoxHalfExtent_Bohr(term.n, term.l, Z)
  const ctx = pane.canvas.getContext('2d')
  if (!ctx) return // cannot render in this environment (e.g. headless jsdom)

  const field = sampleField({
    n: term.n,
    l: term.l,
    m,
    Z,
    plane,
    halfExtent_Bohr: halfExtent,
    pixelsW: pane.canvas.width,
    pixelsH: pane.canvas.height,
  })
  renderField(ctx, field)
}

/* -------------------------------------------------------------------------- */
/* Crossfade animation on fire-bus events                                      */
/* -------------------------------------------------------------------------- */

/**
 * Drive `pane.canvasWrap.style.opacity` and `pane.glow.style.opacity` for the
 * duration of one fire animation. The function returns a stop() that the
 * teardown path can call to abort an in-flight RAF chain.
 *
 * Debounce policy: the controller refuses to start a new animation while
 * `running` is true; subsequent fires are dropped on the floor. (This matches
 * the spec: "let the current animation finish, then animate again" — but in
 * practice we don't queue, we suppress, because queueing would fire visually
 * after the user has already moved on.)
 */
type AnimController = {
  trigger: () => void
  /** Cancel any in-flight RAF and reset overlay opacities. */
  stop: () => void
  /** True while an animation is active. */
  isRunning: () => boolean
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Pick a requestAnimationFrame implementation. jsdom doesn't always expose one
 * (and tests use fake timers), so we fall back to setTimeout at ~60 fps. The
 * shape mirrors window.requestAnimationFrame.
 */
function getRAF(): {
  request: (cb: (t: number) => void) => number
  cancel: (id: number) => void
  now: () => number
} {
  const hasWindowRAF =
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function' &&
    typeof window.cancelAnimationFrame === 'function'
  if (hasWindowRAF) {
    return {
      request: (cb) => window.requestAnimationFrame(cb),
      cancel: (id) => window.cancelAnimationFrame(id),
      now: () =>
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now(),
    }
  }
  return {
    request: (cb) => {
      const start =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now()
      return setTimeout(() => cb(start + 16), 16) as unknown as number
    },
    cancel: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
    now: () =>
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now(),
  }
}

function buildAnimController(upper: Pane, lower: Pane): AnimController {
  const raf = getRAF()
  let rafId: number | null = null
  let running = false
  let startedAt = 0

  function setOpacities(elapsed: number): void {
    // Phase A: 0..PHASE_MS → upper solid, lower faded
    // Phase B: PHASE_MS..2*PHASE_MS → upper 1→FADED, lower FADED→1
    // Phase C: 2*PHASE_MS..3*PHASE_MS → both back to 1, glow on lower 1→0
    let upperO: number
    let lowerO: number
    let glowO: number

    if (elapsed < PHASE_MS) {
      upperO = 1
      lowerO = FADED_OPACITY
      glowO = 0
    } else if (elapsed < 2 * PHASE_MS) {
      const t = easeInOutCubic((elapsed - PHASE_MS) / PHASE_MS)
      upperO = lerp(1, FADED_OPACITY, t)
      lowerO = lerp(FADED_OPACITY, 1, t)
      glowO = lerp(0, 1, t)
    } else if (elapsed < 3 * PHASE_MS) {
      const t = easeInOutCubic((elapsed - 2 * PHASE_MS) / PHASE_MS)
      upperO = lerp(FADED_OPACITY, 1, t)
      lowerO = 1
      glowO = lerp(1, 0, t)
    } else {
      // Settled (clamped exit state).
      upperO = 1
      lowerO = 1
      glowO = 0
    }

    upper.canvasWrap.style.opacity = String(upperO)
    lower.canvasWrap.style.opacity = String(lowerO)
    lower.glow.style.opacity = String(glowO)
  }

  function tick(): void {
    if (!running) return
    const elapsed = raf.now() - startedAt
    if (elapsed >= ANIM_TOTAL_MS) {
      // Snap to settled state and stop.
      setOpacities(ANIM_TOTAL_MS)
      running = false
      rafId = null
      return
    }
    setOpacities(elapsed)
    rafId = raf.request(() => tick())
  }

  function trigger(): void {
    if (running) return // debounce: drop overlapping fires
    running = true
    startedAt = raf.now()
    setOpacities(0)
    rafId = raf.request(() => tick())
  }

  function stop(): void {
    if (rafId !== null) raf.cancel(rafId)
    rafId = null
    running = false
    upper.canvasWrap.style.opacity = '1'
    lower.canvasWrap.style.opacity = '1'
    lower.glow.style.opacity = '0'
  }

  return { trigger, stop, isRunning: () => running }
}

/**
 * Mount the Atom View 2D instrument. The optional `bus` argument is exposed
 * primarily for tests — production callers pass nothing and get the singleton
 * `fireBus` from `src/store/fire-bus`.
 */
export function mountAtomView2D(
  container: HTMLElement,
  store: Store,
  bus: FireBus = fireBus,
): () => void {
  // Outer scaffolding
  const outer = document.createElement('div')
  outer.className = 'atom-view-2d'
  outer.style.cssText = `
    font-family: ${FONT_UI};
    color: #0a0a0a;
  `

  const header = buildHeader()
  outer.appendChild(header.root)

  const grid = document.createElement('div')
  grid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(2, minmax(0, max-content));
    justify-content: center;
    gap: 32px;
  `
  // Stack on narrow screens — keep both panes legible without horizontal
  // scroll. Browsers without media-query support fall back to the 2-col grid
  // which is still usable.
  const mqStyle = document.createElement('style')
  mqStyle.textContent = `
    @media (max-width: 820px) {
      .atom-view-2d > div[data-role="grid"] {
        grid-template-columns: 1fr !important;
      }
    }
  `
  outer.appendChild(mqStyle)
  grid.setAttribute('data-role', 'grid')

  const upperPane = buildPane('upper')
  const lowerPane = buildPane('lower')
  grid.appendChild(upperPane.root)
  grid.appendChild(lowerPane.root)
  outer.appendChild(grid)

  container.appendChild(outer)

  function render(force: boolean = false): void {
    const state = store.getState()
    const { element, upper, lower } = state.selection
    const { atomView } = state.display
    const upperM = roleM(atomView, 'upper', upper)
    const lowerM = roleM(atomView, 'lower', lower)

    header.elementEl.textContent = `element · ${element}`
    header.transitionEl.textContent = `${transitionString(upper, lower)}`

    const upperKey = renderKey(element, upper, upperM, atomView.slicePlane, atomView.nodesVisible)
    const lowerKey = renderKey(element, lower, lowerM, atomView.slicePlane, atomView.nodesVisible)
    if (
      force ||
      upperPane.canvas.dataset.renderKey !== upperKey ||
      !termOrbitalEquals(upperPane.lastTerm, upper)
    ) {
      upperPane.canvas.dataset.renderKey = upperKey
      paintPane(
        upperPane,
        'upper',
        element,
        upper,
        upperM,
        atomView.slicePlane,
        atomView.nodesVisible,
      )
    }
    if (
      force ||
      lowerPane.canvas.dataset.renderKey !== lowerKey ||
      !termOrbitalEquals(lowerPane.lastTerm, lower)
    ) {
      lowerPane.canvas.dataset.renderKey = lowerKey
      paintPane(
        lowerPane,
        'lower',
        element,
        lower,
        lowerM,
        atomView.slicePlane,
        atomView.nodesVisible,
      )
    }
  }

  // Initial paint
  render(true)

  // Subscribe — re-render only the affected pane(s) when selection changes.
  // We compare by orbital identity; energy/term are bundled into the equality
  // check for completeness so that a re-bound TermState forces a repaint.
  let lastElement: ElementSymbol = store.getState().selection.element
  const unsubscribe = store.subscribe((next) => {
    const force = next.selection.element !== lastElement
    lastElement = next.selection.element
    render(force)
  })

  // Fire-bus crossfade animation.
  const anim = buildAnimController(upperPane, lowerPane)
  const unsubscribeFire = bus.subscribe(() => {
    anim.trigger()
  })

  return () => {
    unsubscribe()
    unsubscribeFire()
    anim.stop()
    if (outer.parentElement === container) {
      container.removeChild(outer)
    }
    // Clear DOM unconditionally (matches Grotrian teardown discipline).
    container.innerHTML = ''
  }
}
