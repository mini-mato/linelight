/**
 * Step 0 — Coulomb attraction.
 *
 * Set up the puzzle: a proton (red) attracts an electron (blue) by the
 * inverse-square law `F = k_e · e² / r²`. The user slides the electron's
 * radius and watches the attractive force vector lengthen as `1/r²`.
 *
 * No quantum mechanics yet. This is the classical baseline so steps 1+
 * have something to overthrow.
 */

import { ArrowHelper, Color, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three'
import type { Step, StepHandle } from '../types'

const A0_M = 5.29177210544e-11 // Bohr radius (m), CODATA 2022
const E_C = 1.602176634e-19 // elementary charge (C)
const K_E = 8.9875517873681764e9 // Coulomb constant (N·m²/C²)

function coulombForce_N(r_m: number): number {
  return (K_E * E_C * E_C) / (r_m * r_m)
}

export const step00Coulomb: Step = {
  id: 0,
  title: 'Coulomb',
  claim: 'A proton attracts an electron by F = k_e · e² / r².',
  caption:
    'The proton sits at the origin (red). The electron is the small blue sphere at distance <em>r</em> Bohr radii. Slide it in and out. The yellow arrow is the attractive force, scaled as <code>1/r²</code>. This is the classical picture — and it leads to a problem. Click <strong>Next ▶</strong> to see it.',
  math: 'F = k_e · e² / r²\nk_e = 8.988 × 10⁹ N·m²/C²\ne = 1.602 × 10⁻¹⁹ C',
  enter(ctx): StepHandle {
    ctx.setKnobConfig({
      label: 'Electron radius r',
      min: 0.5,
      max: 8,
      step: 0.05,
      default: 2,
      format: (v) => `${v.toFixed(2)} a₀`,
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
    electron.position.set(2, 0, 0)
    ctx.trackObject(electron)

    const forceArrow = new ArrowHelper(
      new Vector3(-1, 0, 0),
      electron.position,
      1,
      0xffe066,
      0.25,
      0.15,
    )
    ctx.trackObject(forceArrow)

    function updateAt(r: number): void {
      electron.position.set(r, 0, 0)
      // Visual length: clamp(F / F(r=1) , 0.15, 6). F(r=1 Bohr) is the reference.
      const F = coulombForce_N(r * A0_M)
      const Fref = coulombForce_N(1 * A0_M)
      const lengthBohr = Math.max(0.15, Math.min(6, F / Fref))
      forceArrow.position.copy(electron.position)
      forceArrow.setDirection(new Vector3(-1, 0, 0))
      forceArrow.setLength(lengthBohr * 0.4, 0.22, 0.13)
    }

    updateAt(ctx.getKnob())

    return {
      onKnob(v: number): void {
        updateAt(v)
      },
      exit(): void {
        proton.geometry.dispose()
        ;(proton.material as MeshStandardMaterial).dispose()
        electron.geometry.dispose()
        ;(electron.material as MeshStandardMaterial).dispose()
        forceArrow.dispose()
      },
    }
  },
}
