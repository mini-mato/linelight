/**
 * Step 6 — Selection rules from parity.
 *
 * The electric-dipole matrix element `⟨ψ_lo | r | ψ_hi⟩` is an integral over
 * all space of the product `ψ_lo · r · ψ_hi`. Each ψ has a definite parity
 * under r → −r (parity = (−1)^l). The position operator r has odd parity.
 * Therefore the integrand has parity `(−1)^(l_lo + l_hi + 1)` — odd when
 * l_lo + l_hi is even (e.g. 1s → 2s, both l = 0). An odd integrand over a
 * symmetric domain integrates to ZERO. Hence Δl = ±1.
 *
 * The user picks a transition pair from a discrete knob and sees the
 * computed dipole magnitude. Forbidden pairs return 0; allowed pairs return
 * a non-trivial value. No memorization needed.
 */

import type { Step, StepHandle } from '../types'
import { dipoleMatrixElement_au } from '../../../physics/atomic/einstein'

type Pair = {
  label: string
  upper: { n: number; l: number; m: number }
  lower: { n: number; l: number; m: number }
  status: 'forbidden' | 'allowed'
  reason: string
}

const PAIRS: readonly Pair[] = [
  {
    label: '1s → 2s',
    upper: { n: 2, l: 0, m: 0 },
    lower: { n: 1, l: 0, m: 0 },
    status: 'forbidden',
    reason: 'l_lo + l_hi = 0 (even) ⇒ integrand odd ⇒ ⟨r⟩ = 0',
  },
  {
    label: '1s → 2p',
    upper: { n: 2, l: 1, m: 0 },
    lower: { n: 1, l: 0, m: 0 },
    status: 'allowed',
    reason: 'l_lo + l_hi = 1 (odd) ⇒ Δl = ±1 satisfied',
  },
  {
    label: '2s → 3s',
    upper: { n: 3, l: 0, m: 0 },
    lower: { n: 2, l: 0, m: 0 },
    status: 'forbidden',
    reason: 'Both s-orbitals ⇒ same parity ⇒ ⟨r⟩ = 0',
  },
  {
    label: '2s → 3p',
    upper: { n: 3, l: 1, m: 0 },
    lower: { n: 2, l: 0, m: 0 },
    status: 'allowed',
    reason: 'Δl = +1 — this is the Hα channel',
  },
  {
    label: '2p → 3d',
    upper: { n: 3, l: 2, m: 0 },
    lower: { n: 2, l: 1, m: 0 },
    status: 'allowed',
    reason: 'Δl = +1',
  },
  {
    label: '2p → 3p',
    upper: { n: 3, l: 1, m: 0 },
    lower: { n: 2, l: 1, m: 0 },
    status: 'forbidden',
    reason: 'Δl = 0 ⇒ same parity ⇒ ⟨r⟩ = 0',
  },
]

export const step06SelectionRules: Step = {
  id: 6,
  title: 'Selection rules',
  claim: 'Only transitions with Δl = ±1 have a non-zero dipole. Parity forces the rest to zero.',
  caption:
    'Pick a transition pair with the slider (snaps to discrete pairs). The text on the right shows the computed dipole magnitude <code>|⟨ψ_lo | r | ψ_hi⟩|</code> on a 48³ numerical grid. Forbidden pairs (Δl = 0 or ±2) return values pinned at zero by parity — the integrand is odd under <code>r → −r</code>, so it cancels exactly over the symmetric domain. Allowed pairs (Δl = ±1) return Bohr-radius-scale values that determine the Einstein A coefficient.',
  math: '',
  enter(ctx): StepHandle {
    ctx.setKnobConfig({
      label: 'Transition pair',
      min: 0,
      max: PAIRS.length - 1,
      step: 1,
      default: 1,
      format: (v) => PAIRS[Math.round(v)].label,
    })

    function recompute(rawV: number): void {
      const idx = Math.max(0, Math.min(PAIRS.length - 1, Math.round(rawV)))
      const pair = PAIRS[idx]
      const D = dipoleMatrixElement_au(pair.upper, pair.lower)
      const mag = D ? D.magnitude : 0
      const isForbidden = pair.status === 'forbidden'
      const color = isForbidden ? '#ff6a6a' : '#86e58a'
      const verdict = isForbidden ? 'FORBIDDEN' : 'ALLOWED'
      ctx.setMath(
        [
          `⟨ψ_lo | r | ψ_hi⟩ — 48³ grid`,
          ``,
          `${pair.label}`,
          `|D| = ${mag.toExponential(3)} a₀`,
          ``,
          `<span style="color: ${color};">${verdict}</span>`,
          `<span style="color: rgba(255,255,255,0.7);">${pair.reason}</span>`,
        ].join('\n'),
      )
    }

    recompute(ctx.getKnob())

    return {
      onKnob(v: number): void {
        recompute(v)
      },
      exit(): void {
        // nothing 3D to dispose
      },
    }
  },
}
