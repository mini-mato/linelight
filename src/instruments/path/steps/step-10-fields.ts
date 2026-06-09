/**
 * Step 10 — External fields move poles.
 *
 * Magnetic field: each pole splits horizontally by `Δω = m_j g_J μ_B B / ℏ`
 * (schematic g_J for v1). Pressure: every pole sinks in `Im ω` by an amount
 * proportional to collision rate `n · γ_coll = (P/k_B T) · γ_coll`.
 *
 * The observable consequence: a single emission line becomes a Zeeman
 * multiplet OR a pressure-broadened pedestal — all visible as pole motion
 * on the same complex plane we drew in step 9.
 *
 * Slider drives B field (T). Pressure is set to a moderate atmospheric value
 * so users can see the natural-width pedestal start from a non-zero baseline.
 */

import type { Step, StepHandle } from '../types'

const W = 640
const H = 220
const PAD = 28

const OMEGA0_DISPLAY = 18
const GAMMA_NATURAL = 0.6 // baseline natural width
const HBAR = 1.0545718176461565e-34
const MU_B = 9.2740100657e-24
const G_J = 1.0 // schematic Landé g-factor

function lorentzianSum(omega: number, poles: readonly { re: number; im: number }[]): number {
  let v = 0
  for (const p of poles) {
    const half = -p.im
    v += (half * half) / ((omega - p.re) * (omega - p.re) + half * half)
  }
  return v
}

export const step10Fields: Step = {
  id: 10,
  title: 'Fields move poles',
  claim: 'External fields shift, split, and broaden poles. The visible line follows.',
  caption:
    'Drag the magnetic-field slider. The single pole from step 9 splits into a Zeeman doublet — symmetric in <code>Re ω</code> by <code>Δω = ½ g_J μ_B B / ℏ</code>. The Lorentzian projection above the real axis becomes a double peak. (The Landé factor is schematic; the real one depends on the term symbol.) Pressure broadening would sink every pole deeper into the complex plane — same physics, vertical instead of horizontal. The propagator-view panel below the proof chain lets you play with both axes interactively.',
  math: 'Zeeman: Δω = ½ g_J μ_B |B| / ℏ\nPressure: ΔΓ = n · γ_coll · k_B T / P (negative Im ω)\npole₊ = (ω₀ + Δω, −Γ/2)\npole₋ = (ω₀ − Δω, −Γ/2)',
  enter(ctx): StepHandle {
    ctx.setAux2DVisible(true)
    ctx.setKnobConfig({
      label: 'B field',
      min: 0,
      max: 5,
      step: 0.01,
      default: 1.5,
      format: (v) => `B = ${v.toFixed(2)} T`,
    })

    // Compute the visual Δω that maps physical Zeeman to display coordinates.
    // Real Δω(B=1 T) = 0.5 · μ_B / ℏ ≈ 4.4×10¹⁰ rad/s. We compress that down
    // to display-frequency units (matching the OMEGA0_DISPLAY scale).
    const REAL_DELTA_PER_T = (0.5 * G_J * MU_B) / HBAR // rad/s per T
    const DISPLAY_SCALE = 0.5 / 1e10 // chosen so 1 T → 1 display unit of Δω
    const displayDeltaPerT = REAL_DELTA_PER_T * DISPLAY_SCALE

    function draw(B: number): void {
      const c = ctx.aux2D.getContext('2d')
      if (!c) return
      c.fillStyle = '#fafafa'
      c.fillRect(0, 0, W, H)

      const omegaMin = OMEGA0_DISPLAY - 6
      const omegaMax = OMEGA0_DISPLAY + 6
      const imRange = 5
      const realY = 80

      function xOf(omega: number): number {
        return PAD + ((omega - omegaMin) / (omegaMax - omegaMin)) * (W - 2 * PAD)
      }
      function yOf(imOmega: number): number {
        return realY + (-imOmega / imRange) * (H - realY - PAD)
      }

      c.strokeStyle = '#999'
      c.lineWidth = 0.5
      c.beginPath()
      c.moveTo(PAD, realY)
      c.lineTo(W - PAD, realY)
      c.stroke()

      c.fillStyle = '#666'
      c.font = "10px 'JetBrains Mono', monospace"
      c.fillText('Re ω →', W - PAD - 50, realY - 6)

      const delta = displayDeltaPerT * Math.abs(B)
      const poles =
        Math.abs(B) > 1e-6
          ? [
              { re: OMEGA0_DISPLAY + delta, im: -GAMMA_NATURAL / 2, label: 'm_j = +½' },
              { re: OMEGA0_DISPLAY - delta, im: -GAMMA_NATURAL / 2, label: 'm_j = −½' },
            ]
          : [{ re: OMEGA0_DISPLAY, im: -GAMMA_NATURAL / 2, label: '' }]

      // Lorentzian (sum of poles).
      c.strokeStyle = '#0a0a0a'
      c.lineWidth = 1.4
      c.beginPath()
      const peak = lorentzianSum(OMEGA0_DISPLAY, poles)
      for (let i = 0; i <= 240; i++) {
        const omega = omegaMin + (i / 240) * (omegaMax - omegaMin)
        const v = lorentzianSum(omega, poles) / Math.max(peak, 1e-9)
        const x = xOf(omega)
        const y = realY - v * (realY - PAD - 6)
        if (i === 0) c.moveTo(x, y)
        else c.lineTo(x, y)
      }
      c.stroke()

      // Pole markers.
      for (const p of poles) {
        const px = xOf(p.re)
        const py = yOf(p.im)
        c.setLineDash([3, 3])
        c.strokeStyle = 'rgba(255, 80, 80, 0.6)'
        c.lineWidth = 0.8
        c.beginPath()
        c.moveTo(px, realY)
        c.lineTo(px, py)
        c.stroke()
        c.setLineDash([])
        c.fillStyle = '#ff5050'
        c.beginPath()
        c.arc(px, py, 5, 0, 2 * Math.PI)
        c.fill()
        c.strokeStyle = '#0a0a0a'
        c.lineWidth = 1
        c.stroke()
        if (p.label) {
          c.fillStyle = '#0a0a0a'
          c.fillText(p.label, px + 8, py + 4)
        }
      }

      c.fillStyle = '#8a6200'
      c.font = "9px 'JetBrains Mono', monospace"
      c.fillText('(schematic g_J = 1)', PAD + 6, H - 8)
    }

    draw(ctx.getKnob())

    return {
      onKnob(v: number): void {
        draw(v)
      },
      exit(): void {
        ctx.setAux2DVisible(false)
      },
    }
  },
}
