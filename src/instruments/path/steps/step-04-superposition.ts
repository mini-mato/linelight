/**
 * Step 4 — Superposition (the breathing orbital).
 *
 *     Ψ(r, t) = cos(α) · ψ_lower(r) + sin(α) · ψ_upper(r) · exp(−i ω₂₁ t)
 *
 * The cross-term ψ_lower · ψ_upper · cos(ω₂₁ t) makes |Ψ|² oscillate at the
 * optical frequency. Slide α: at 0 or π/2 you have a pure state (static);
 * in between, the density breathes.
 *
 * Rendered as paired iso-surfaces of |Ψ(r, t)|², rebuilt every frame.
 * MarchingCubes at resolution 48 — ~5ms per rebuild on Apple Silicon.
 */

import { buildPsiGrid3D, GRID_RESOLUTION_3D } from '../../atom-view/modes/cloud-3d/grid'
import { createOrbitalIso } from '../orbital-iso'
import { transitionAngularFrequency_rad_per_s } from '../../../physics/atomic/superposition'
import { setAudioFrequency } from '../tools/audio-tone'
import { createPhaseWheel } from '../tools/phase-wheel'
import type { Step, StepHandle } from '../types'

const LOWER = { n: 1, l: 0, m: 0, Z: 1, E_eV: -13.6 }
const UPPER = { n: 3, l: 1, m: 0, Z: 1, E_eV: -1.5111 }
const HALF_EXTENT = 18
const DISPLAY_HZ_SCALE = 5e14

export const step04Superposition: Step = {
  id: 4,
  title: 'Superposition',
  claim: 'A mix of two stationary states has a density that oscillates at ω = ΔE/ℏ.',
  caption:
    'Slide the mix angle <em>α</em>. At α = 0 you have pure 1s (static). At α = π/2 you have pure 3p (also static). At α = π/4 the cloud BREATHES at the optical angular frequency ω₂₁ = (E_upper − E_lower)/ℏ. That breathing is the entire mechanism behind atomic emission. Red lobes are +Ψ, blue lobes −Ψ.',
  math: 'Ψ(r,t) = cos α · ψ_1s + sin α · ψ_3p · e^(−iω₂₁ t)\n|Ψ|² = cos²α · ψ_1s² + sin²α · ψ_3p²\n      + 2 sin α cos α · ψ_1s · ψ_3p · cos(ω₂₁ t)\nω₂₁ = (E_u − E_l) · e / ℏ',
  enter(ctx): StepHandle {
    ctx.setKnobConfig({
      label: 'Mix angle α',
      min: 0,
      max: Math.PI / 2,
      step: 0.01,
      default: Math.PI / 4,
      format: (v) => `α = ${(v / Math.PI).toFixed(3)} π · sin α = ${Math.sin(v).toFixed(3)}`,
    })

    const prevPos = ctx.camera.position.clone()
    ctx.camera.position.set(0, 0, 65)
    ctx.camera.lookAt(0, 0, 0)

    // Pre-build the two static fields once.
    const gLo = buildPsiGrid3D(LOWER, HALF_EXTENT, GRID_RESOLUTION_3D)
    const gHi = buildPsiGrid3D(UPPER, HALF_EXTENT, GRID_RESOLUTION_3D)
    const N = gLo.N
    const psiLo = gLo.field
    const psiHi = gHi.field
    const combined = new Float32Array(N * N * N)

    // Build the initial combined field at t=0 with the current α.
    const omegaReal = transitionAngularFrequency_rad_per_s(UPPER.E_eV, LOWER.E_eV)
    const omegaDisplay = omegaReal / DISPLAY_HZ_SCALE

    function combine(alpha: number, cosWT: number): void {
      // We render the signed CROSS-TERM cleanly so red/blue lobes are
      // visible: psi_lo · psi_hi · cos(ωt) · 2 sin α cos α (the time-varying
      // part), plus a baseline static-mix shell.
      const mix = 2 * Math.sin(alpha) * Math.cos(alpha) * cosWT
      for (let i = 0; i < combined.length; i++) {
        combined[i] = mix * psiLo[i] * psiHi[i]
      }
    }

    combine(ctx.getKnob(), 1)

    const iso = createOrbitalIso({
      psiField: combined,
      N,
      halfExtent: HALF_EXTENT,
      isoFraction: 0.05,
    })
    ctx.trackObject(iso.group)

    // Drive the audio tone at the display frequency in Hz (ω / 2π).
    setAudioFrequency(omegaDisplay / (2 * Math.PI))

    // Phase wheel in the top-right tools dock.
    const phaseWheel = createPhaseWheel()
    ctx.toolsDock.appendChild(phaseWheel.el)

    return {
      tick({ t_s, knob }): void {
        const cosWT = Math.cos(omegaDisplay * t_s)
        combine(knob, cosWT)
        iso.update(combined, { isoFraction: 0.05 })
        phaseWheel.setAngle(omegaDisplay * t_s)
      },
      exit(): void {
        setAudioFrequency(0)
        iso.dispose()
        ctx.camera.position.copy(prevPos)
        ctx.camera.lookAt(0, 0, 0)
      },
    }
  },
}
