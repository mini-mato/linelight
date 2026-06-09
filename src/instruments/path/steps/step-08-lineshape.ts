/**
 * Step 8 — Lineshape from Fourier transform.
 *
 * The truncated wavetrain `E(t) = e^(−Γt/2) · cos(ω₀ t) · θ(t)` Fourier-
 * transforms to a Lorentzian centered at ω₀ with full-width-at-half-max Γ:
 *
 *     |Ê(ω)|² ∝ Γ² / [(ω − ω₀)² + (Γ/2)²]
 *
 * Show both halves side-by-side in the 2D auxiliary canvas: time-domain on
 * the left, frequency-domain on the right. As Γ grows, the train shortens
 * AND the spectral peak broadens, simultaneously. This is the time-energy
 * uncertainty relation in pictures.
 */

import type { Step, StepHandle } from '../types'

const W = 640
const H = 220
const PAD_T = 18
const PAD_B = 28
const SPLIT = W / 2 - 8

const OMEGA_DISPLAY = 6 * Math.PI
const T_MAX = 10

function lorentzian(omega: number, omega0: number, gamma: number): number {
  const half = gamma / 2
  return (half * half) / ((omega - omega0) * (omega - omega0) + half * half)
}

export const step08Lineshape: Step = {
  id: 8,
  title: 'Lineshape',
  claim: 'A finite-lifetime wavetrain Fourier-transforms to a Lorentzian peak of width Γ.',
  caption:
    "Left: the same decaying wavetrain from step 7, time on x. Right: its squared Fourier transform, frequency on x. The two are conjugate. As Γ increases, the train gets shorter AND the spectral peak gets broader. This is why an excited state's lifetime sets the spectral linewidth: Δt · Δω ≳ 1. The Lorentzian profile is the natural lineshape for any radiatively-broadened atomic transition.",
  math: 'E(t) = e^(−Γt/2) · cos(ω₀ t) · θ(t)\n|Ê(ω)|² ∝ Γ² / [(ω−ω₀)² + (Γ/2)²]\nFWHM = Γ',
  enter(ctx): StepHandle {
    ctx.setAux2DVisible(true)
    ctx.setKnobConfig({
      label: 'Decay rate Γ',
      min: 0.05,
      max: 5.0,
      step: 0.01,
      default: 0.5,
      format: (v) => `Γ = ${v.toFixed(2)} · τ = ${(1 / v).toFixed(2)}`,
    })

    function draw(gamma: number): void {
      const c = ctx.aux2D.getContext('2d')
      if (!c) return
      c.fillStyle = '#fafafa'
      c.fillRect(0, 0, W, H)

      // Splitter line.
      c.strokeStyle = '#999'
      c.lineWidth = 0.5
      c.beginPath()
      c.moveTo(SPLIT, PAD_T)
      c.lineTo(SPLIT, H - PAD_B)
      c.stroke()

      // ---- Left half: wavetrain ----
      const leftL = 40
      const leftR = SPLIT - 12
      c.beginPath()
      c.moveTo(leftL, H / 2)
      c.lineTo(leftR, H / 2)
      c.stroke()

      c.fillStyle = '#666'
      c.font = "10px 'JetBrains Mono', monospace"
      c.fillText('time domain — E(t)', leftL, PAD_T + 4)

      c.strokeStyle = 'rgba(255, 80, 80, 0.55)'
      c.lineWidth = 1
      c.beginPath()
      for (let i = 0; i < 400; i++) {
        const t = (i / 399) * T_MAX
        const env = Math.exp((-gamma * t) / 2)
        const x = leftL + (i / 399) * (leftR - leftL)
        const y = H / 2 - env * (H / 2 - PAD_T - 6)
        if (i === 0) c.moveTo(x, y)
        else c.lineTo(x, y)
      }
      c.stroke()

      c.strokeStyle = '#0a0a0a'
      c.lineWidth = 1.1
      c.beginPath()
      for (let i = 0; i < 800; i++) {
        const t = (i / 799) * T_MAX
        const env = Math.exp((-gamma * t) / 2)
        const y0 = env * Math.cos(OMEGA_DISPLAY * t)
        const x = leftL + (i / 799) * (leftR - leftL)
        const y = H / 2 - y0 * (H / 2 - PAD_T - 6)
        if (i === 0) c.moveTo(x, y)
        else c.lineTo(x, y)
      }
      c.stroke()

      // ---- Right half: Lorentzian ----
      const rightL = SPLIT + 12
      const rightR = W - 14
      c.strokeStyle = '#999'
      c.lineWidth = 0.5
      c.beginPath()
      c.moveTo(rightL, H - PAD_B)
      c.lineTo(rightR, H - PAD_B)
      c.stroke()

      c.fillStyle = '#666'
      c.fillText('frequency — |Ê(ω)|²', rightL, PAD_T + 4)

      const omega0 = OMEGA_DISPLAY
      const omegaSpan = Math.max(3 * gamma, 8)
      const omegaMin = omega0 - omegaSpan
      const omegaMax = omega0 + omegaSpan
      const peak = lorentzian(omega0, omega0, gamma)

      c.strokeStyle = '#0a0a0a'
      c.lineWidth = 1.4
      c.beginPath()
      for (let i = 0; i <= 200; i++) {
        const omega = omegaMin + (i / 200) * (omegaMax - omegaMin)
        const v = lorentzian(omega, omega0, gamma) / peak
        const x = rightL + (i / 200) * (rightR - rightL)
        const y = H - PAD_B - v * (H - PAD_T - PAD_B - 8)
        if (i === 0) c.moveTo(x, y)
        else c.lineTo(x, y)
      }
      c.stroke()

      // Half-max line.
      const halfY = H - PAD_B - 0.5 * (H - PAD_T - PAD_B - 8)
      c.strokeStyle = 'rgba(80, 80, 200, 0.5)'
      c.setLineDash([4, 3])
      c.lineWidth = 0.8
      c.beginPath()
      c.moveTo(rightL, halfY)
      c.lineTo(rightR, halfY)
      c.stroke()
      c.setLineDash([])

      c.fillStyle = '#5a5aa8'
      c.fillText(`FWHM = Γ = ${gamma.toFixed(2)}`, rightL + 4, halfY - 4)
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
