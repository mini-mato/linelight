/**
 * Step 9 — A line is a pole.
 *
 * The retarded propagator of the atom + EM-field system has the form
 *
 *     G(ω) = 1 / [ω − ω₀ + iΓ/2]
 *
 * Its squared modulus on the real axis IS the Lorentzian from step 8. The
 * Lorentzian peak is the projection of a pole sitting at `(ω₀, −Γ/2)` in
 * the complex frequency plane. Same physics, deeper geometry.
 *
 * Visualize the complex plane on the 2D canvas. The pole shows as a marker;
 * the Lorentzian projection appears along the real axis. Slide Γ to move
 * the pole vertically and watch the peak's width change synchronously.
 */

import type { Step, StepHandle } from '../types'

const W = 640
const H = 220
const PAD = 28

const OMEGA0_DISPLAY = 18

function lorentzian(omega: number, omega0: number, gamma: number): number {
  const half = gamma / 2
  return (half * half) / ((omega - omega0) * (omega - omega0) + half * half)
}

export const step09Pole: Step = {
  id: 9,
  title: 'Pole',
  claim: 'A spectral line is the projection of a pole in the complex frequency plane.',
  caption:
    'The complex ω-plane: horizontal axis is <code>Re ω</code> (line position), vertical axis is <code>Im ω</code> (line width). A radiatively-decaying atomic state lives at <code>ω = ω₀ − iΓ/2</code> — a pole below the real axis. The Lorentzian we just plotted is exactly the squared modulus of the propagator evaluated along the real axis. Slide Γ: the pole drops deeper into the complex plane, and the real-axis peak gets wider. The two are one object.',
  math: 'G(ω) = 1 / (ω − ω₀ + iΓ/2)\npole at ω = ω₀ − iΓ/2\n|G(ω)|² along Re axis = Lorentzian',
  enter(ctx): StepHandle {
    ctx.setAux2DVisible(true)
    ctx.setKnobConfig({
      label: 'Decay rate Γ',
      min: 0.2,
      max: 8.0,
      step: 0.05,
      default: 1.0,
      format: (v) => `Γ = ${v.toFixed(2)} · Im ω = −${(v / 2).toFixed(2)}`,
    })

    function draw(gamma: number): void {
      const c = ctx.aux2D.getContext('2d')
      if (!c) return
      c.fillStyle = '#fafafa'
      c.fillRect(0, 0, W, H)

      // Coordinate system: x = Re ω, y = Im ω.
      // Real axis is somewhere in the upper portion of the canvas; the
      // pole sits below it. Reserve top ~30% for the Lorentzian projection.

      const omegaMin = OMEGA0_DISPLAY - 6
      const omegaMax = OMEGA0_DISPLAY + 6
      const imRange = 5

      const realY = 80 // y-coord of the Re-ω axis in canvas pixels

      function xOf(omega: number): number {
        return PAD + ((omega - omegaMin) / (omegaMax - omegaMin)) * (W - 2 * PAD)
      }
      function yOf(imOmega: number): number {
        return realY + (-imOmega / imRange) * (H - realY - PAD)
      }

      // Axes.
      c.strokeStyle = '#999'
      c.lineWidth = 0.5
      c.beginPath()
      c.moveTo(PAD, realY)
      c.lineTo(W - PAD, realY)
      c.stroke()

      c.strokeStyle = '#ccc'
      c.lineWidth = 0.5
      for (let im = -1; im <= -imRange + 1; im--) {
        const y = yOf(im)
        c.beginPath()
        c.moveTo(PAD, y)
        c.lineTo(W - PAD, y)
        c.stroke()
      }

      c.fillStyle = '#666'
      c.font = "10px 'JetBrains Mono', monospace"
      c.fillText('Re ω →', W - PAD - 50, realY - 6)
      c.fillText('Im ω ↓ (line width)', PAD + 6, H - 8)

      // Lorentzian projection on the real axis (above realY).
      c.strokeStyle = '#0a0a0a'
      c.lineWidth = 1.4
      c.beginPath()
      const peak = lorentzian(OMEGA0_DISPLAY, OMEGA0_DISPLAY, gamma)
      for (let i = 0; i <= 200; i++) {
        const omega = omegaMin + (i / 200) * (omegaMax - omegaMin)
        const v = lorentzian(omega, OMEGA0_DISPLAY, gamma) / peak
        const x = xOf(omega)
        const y = realY - v * (realY - PAD - 6)
        if (i === 0) c.moveTo(x, y)
        else c.lineTo(x, y)
      }
      c.stroke()

      // Dashed line down to the pole.
      const poleX = xOf(OMEGA0_DISPLAY)
      const poleY = yOf(-gamma / 2)
      c.strokeStyle = 'rgba(255, 80, 80, 0.6)'
      c.setLineDash([3, 3])
      c.lineWidth = 0.8
      c.beginPath()
      c.moveTo(poleX, realY)
      c.lineTo(poleX, poleY)
      c.stroke()
      c.setLineDash([])

      // Pole marker.
      c.fillStyle = '#ff5050'
      c.beginPath()
      c.arc(poleX, poleY, 6, 0, 2 * Math.PI)
      c.fill()
      c.strokeStyle = '#0a0a0a'
      c.lineWidth = 1
      c.stroke()

      c.fillStyle = '#0a0a0a'
      c.fillText(`pole at (ω₀, −Γ/2)`, poleX + 10, poleY + 4)
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
