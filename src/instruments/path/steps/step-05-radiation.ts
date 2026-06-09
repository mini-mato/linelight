/**
 * Step 5 — The oscillating dipole radiates.
 *
 * Same time-evolved superposition as step 4, plus:
 *   • a dipole-vector arrow along z, oscillating at ω₂₁
 *   • a wavetrain of yellow segments rippling out along +x
 *
 * The photon-flight tool (when enabled) also fires from this step.
 */

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three'
import { buildPsiGrid3D, GRID_RESOLUTION_3D } from '../../atom-view/modes/cloud-3d/grid'
import { createOrbitalIso } from '../orbital-iso'
import {
  dipoleMatrixElement_au,
  transitionAngularFrequency_rad_per_s,
} from '../../../physics/atomic/superposition'
import { setAudioFrequency } from '../tools/audio-tone'
import { createPhaseWheel } from '../tools/phase-wheel'
import { createPhotonFlight } from '../tools/photon-flight'
import type { Step, StepHandle } from '../types'

const LOWER = { n: 1, l: 0, m: 0, Z: 1, E_eV: -13.6 }
const UPPER = { n: 3, l: 1, m: 0, Z: 1, E_eV: -1.5111 }
const HALF_EXTENT = 12
const DISPLAY_HZ_SCALE = 5e14
const WAVE_SEGMENTS = 32

export const step05Radiation: Step = {
  id: 5,
  title: 'Radiation',
  claim: 'The oscillating dipole radiates at ω = ΔE/ℏ. The photon frequency IS the beat frequency.',
  caption:
    "The yellow arrow is the instantaneous dipole expectation <code>⟨ψ_lo | e·r | ψ_hi⟩ · cos(ω t)</code>. It oscillates at the optical angular frequency. Maxwell's equations turn that oscillation into an outgoing electromagnetic wave with the SAME frequency. Each emitted photon carries <code>ħω = E_upper − E_lower</code>. Drag <strong>Mix angle</strong> to see radiation maximum at α = π/4 and vanish at the pure-state endpoints.",
  math: '⟨d(t)⟩ = e · D · cos(ω₂₁ t)\nP_Larmor = e² · ω⁴ · |D|² / (6 π ε₀ c³) · sin²(ω₂₁ t)\nE_photon = ℏ ω₂₁ = E_u − E_l',
  enter(ctx): StepHandle {
    ctx.setKnobConfig({
      label: 'Mix angle α',
      min: 0,
      max: Math.PI / 2,
      step: 0.01,
      default: Math.PI / 4,
      format: (v) =>
        `α = ${(v / Math.PI).toFixed(3)} π · 2 sinα cosα = ${(2 * Math.sin(v) * Math.cos(v)).toFixed(3)}`,
    })

    const prevPos = ctx.camera.position.clone()
    ctx.camera.position.set(0, 5, 55)
    ctx.camera.lookAt(0, 0, 0)

    // Pre-build static psi grids.
    const gLo = buildPsiGrid3D(LOWER, HALF_EXTENT, GRID_RESOLUTION_3D)
    const gHi = buildPsiGrid3D(UPPER, HALF_EXTENT, GRID_RESOLUTION_3D)
    const N = gLo.N
    const psiLo = gLo.field
    const psiHi = gHi.field
    const combined = new Float32Array(N * N * N)

    function combine(alpha: number, cosWT: number): void {
      const mix = 2 * Math.sin(alpha) * Math.cos(alpha) * cosWT
      for (let i = 0; i < combined.length; i++) combined[i] = mix * psiLo[i] * psiHi[i]
    }
    combine(ctx.getKnob(), 1)

    const iso = createOrbitalIso({
      psiField: combined,
      N,
      halfExtent: HALF_EXTENT,
      isoFraction: 0.05,
    })
    ctx.trackObject(iso.group)

    // Dipole arrow along z.
    const D = dipoleMatrixElement_au(
      { n: UPPER.n, l: UPPER.l, m: UPPER.m },
      { n: LOWER.n, l: LOWER.l, m: LOWER.m },
    )
    const DMag = D ? D.magnitude : 0

    const arrowGroup = new Group()
    const arrowShaft = new Mesh(
      new CylinderGeometry(0.08, 0.08, 1, 12),
      new MeshBasicMaterial({ color: 0xffe066 }),
    )
    arrowShaft.position.y = 0.5
    const arrowHead = new Mesh(
      new ConeGeometry(0.18, 0.4, 14),
      new MeshBasicMaterial({ color: 0xffe066 }),
    )
    arrowHead.position.y = 1.2
    arrowGroup.add(arrowShaft)
    arrowGroup.add(arrowHead)
    ctx.trackObject(arrowGroup)

    // Outgoing wavetrain along +x.
    const wavePoints: Mesh[] = []
    for (let i = 0; i < WAVE_SEGMENTS; i++) {
      const dot = new Mesh(
        new BoxGeometry(0.3, 0.04, 0.04),
        new MeshBasicMaterial({ color: new Color(0xffd24a), transparent: true }),
      )
      wavePoints.push(dot)
      ctx.trackObject(dot)
    }

    const omegaReal = transitionAngularFrequency_rad_per_s(UPPER.E_eV, LOWER.E_eV)
    const omegaDisplay = omegaReal / DISPLAY_HZ_SCALE
    setAudioFrequency(omegaDisplay / (2 * Math.PI))

    // Phase wheel.
    const phaseWheel = createPhaseWheel()
    ctx.toolsDock.appendChild(phaseWheel.el)

    // Photon flight wired to the spectrum strip. Emit on each peak of the
    // dipole oscillation (when cos(ωt) crosses +1) for a non-trivial mix.
    const photonFlight = createPhotonFlight(ctx.spectrumStrip)
    // The 1s → 3p transition emits at ~ 102.6 nm (Ly-β); outside the visible
    // band the photon-flight tool would no-op, so we re-target Hα for the
    // demo: in the future this constant follows the LOWER/UPPER pair via
    // the data layer.
    const PHOTON_WAVELENGTH_NM = 656.3
    let lastCos = -2
    let emitArmed = false

    return {
      tick({ t_s, knob }): void {
        const cosWT = Math.cos(omegaDisplay * t_s)
        const alpha = knob
        const mixCross = 2 * Math.sin(alpha) * Math.cos(alpha)

        // Orbital iso update.
        combine(alpha, cosWT)
        iso.update(combined, { isoFraction: 0.05 })

        // Phase-wheel hand.
        phaseWheel.setAngle(omegaDisplay * t_s)

        // Photon-flight: emit one photon per ω-period when the dipole is
        // active. Trigger when cos(ωt) passes 0 going positive AND the
        // mix is non-trivial.
        if (mixCross > 0.15) {
          if (lastCos < 0 && cosWT >= 0) emitArmed = true
          if (emitArmed && cosWT > 0.99) {
            photonFlight.emit(PHOTON_WAVELENGTH_NM)
            emitArmed = false
          }
        }
        lastCos = cosWT

        // Dipole arrow.
        const dipoleAmplitude = DMag * mixCross
        const armLen = Math.max(0.4, dipoleAmplitude * 6) * cosWT
        arrowGroup.position.set(0, 0, 0)
        arrowGroup.scale.set(1, Math.abs(armLen) + 1e-3, 1)
        arrowGroup.rotation.x = armLen < 0 ? Math.PI : 0
        arrowGroup.lookAt(new Vector3(0, armLen, 0).add(arrowGroup.position))
        arrowGroup.visible = dipoleAmplitude > 1e-3

        // Wavetrain.
        const k = 0.5
        for (let i = 0; i < WAVE_SEGMENTS; i++) {
          const xPos = HALF_EXTENT + 0.5 + i * 0.6
          const phase = k * xPos - omegaDisplay * t_s
          const amp = Math.sin(phase) * 0.9 * mixCross
          const dot = wavePoints[i]
          dot.position.set(xPos, amp, 0)
          ;(dot.material as MeshBasicMaterial).opacity = mixCross
        }
      },
      exit(): void {
        setAudioFrequency(0)
        photonFlight.dispose()
        iso.dispose()
        ;(arrowShaft.material as MeshBasicMaterial).dispose()
        arrowShaft.geometry.dispose()
        ;(arrowHead.material as MeshBasicMaterial).dispose()
        arrowHead.geometry.dispose()
        for (const dot of wavePoints) {
          ;(dot.material as MeshBasicMaterial).dispose()
          dot.geometry.dispose()
        }
        ctx.camera.position.copy(prevPos)
        ctx.camera.lookAt(0, 0, 0)
      },
    }
  },
}
