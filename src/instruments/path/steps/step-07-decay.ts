/**
 * Step 7 — Spontaneous emission as decay (Wigner–Weisskopf).
 *
 * The excited state can't live forever because it's coupled to the
 * continuum of vacuum electromagnetic modes. Resulting amplitude:
 *
 *     c_upper(t) = e^(−Γ t / 2)
 *
 * with `Γ = A` (the Einstein A coefficient). The emitted wavetrain is a
 * sinusoid at ω₀ multiplied by this decaying envelope. As τ = 1/A grows
 * (longer-lived state), the wavetrain spans more cycles before vanishing.
 *
 * Visualization: the 2D auxiliary canvas becomes the stage. Time on x,
 * amplitude on y. Slider controls Γ (i.e. lifetime τ).
 */

import type { Step, StepHandle } from '../types'

const W = 640
const H = 220
const PAD_L = 40
const PAD_R = 20
const PAD_T = 20
const PAD_B = 30

const OMEGA_DISPLAY = 6 * Math.PI // 3 cycles per "1 time unit"
const T_MAX = 10 // display time axis units

export const step07Decay: Step = {
  id: 7,
  title: 'Decay',
  claim: 'The excited state amplitude decays as e^(−Γt/2). The wavetrain is finite.',
  caption:
    'Wigner–Weisskopf: the excited state is coupled to the continuum of vacuum EM modes, so its population leaks out exponentially. <code>|c_upper(t)|² = e^(−Γt)</code>. The emitted electromagnetic wavetrain is therefore a sinusoid at ω₀ multiplied by a decaying envelope. Slide Γ: a long-lived state (small Γ) produces many oscillations before fading; a short-lived state (large Γ) emits a brief burst. Step 8 turns this finite-duration train into a frequency-domain peak.',
  math: 'c_upper(t) = e^(−Γt/2)\nΓ = A (Einstein A coeff.)\nτ = 1/Γ\n‖E(t)‖ ∝ e^(−Γt/2) · cos(ω₀ t)',
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
      const ctx2d = ctx.aux2D.getContext('2d')
      if (!ctx2d) return
      ctx2d.fillStyle = '#fafafa'
      ctx2d.fillRect(0, 0, W, H)

      // Axes.
      ctx2d.strokeStyle = '#999'
      ctx2d.lineWidth = 0.5
      ctx2d.beginPath()
      ctx2d.moveTo(PAD_L, H / 2)
      ctx2d.lineTo(W - PAD_R, H / 2)
      ctx2d.moveTo(PAD_L, PAD_T)
      ctx2d.lineTo(PAD_L, H - PAD_B)
      ctx2d.stroke()

      ctx2d.fillStyle = '#666'
      ctx2d.font = "10px 'JetBrains Mono', monospace"
      ctx2d.fillText('t →', W - PAD_R - 14, H / 2 - 4)
      ctx2d.save()
      ctx2d.translate(14, PAD_T + 10)
      ctx2d.rotate(-Math.PI / 2)
      ctx2d.fillText('E(t)', 0, 0)
      ctx2d.restore()

      // Envelope.
      ctx2d.strokeStyle = 'rgba(255, 80, 80, 0.55)'
      ctx2d.lineWidth = 1
      ctx2d.beginPath()
      for (let i = 0; i < 400; i++) {
        const t = (i / 399) * T_MAX
        const env = Math.exp((-gamma * t) / 2)
        const x = PAD_L + (i / 399) * (W - PAD_L - PAD_R)
        const y = H / 2 - env * (H / 2 - PAD_T - 6)
        if (i === 0) ctx2d.moveTo(x, y)
        else ctx2d.lineTo(x, y)
      }
      ctx2d.stroke()
      ctx2d.beginPath()
      for (let i = 0; i < 400; i++) {
        const t = (i / 399) * T_MAX
        const env = Math.exp((-gamma * t) / 2)
        const x = PAD_L + (i / 399) * (W - PAD_L - PAD_R)
        const y = H / 2 + env * (H / 2 - PAD_T - 6)
        if (i === 0) ctx2d.moveTo(x, y)
        else ctx2d.lineTo(x, y)
      }
      ctx2d.stroke()

      // Wave train.
      ctx2d.strokeStyle = '#0a0a0a'
      ctx2d.lineWidth = 1.2
      ctx2d.beginPath()
      for (let i = 0; i < 1000; i++) {
        const t = (i / 999) * T_MAX
        const env = Math.exp((-gamma * t) / 2)
        const y0 = env * Math.cos(OMEGA_DISPLAY * t)
        const x = PAD_L + (i / 999) * (W - PAD_L - PAD_R)
        const y = H / 2 - y0 * (H / 2 - PAD_T - 6)
        if (i === 0) ctx2d.moveTo(x, y)
        else ctx2d.lineTo(x, y)
      }
      ctx2d.stroke()
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
