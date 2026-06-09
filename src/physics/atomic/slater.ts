/**
 * Slater's rules (1930) for screened effective nuclear charge Z_eff.
 *
 * Groups (in order of increasing energy):
 *   (1s) | (2s,2p) | (3s,3p) | (3d) | (4s,4p) | (4d) | (4f) | (5s,5p) | (5d) | (5f) | (6s,6p)
 *
 * For a target electron in group g:
 *   • Electrons OUTSIDE g (higher-energy groups) contribute 0.
 *   • Electrons in the SAME group g, excluding the target itself, contribute
 *     0.35 each — except when g = (1s), where the contribution is 0.30.
 *   • If target is in an s/p group of principal n:
 *       - Electrons in shell (n−1) [any sub-group] contribute 0.85 each.
 *       - Electrons in shells ≤ (n−2) contribute 1.00 each.
 *   • If target is in a d or f group (single-l groups):
 *       - All electrons in groups inside g (lower-energy) contribute 1.00.
 *
 * σ = sum of those contributions; Z_eff = Z − σ.
 *
 * Reference values pinned in tests:
 *   effectiveZ('H',  1, 0) = 1.00          (no other electrons)
 *   effectiveZ('He', 1, 0) = 1.70          (= 2 − 0.30)
 *   effectiveZ('Na', 3, 0) = 2.20          (= 11 − [0 + 8·0.85 + 2·1.00])
 *   effectiveZ('Mg', 3, 0) = 2.85          (= 12 − [0.35 + 8·0.85 + 2·1.00])
 */

/** A single (sub-)shell occupancy. `l` letter is one of 's' | 'p' | 'd' | 'f'. */
type SubShell = { n: number; l: 's' | 'p' | 'd' | 'f'; count: number }

/** Ground-state electron configurations for elements supported in v1. */
const CONFIGURATIONS: Record<string, SubShell[]> = {
  H: [{ n: 1, l: 's', count: 1 }],
  He: [{ n: 1, l: 's', count: 2 }],
  Li: [
    { n: 1, l: 's', count: 2 },
    { n: 2, l: 's', count: 1 },
  ],
  C: [
    { n: 1, l: 's', count: 2 },
    { n: 2, l: 's', count: 2 },
    { n: 2, l: 'p', count: 2 },
  ],
  N: [
    { n: 1, l: 's', count: 2 },
    { n: 2, l: 's', count: 2 },
    { n: 2, l: 'p', count: 3 },
  ],
  O: [
    { n: 1, l: 's', count: 2 },
    { n: 2, l: 's', count: 2 },
    { n: 2, l: 'p', count: 4 },
  ],
  Ne: [
    { n: 1, l: 's', count: 2 },
    { n: 2, l: 's', count: 2 },
    { n: 2, l: 'p', count: 6 },
  ],
  Na: [
    { n: 1, l: 's', count: 2 },
    { n: 2, l: 's', count: 2 },
    { n: 2, l: 'p', count: 6 },
    { n: 3, l: 's', count: 1 },
  ],
  Mg: [
    { n: 1, l: 's', count: 2 },
    { n: 2, l: 's', count: 2 },
    { n: 2, l: 'p', count: 6 },
    { n: 3, l: 's', count: 2 },
  ],
  // Ca = [Ar] 4s² = 1s² 2s² 2p⁶ 3s² 3p⁶ 4s²
  Ca: [
    { n: 1, l: 's', count: 2 },
    { n: 2, l: 's', count: 2 },
    { n: 2, l: 'p', count: 6 },
    { n: 3, l: 's', count: 2 },
    { n: 3, l: 'p', count: 6 },
    { n: 4, l: 's', count: 2 },
  ],
  // Fe = [Ar] 3d⁶ 4s²
  Fe: [
    { n: 1, l: 's', count: 2 },
    { n: 2, l: 's', count: 2 },
    { n: 2, l: 'p', count: 6 },
    { n: 3, l: 's', count: 2 },
    { n: 3, l: 'p', count: 6 },
    { n: 3, l: 'd', count: 6 },
    { n: 4, l: 's', count: 2 },
  ],
  // Cu = [Ar] 3d¹⁰ 4s¹ (anomalous, but the standard ground-state assignment).
  Cu: [
    { n: 1, l: 's', count: 2 },
    { n: 2, l: 's', count: 2 },
    { n: 2, l: 'p', count: 6 },
    { n: 3, l: 's', count: 2 },
    { n: 3, l: 'p', count: 6 },
    { n: 3, l: 'd', count: 10 },
    { n: 4, l: 's', count: 1 },
  ],
  // Hg = [Xe] 4f¹⁴ 5d¹⁰ 6s²
  //    = 1s² 2s² 2p⁶ 3s² 3p⁶ 3d¹⁰ 4s² 4p⁶ 4d¹⁰ 4f¹⁴ 5s² 5p⁶ 5d¹⁰ 6s²
  Hg: [
    { n: 1, l: 's', count: 2 },
    { n: 2, l: 's', count: 2 },
    { n: 2, l: 'p', count: 6 },
    { n: 3, l: 's', count: 2 },
    { n: 3, l: 'p', count: 6 },
    { n: 3, l: 'd', count: 10 },
    { n: 4, l: 's', count: 2 },
    { n: 4, l: 'p', count: 6 },
    { n: 4, l: 'd', count: 10 },
    { n: 4, l: 'f', count: 14 },
    { n: 5, l: 's', count: 2 },
    { n: 5, l: 'p', count: 6 },
    { n: 5, l: 'd', count: 10 },
    { n: 6, l: 's', count: 2 },
  ],
}

/** Total electron count for a configuration (= bare Z for a neutral atom). */
function bareZ(config: SubShell[]): number {
  return config.reduce((s, x) => s + x.count, 0)
}

/**
 * Slater group key for a sub-shell. s and p of the same n share a group;
 * d and f stand alone.
 */
function groupKey(n: number, l: 's' | 'p' | 'd' | 'f'): string {
  if (l === 's' || l === 'p') return `${n}sp`
  return `${n}${l}`
}

/** True iff target letter denotes the s/p block (vs single-l d or f). */
function isSPGroup(targetL: 's' | 'p' | 'd' | 'f'): boolean {
  return targetL === 's' || targetL === 'p'
}

/**
 * Effective nuclear charge for the active electron in (n, l) of `element`.
 *
 * For hydrogen the rule trivially gives 1.0. For any element where the named
 * (n, l) sub-shell does not appear in the ground-state configuration we
 * conservatively return the BARE Z (since "no electrons in that sub-shell"
 * gives σ from same-group = 0, but we still need a sensible σ from inner
 * shells; we treat the requested electron as the next added one).
 *
 * Special-case: when a single electron sits alone in its sub-shell (e.g.
 * Li 2s¹, Na 3s¹), the same-group contribution is correctly zero.
 */
export function effectiveZ(element: string, n: number, l: number): number {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`effectiveZ: n=${n} must be a positive integer`)
  }
  if (!Number.isInteger(l) || l < 0 || l > 3) {
    throw new Error(`effectiveZ: l=${l} must be in [0, 3] (s, p, d, f)`)
  }

  const config = CONFIGURATIONS[element]
  if (!config) {
    throw new Error(`effectiveZ: element '${element}' not in v1 supported set`)
  }

  // Identify the target sub-shell letter from l.
  const targetL = (['s', 'p', 'd', 'f'] as const)[l]
  const targetGroup = groupKey(n, targetL)
  const targetIsSP = isSPGroup(targetL)

  let sigma = 0

  for (const shell of config) {
    const shellGroup = groupKey(shell.n, shell.l)
    const sameGroup = shellGroup === targetGroup

    if (sameGroup) {
      // Same Slater group as target. The target electron itself sits in
      // exactly one sub-shell entry — the one matching (target.n, target.l).
      // Subtract 1 only from THAT entry; other same-group entries contribute
      // their full count.
      const isTargetEntry = shell.n === n && shell.l === targetL
      const others = isTargetEntry ? Math.max(0, shell.count - 1) : shell.count
      // Within (1s) the per-electron screening is 0.30; otherwise 0.35.
      const perElectron = shellGroup === '1sp' && shell.n === 1 ? 0.3 : 0.35
      sigma += others * perElectron
      continue
    }

    // Different group from target. Contribution depends on shell vs n_target.
    if (targetIsSP) {
      // s/p target: stratify by principal n only.
      if (shell.n === n - 1) {
        sigma += shell.count * 0.85
      } else if (shell.n <= n - 2) {
        sigma += shell.count * 1.0
      }
      // shells with n_shell ≥ n contribute 0 (they're outside or in higher
      // subgroups within the same n; for s/p target both branches are 0).
    } else {
      // d or f target: every shell of LOWER energy than target contributes 1.00.
      // Lower energy ⇔ smaller n, OR same n with lower-l sub-shell.
      if (shell.n < n) {
        sigma += shell.count * 1.0
      } else if (shell.n === n) {
        // Same n: only s/p contribute (they sit "inside" the d/f shell for
        // Slater's purposes); higher-l within same n contribute 0.
        const targetLevel = ['s', 'p', 'd', 'f'].indexOf(targetL)
        const shellLevel = ['s', 'p', 'd', 'f'].indexOf(shell.l)
        if (shellLevel < targetLevel) {
          sigma += shell.count * 1.0
        }
      }
      // shell.n > n contributes 0.
    }
  }

  return bareZ(config) - sigma
}
