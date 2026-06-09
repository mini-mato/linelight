/**
 * Spectral-line 4D animation.
 *
 *   |Ψ(r, t)|² = ½(|ψ_u|² + |ψ_l|²) + ψ_u*(r) ψ_l(r) · cos(ω_fi t)
 *
 * Renders on a Canvas2D in the z=0 plane (xz, viewing along +y) for
 * hydrogen-like pairs whose orbitals are closed-form (psiCartesian).
 * For non-hydrogenic lines we draw two hand-shaped lobe proxies and
 * interpolate between them via the same cos(ω_fi t) parameter.
 *
 * Slow-down: the real ω_fi is petahertz (Hα = 4.57e14 Hz → ω = 2.87e15
 * rad/s). At 60 Hz display we would alias 10^14 cycles per frame. We
 * therefore evolve the displayed phase φ_disp = (ω_fi / SLOWDOWN) · t
 * with `SLOWDOWN = 1e15`, yielding ~0.45 Hz "breathing" — slow enough
 * to read.
 *
 * The caption block at the top of the back card cites the slowdown
 * factor explicitly so the viewer never thinks they are seeing real
 * petahertz motion. The annotation reads:
 *
 *     λ = 656.281 nm · ν = 4.57e14 Hz · slowed 10^15× for visibility
 *
 * The animation suspends itself when the spectral-line back card is no
 * longer visible (the caller passes `isActive()` so we can yield).
 */

import { psiCartesian } from '../physics/atomic/wavefunction.js'
import { superpositionDensity } from '../physics/atomic/superposition.js'
import type { AppCard } from './seed.js'

const SLOWDOWN = 1e15
const GRID = 64
const HALF_EXTENT_BOHR_BASE = 14 // tuned for n≤4 hydrogen; scaled by n_upper

type Anim = NonNullable<AppCard['animation']>

export type SpectralAnimHandle = {
  /** Stop the loop and detach the canvas. */
  dispose: () => void
  /** Pause/resume — driven by Spacebar in the app shell. */
  setPaused: (paused: boolean) => void
}

/**
 * Mount the 4D animation into a container. The container is expected to
 * already be styled (the caller positions/sizes it inside the back card).
 *
 * The `isActive` callback is polled each rAF tick — when it returns
 * false (e.g. the user navigated away) the loop suspends and returns
 * without drawing.
 */
export function mountSpectralAnim(
  container: HTMLElement,
  anim: Anim,
  isActive: () => boolean,
): SpectralAnimHandle {
  // --- DOM scaffold -------------------------------------------------------
  container.innerHTML = ''
  container.classList.add('spectral-anim')

  const caption = document.createElement('div')
  caption.className = 'spectral-anim__caption'
  caption.innerHTML = buildCaption(anim)
  container.appendChild(caption)

  const canvasWrap = document.createElement('div')
  canvasWrap.className = 'spectral-anim__canvas-wrap'
  container.appendChild(canvasWrap)

  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 240
  canvas.className = 'spectral-anim__canvas'
  canvasWrap.appendChild(canvas)

  const phaseLine = document.createElement('div')
  phaseLine.className = 'spectral-anim__phase'
  canvasWrap.appendChild(phaseLine)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    container.textContent = '(canvas unavailable)'
    return { dispose: () => {}, setPaused: () => {} }
  }

  // --- Precompute the two |ψ|² fields and the cross term -----------------
  // For 'hydrogen-orbital-pair' we sample ψ_u and ψ_l on a fixed grid.
  // For 'schematic-interp' we synthesize two lobe-pattern fields.
  const fields =
    anim.kind === 'hydrogen-orbital-pair' ? sampleHydrogenPair(anim) : sampleSchematicPair(anim)

  // --- Animation loop -----------------------------------------------------
  let raf = 0
  let paused = false
  let pauseStartedAt = 0
  let pausedAccum = 0
  const start = performance.now()

  const tick = (nowMs: number) => {
    if (!isActive()) {
      raf = 0
      return
    }
    let elapsedMs: number
    if (paused) {
      elapsedMs = pauseStartedAt - start - pausedAccum
    } else {
      elapsedMs = nowMs - start - pausedAccum
    }
    const tDisplay = elapsedMs / 1000 // seconds shown to viewer
    const phaseRad = ((anim.omegaFi / SLOWDOWN) * tDisplay) % (2 * Math.PI)
    const cosOmegaT = Math.cos(phaseRad)
    drawDensity(ctx, fields, cosOmegaT)
    drawPhaseAnnotation(phaseLine, phaseRad, paused)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return {
    dispose: () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      container.innerHTML = ''
    },
    setPaused: (p: boolean) => {
      if (p === paused) return
      if (p) {
        pauseStartedAt = performance.now()
      } else {
        pausedAccum += performance.now() - pauseStartedAt
      }
      paused = p
    },
  }
}

// ---------------------------------------------------------------------------
// Caption block
// ---------------------------------------------------------------------------

function buildCaption(anim: Anim): string {
  const lambda = anim.lambdaNm.toPrecision(6)
  const nu = anim.nuHz.toExponential(2).replace('e+', 'e')
  const slowed = `1e${Math.log10(SLOWDOWN).toFixed(0)}`
  const branchLine =
    anim.kind === 'hydrogen-orbital-pair'
      ? `<div class="spectral-anim__branch">closed-form ψ — ${escapeHtml(anim.branchLabel)}</div>`
      : `<div class="spectral-anim__branch spectral-anim__branch--schematic">(schematic) ${escapeHtml(anim.upperLabel)} ↔ ${escapeHtml(anim.lowerLabel)} — real multi-electron orbitals would require numerical Hartree-Fock; the geometry shown is conceptual.</div>`
  return `
    <div class="spectral-anim__lines">
      <div><span class="spectral-anim__tag">1D</span> λ at ${escapeHtml(String(lambda))} nm — the eigenvalue difference</div>
      <div><span class="spectral-anim__tag">2D</span> the photon's wave packet (decays at γ = 1/τ; FWHM = ℏ/τ)</div>
      <div><span class="spectral-anim__tag">3D</span> each eigenstate's |ψ(r)|² is a stationary cloud</div>
      <div><span class="spectral-anim__tag">4D</span> this animation — |Ψ(r,t)|² oscillating at ω_fi between them</div>
    </div>
    ${branchLine}
    <div class="spectral-anim__rate">λ = ${escapeHtml(String(lambda))} nm · ν = ${escapeHtml(nu)} Hz · ν actually shown is slowed by ${escapeHtml(slowed)}× for visibility</div>
  `
}

// ---------------------------------------------------------------------------
// Sample fields
// ---------------------------------------------------------------------------

type Fields = {
  psiU: Float32Array
  psiL: Float32Array
  /** |ψ_u|² + |ψ_l|² (half-sum stored). */
  baseline: Float32Array
  /** ψ_u · ψ_l (cross term, signed). */
  cross: Float32Array
  /** Max baseline across the grid (for normalisation). */
  baselineMax: number
  /** Max cross magnitude. */
  crossMax: number
}

function sampleHydrogenPair(anim: Extract<Anim, { kind: 'hydrogen-orbital-pair' }>): Fields {
  const N = GRID
  const psiU = new Float32Array(N * N)
  const psiL = new Float32Array(N * N)
  const baseline = new Float32Array(N * N)
  const cross = new Float32Array(N * N)
  const halfExtent = (HALF_EXTENT_BOHR_BASE * Math.max(anim.upper.n, anim.lower.n)) / 3

  let bMax = 0
  let cMax = 0
  for (let j = 0; j < N; j++) {
    const z = ((j + 0.5) / N) * 2 * halfExtent - halfExtent
    for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N) * 2 * halfExtent - halfExtent
      const psiu = psiCartesian(anim.upper.n, anim.upper.l, anim.upper.m, anim.Z, x, 0, z)
      const psil = psiCartesian(anim.lower.n, anim.lower.l, anim.lower.m, anim.Z, x, 0, z)
      const idx = j * N + i
      psiU[idx] = psiu
      psiL[idx] = psil
      const b = 0.5 * (psiu * psiu + psil * psil)
      const cr = psiu * psil
      baseline[idx] = b
      cross[idx] = cr
      if (b > bMax) bMax = b
      if (Math.abs(cr) > cMax) cMax = Math.abs(cr)
    }
  }
  return { psiU, psiL, baseline, cross, baselineMax: bMax, crossMax: cMax }
}

/**
 * Hand-drawn lobe shape proxies for schematic multi-electron lines.
 *
 * Upper state: a four-lobed pattern (p-like + extra node).
 * Lower state: a centrally-peaked Gaussian-ish blob (s-like).
 * These are NOT physical orbitals; they exist only to make the
 * 4D-oscillation idea visually legible for cards where we cannot
 * honestly compute ψ. The caption carries the `(schematic)` label.
 */
function sampleSchematicPair(_: Extract<Anim, { kind: 'schematic-interp' }>): Fields {
  const N = GRID
  const psiU = new Float32Array(N * N)
  const psiL = new Float32Array(N * N)
  const baseline = new Float32Array(N * N)
  const cross = new Float32Array(N * N)
  const halfExtent = 5

  let bMax = 0
  let cMax = 0
  for (let j = 0; j < N; j++) {
    const z = ((j + 0.5) / N) * 2 * halfExtent - halfExtent
    for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N) * 2 * halfExtent - halfExtent
      const r2 = x * x + z * z
      // upper: pz-like (cos θ along z) with extra radial node
      const r = Math.sqrt(r2)
      const cosTheta = r === 0 ? 0 : z / r
      const upper = cosTheta * (1 - r / 3) * Math.exp(-r / 2.5)
      // lower: 1s-like
      const lower = Math.exp(-r / 1.5)
      const idx = j * N + i
      psiU[idx] = upper
      psiL[idx] = lower
      const b = 0.5 * (upper * upper + lower * lower)
      const cr = upper * lower
      baseline[idx] = b
      cross[idx] = cr
      if (b > bMax) bMax = b
      if (Math.abs(cr) > cMax) cMax = Math.abs(cr)
    }
  }
  return { psiU, psiL, baseline, cross, baselineMax: bMax, crossMax: cMax }
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

function drawDensity(ctx: CanvasRenderingContext2D, fields: Fields, cosOmegaT: number): void {
  const N = GRID
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  const img = ctx.createImageData(w, h)
  // Combined density at the grid scale, then nearest-sample to canvas px.
  const peakMag = fields.baselineMax + fields.crossMax
  // Achromatic heatmap from #fdfdfd (low density) → #0e2a2f (high).
  // We pre-extract the channels for the linear interpolation.
  const lo = { r: 253, g: 253, b: 253 }
  const hi = { r: 14, g: 42, b: 47 }

  for (let py = 0; py < h; py++) {
    // Flip y so positive z (cell index j) goes up on screen.
    const ny = N - 1 - Math.floor((py / h) * N)
    for (let px = 0; px < w; px++) {
      const nx = Math.floor((px / w) * N)
      const idx = ny * N + nx
      const density = superpositionDensity(fields.psiU[idx], fields.psiL[idx], cosOmegaT)
      // Map [0, peakMag] → [0, 1], clip negatives at 0 (the spec stresses
      // that the SPATIAL integral remains 1 but local density can dip
      // below the baseline; clipping at 0 reads as "no electron here").
      const t = Math.max(0, Math.min(1, density / peakMag))
      const r = lo.r + (hi.r - lo.r) * t
      const g = lo.g + (hi.g - lo.g) * t
      const b = lo.b + (hi.b - lo.b) * t
      const offset = (py * w + px) * 4
      img.data[offset] = r
      img.data[offset + 1] = g
      img.data[offset + 2] = b
      img.data[offset + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  // Axis cross at the origin.
  ctx.save()
  ctx.strokeStyle = 'rgba(14, 42, 47, 0.2)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, h / 2)
  ctx.lineTo(w, h / 2)
  ctx.moveTo(w / 2, 0)
  ctx.lineTo(w / 2, h)
  ctx.stroke()
  ctx.fillStyle = 'rgba(14, 42, 47, 0.55)'
  ctx.font = '10px ui-monospace, Menlo, monospace'
  ctx.fillText('+z', w / 2 + 4, 12)
  ctx.fillText('+x', w - 16, h / 2 - 4)
  ctx.restore()
}

function drawPhaseAnnotation(el: HTMLElement, phaseRad: number, paused: boolean): void {
  const phaseFrac = phaseRad / (2 * Math.PI)
  el.textContent = `phase = ωt/2π = ${phaseFrac.toFixed(3)} ∈ [0, 1)${paused ? '  · paused' : ''}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
