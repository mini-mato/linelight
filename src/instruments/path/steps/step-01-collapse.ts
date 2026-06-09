/**
 * Step 1 — Classical electromagnetic collapse.
 *
 * An accelerated charge radiates (Larmor formula). A classical electron
 * orbiting a proton at Bohr-radius distance loses energy fast — collapse
 * time ~1.6 × 10⁻¹¹ s. Slide the time knob and watch the orbit spiral in.
 *
 * The contradiction: atoms manifestly exist. Classical EM cannot be the
 * whole story.
 */

import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three'
import type { Step, StepHandle } from '../types'

const TAU_COLLAPSE = 1.0 // normalized; t ∈ [0, 1]
const R_INITIAL = 4.0 // initial radius in Bohr
const SPIRAL_POINTS = 800

function radiusAt(t: number): number {
  // Schematic spiral: r(t) = R₀ · (1 − t)^(1/3) keeps a smooth zero crossing.
  const clamped = Math.max(0, Math.min(1, t))
  return R_INITIAL * Math.pow(1 - clamped * 0.995, 1 / 3)
}

export const step01Collapse: Step = {
  id: 1,
  title: 'Classical collapse',
  claim: 'Classically the electron radiates and crashes in ~10⁻¹¹ s.',
  caption:
    'A classical accelerated electron radiates via the Larmor formula. Slide the time knob; watch the orbit spiral into the proton in ~16 picoseconds. But atoms exist — hydrogen lives forever. Classical electromagnetism is incomplete. Quantum mechanics is the patch.',
  math: 'P = (e² · ‖a‖²) / (6 π ε₀ c³)\nτ_collapse ≈ 1.6 × 10⁻¹¹ s\n(an atom should not exist)',
  enter(ctx): StepHandle {
    ctx.setKnobConfig({
      label: 'Time (normalized)',
      min: 0,
      max: 1,
      step: 0.005,
      default: 0,
      format: (v) => `t / τ = ${v.toFixed(3)}`,
    })

    const proton = new Mesh(
      new SphereGeometry(0.25, 32, 32),
      new MeshStandardMaterial({
        color: new Color(0xff5a4a),
        emissive: new Color(0x441a14),
        emissiveIntensity: 0.6,
        roughness: 0.3,
      }),
    )
    ctx.trackObject(proton)

    const electron = new Mesh(
      new SphereGeometry(0.12, 24, 24),
      new MeshStandardMaterial({
        color: new Color(0x4aa3ff),
        emissive: new Color(0x143044),
        emissiveIntensity: 0.6,
        roughness: 0.3,
      }),
    )
    ctx.trackObject(electron)

    // Render the entire spiral trajectory ahead of time; the electron is
    // simply placed along it based on the knob (t/τ).
    const positions = new Float32Array(SPIRAL_POINTS * 3)
    for (let i = 0; i < SPIRAL_POINTS; i++) {
      const t = i / (SPIRAL_POINTS - 1)
      const r = radiusAt(t * TAU_COLLAPSE)
      // Spiral angle accelerates as 1/r (Keplerian-ish).
      const theta = i * 0.06 * (R_INITIAL / Math.max(r, 0.2))
      positions[3 * i + 0] = r * Math.cos(theta)
      positions[3 * i + 1] = r * Math.sin(theta)
      positions[3 * i + 2] = 0
    }
    const geom = new BufferGeometry()
    geom.setAttribute('position', new Float32BufferAttribute(positions, 3))
    const mat = new LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.6 })
    const line = new Line(geom, mat)
    ctx.trackObject(line)

    function placeElectronAt(t: number): void {
      const i = Math.max(0, Math.min(SPIRAL_POINTS - 1, Math.round(t * (SPIRAL_POINTS - 1))))
      const offset = i * 3
      electron.position.set(positions[offset], positions[offset + 1], positions[offset + 2])
    }

    placeElectronAt(ctx.getKnob())

    return {
      onKnob(v: number): void {
        placeElectronAt(v)
      },
      exit(): void {
        proton.geometry.dispose()
        ;(proton.material as MeshStandardMaterial).dispose()
        electron.geometry.dispose()
        ;(electron.material as MeshStandardMaterial).dispose()
        geom.dispose()
        mat.dispose()
      },
    }
  },
}
