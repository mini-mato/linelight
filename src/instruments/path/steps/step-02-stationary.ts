/**
 * Step 2 — Stationary states from the Schrödinger equation.
 *
 * Solve the time-independent Schrödinger equation in the Coulomb potential
 * and discrete eigenvalues `E_n = −13.6 / n²` eV fall out, along with
 * stationary-state wavefunctions ψ_nlm. Slide n; watch the orbital shape
 * morph and the energy level march down the ladder.
 *
 * Rendered as a pair of iso-surface meshes (red for ψ > +iso, blue for
 * ψ < −iso) via MarchingCubes — standard Lambert material, no custom
 * shaders, reliable across the shared Path renderer.
 */

import { buildPsiGrid3D, GRID_RESOLUTION_3D } from '../../atom-view/modes/cloud-3d/grid'
import { recommendedBoxHalfExtent_Bohr } from '../../../physics/atomic'
import { createOrbitalIso, type OrbitalIso } from '../orbital-iso'
import type { Step, StepHandle, StageContext } from '../types'

// Target on-screen radius regardless of orbital size — pick once, all
// stationary states render to a uniform footprint by scaling the iso group.
const DISPLAY_RADIUS = 18

function buildOrbital(n: number, ctx: StageContext): { iso: OrbitalIso; halfExtent: number } {
  const halfExtent = recommendedBoxHalfExtent_Bohr(n, 0, 1)
  const grid = buildPsiGrid3D({ n, l: 0, m: 0, Z: 1 }, halfExtent, GRID_RESOLUTION_3D)
  const iso = createOrbitalIso({
    psiField: grid.field,
    N: grid.N,
    halfExtent,
    isoFraction: 0.18,
  })
  // Normalize visual size so n=1 and n=5 occupy the same screen footprint.
  const scale = DISPLAY_RADIUS / halfExtent
  iso.group.scale.setScalar(scale)
  ctx.trackObject(iso.group)
  return { iso, halfExtent }
}

export const step02Stationary: Step = {
  id: 2,
  title: 'Stationary states',
  claim: 'Schrödinger gives discrete eigenstates ψ_nlm with E_n = −13.6/n² eV.',
  caption:
    'Solve <code>−ℏ²/2m · ∇²ψ − k_e e²/r · ψ = E ψ</code> in the Coulomb potential. The only normalizable solutions sit at discrete energies <code>E_n = −13.6 / n²</code> eV. Slide <em>n</em>; the red lobes are positive ψ, blue lobes negative ψ. The energy ladder you saw on the Grotrian diagram comes from this equation.',
  math: 'E_n = − 13.6 eV / n²\nE₁ = −13.6 eV\nE₂ = −3.4 eV\nE₃ = −1.51 eV\nE₄ = −0.85 eV',
  enter(ctx): StepHandle {
    ctx.setKnobConfig({
      label: 'Principal quantum number n',
      min: 1,
      max: 5,
      step: 1,
      default: 3,
      format: (v) =>
        `n = ${Math.round(v)}  ·  E = ${(-13.6 / (Math.round(v) * Math.round(v))).toFixed(2)} eV`,
    })

    // Orbitals are now normalized to DISPLAY_RADIUS via group.scale, so a
    // single camera distance frames every n.
    const prevPos = ctx.camera.position.clone()
    ctx.camera.position.set(0, 0, 65)
    ctx.camera.lookAt(0, 0, 0)

    let current: { iso: OrbitalIso; halfExtent: number } | null = buildOrbital(
      Math.round(ctx.getKnob()),
      ctx,
    )

    return {
      onKnob(v: number): void {
        if (current) {
          current.iso.dispose()
          ctx.scene.remove(current.iso.group)
        }
        current = buildOrbital(Math.round(v), ctx)
      },
      exit(): void {
        if (current) current.iso.dispose()
        ctx.camera.position.copy(prevPos)
        ctx.camera.lookAt(0, 0, 0)
      },
    }
  },
}
