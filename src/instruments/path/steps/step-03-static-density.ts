/**
 * Step 3 — A pure stationary state does NOT radiate.
 *
 * Born's rule: |ψ|² is the probability density. For a stationary state, this
 * is exactly time-independent — the cloud doesn't oscillate. Maxwell needs
 * an oscillating charge to radiate. Therefore: no radiation from a single
 * eigenstate.
 *
 * Visualized as a single-color iso-surface of |ψ|² (positive only, green
 * to emphasize neutrality — there's no oscillation, no red/blue tension).
 */

import { buildPsiGrid3D, GRID_RESOLUTION_3D } from '../../atom-view/modes/cloud-3d/grid'
import { recommendedBoxHalfExtent_Bohr } from '../../../physics/atomic'
import { createOrbitalIso, type OrbitalIso } from '../orbital-iso'
import type { Step, StepHandle, StageContext } from '../types'

const DISPLAY_RADIUS = 18

function buildStatic(n: number, ctx: StageContext): { iso: OrbitalIso; field: Float32Array } {
  const halfExtent = recommendedBoxHalfExtent_Bohr(n, 0, 1)
  const grid = buildPsiGrid3D({ n, l: 0, m: 0, Z: 1 }, halfExtent, GRID_RESOLUTION_3D)
  // Render |ψ|² (positive everywhere) → single neutral-green iso-shell.
  const squared = new Float32Array(grid.field.length)
  for (let i = 0; i < squared.length; i++) {
    squared[i] = grid.field[i] * grid.field[i]
  }
  const iso = createOrbitalIso({
    psiField: squared,
    N: grid.N,
    halfExtent,
    isoFraction: 0.18,
    showNegative: false,
    posColor: 0x6cdf7a,
  })
  iso.group.scale.setScalar(DISPLAY_RADIUS / halfExtent)
  ctx.trackObject(iso.group)
  return { iso, field: squared }
}

export const step03StaticDensity: Step = {
  id: 3,
  title: 'No radiation yet',
  claim: '|ψ_n|² is time-independent, so a pure stationary state cannot radiate.',
  caption:
    "Watch the orbital. Wait. It doesn't move. <code>|ψ_n(r)|²</code> is fully time-independent — the cross-term that would oscillate doesn't exist in a single eigenstate. Maxwell's equations say an oscillating charge density is what radiates light. No oscillation ⇒ no light. So how does emission happen? Click <strong>Next ▶</strong>.",
  math: '|Ψ(r, t)|² = |ψ_n(r)|²\n  (no t dependence)\n  ⇒ no oscillating dipole\n  ⇒ no radiation',
  enter(ctx): StepHandle {
    ctx.setKnobConfig({
      label: 'Principal quantum number n',
      min: 1,
      max: 5,
      step: 1,
      default: 3,
      format: (v) => `n = ${Math.round(v)}  ·  static`,
    })

    const prevPos = ctx.camera.position.clone()
    ctx.camera.position.set(0, 0, 65)
    ctx.camera.lookAt(0, 0, 0)

    let current: { iso: OrbitalIso; field: Float32Array } | null = buildStatic(
      Math.round(ctx.getKnob()),
      ctx,
    )

    return {
      onKnob(v: number): void {
        if (current) {
          current.iso.dispose()
          ctx.scene.remove(current.iso.group)
        }
        current = buildStatic(Math.round(v), ctx)
      },
      exit(): void {
        if (current) current.iso.dispose()
        ctx.camera.position.copy(prevPos)
        ctx.camera.lookAt(0, 0, 0)
      },
    }
  },
}
