/**
 * Electric-dipole (E1) selection rules for one-electron transitions.
 *
 * Hydrogenic transitions are E1-allowed iff:
 *   ΔL = ±1   (parity flip; the photon carries 1 unit of orbital angular momentum)
 *   ΔS = 0    (E1 doesn't flip spin in non-relativistic approximation)
 *   ΔJ = 0, ±1   (with J=0 → J=0 explicitly forbidden)
 *   Δm_J = 0, ±1
 *
 * For multi-electron atoms LS-coupling adds constraints on term symbols; for
 * heavier atoms (Z ≳ 40) jj-coupling relaxes the ΔS rule. This v1 returns
 * E1-allowed for hydrogenic ΔL=±1 transitions; everything else flagged as
 * "forbidden" by these rules. Returns a structured result so callers can
 * surface the *reason* a transition is forbidden, not just the verdict.
 */

import type { ParsedState } from './spectroscopy'

export type SelectionVerdict = {
  allowed: boolean
  /** 'E1' when allowed; 'forbidden' when not. M1/E2 reserved for v2. */
  type: 'E1' | 'forbidden'
  /** Human-readable explanation if forbidden; empty string if allowed. */
  reason: string
}

/**
 * Apply hydrogenic LS-coupling E1 rules to a (upper, lower) state pair.
 * Both states must have integer n, l. Other quantum numbers are best-effort.
 */
export function isE1Allowed(upper: ParsedState, lower: ParsedState): SelectionVerdict {
  const dn = upper.n - lower.n
  if (dn === 0) {
    return { allowed: false, type: 'forbidden', reason: 'Δn=0 (no energy change for E1)' }
  }

  const dl = upper.l - lower.l
  if (Math.abs(dl) !== 1) {
    return {
      allowed: false,
      type: 'forbidden',
      reason: `ΔL=${dl} violates E1 rule ΔL=±1 (parity)`,
    }
  }

  // m_J check: representative m=0 in our parser; allow Δm=0 by default.
  const dm = (upper.m ?? 0) - (lower.m ?? 0)
  if (Math.abs(dm) > 1) {
    return {
      allowed: false,
      type: 'forbidden',
      reason: `Δm_J=${dm} violates E1 rule Δm_J=0,±1`,
    }
  }

  return { allowed: true, type: 'E1', reason: '' }
}

/**
 * Convenience: return just the boolean verdict for an n,l pair.
 */
export function isAllowed(upperN: number, upperL: number, lowerN: number, lowerL: number): boolean {
  return isE1Allowed(
    { n: upperN, l: upperL, m: 0, letter: '' },
    { n: lowerN, l: lowerL, m: 0, letter: '' },
  ).allowed
}
