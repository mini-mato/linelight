/**
 * Map a spectral-line primitive to a 4D-animation payload.
 *
 * For hydrogen-like (Z-bare) lines whose upper/lower levels resolve to
 * closed-form orbitals, we emit a `hydrogen-orbital-pair` payload that
 * the runtime can sample via `psiCartesian` from
 * `src/physics/atomic/wavefunction.ts`.
 *
 * For multi-electron lines (He I, Hg, Na, Ne) we emit a
 * `schematic-interp` payload — the runtime falls back to a hand-drawn
 * shape interpolation with a `(schematic)` label, since the real
 * orbitals require Hartree-Fock.
 *
 * Branch resolution rule for bare-n hydrogen (e.g. "n=3 → 2"):
 *   `representativeE1BranchesForBareHydrogenTransition(nU, nL)` returns
 *   every E1-allowed (Δl = ±1) subshell branch between the two shells.
 *   We pick the branch that minimises Δl-magnitude tie-breaker score:
 *     1. prefer upper-l > lower-l (true emission descent has upper l
 *        usually higher in spectroscopist convention for visible lines,
 *        but mathematically either Δl sign is valid). Choose
 *        `representativeUpper.l > representativeLower.l` first.
 *     2. prefer the lowest pair of l values (smallest upper.l).
 *   For Hα (n=3 → 2) this picks 3p → 2s (upper.l=1, lower.l=0).
 *   For Hβ (n=4 → 2) this picks 4p → 2s.
 *
 * The choice is named in the `branchLabel` field so the caption can
 * cite the picked branch alongside the bare-n label.
 *
 * m quantum number: for unpolarized emission, we render the slice in
 * the z=0 plane and pick the m=0 magnetic substate (axially symmetric
 * about z). This is the convention spectroscopy.ts already uses as its
 * "representative" m. For non-axial transitions (m_upper - m_lower ≠ 0)
 * the spatial pattern depends on polarization; m=0 is the σ-component
 * baseline.
 */

import type { Primitive, SpectralLineAttrs, EnergyLevelAttrs } from '../atlas/types.js'
import { parseTransition } from '../physics/atomic/spectroscopy.js'
import {
  representativeE1BranchesForBareHydrogenTransition,
  getOrbital,
  isCatalogShellNumber,
  isCatalogAngularMomentum,
} from '../physics/atomic/orbitals.js'
import { transitionAngularFrequency_rad_per_s } from '../physics/atomic/superposition.js'
import type { AppCard } from './seed.js'

/** Speed of light in m/s (SI exact). */
const C_M_PER_S = 299_792_458

/** Hartree-Joule etc. constants needed for ω from λ when level energies absent. */
const H_J_S = 6.626_070_15e-34
const E_C = 1.602_176_634e-19

type AnimPayload = NonNullable<AppCard['animation']>

export function resolveSpectralLineAnimation(
  primitive: Primitive,
  primitivesById: Map<string, Primitive>,
): AnimPayload | undefined {
  if (primitive.family !== 'spectral-line') return undefined
  const attrs = primitive.attrs as SpectralLineAttrs
  if (typeof attrs.wavelengthVacuumNm !== 'number' || attrs.wavelengthVacuumNm <= 0) {
    return undefined
  }

  const lambdaNm = attrs.wavelengthVacuumNm
  const nuHz = (C_M_PER_S * 1e9) / lambdaNm

  // Compute ω_fi: prefer level energies (eV) when both are known; else
  // fall back to 2π · ν = 2π c / λ (always correct for a photon).
  const omegaFi = omegaFromLevels(primitivesById, attrs) ?? 2 * Math.PI * nuHz

  // Is this a hydrogen line we can render against closed-form ψ?
  // Heuristic: id begins with "spectral-line.h." AND we can resolve the
  // (n,l) pair from either the transition string or the level ids.
  const isHydrogen = primitive.id.startsWith('spectral-line.h.')
  // He II (hydrogenic, Z=2) — also closed-form, just rescaled.
  const isHeII = /spectral-line\.he\.30-4|spectral-line\.he\.heII/.test(primitive.id)

  if (isHydrogen) {
    const hPair = resolveHydrogenPair(primitive, attrs)
    if (hPair) {
      return {
        kind: 'hydrogen-orbital-pair',
        Z: 1,
        upper: hPair.upper,
        lower: hPair.lower,
        branchLabel: hPair.branchLabel,
        omegaFi,
        lambdaNm,
        nuHz,
      }
    }
  }

  if (isHeII) {
    // He II 30.4 nm is 2p → 1s in the He⁺ hydrogenic ion (Z=2).
    return {
      kind: 'hydrogen-orbital-pair',
      Z: 2,
      upper: { n: 2, l: 1, m: 0, label: '2p' },
      lower: { n: 1, l: 0, m: 0, label: '1s' },
      branchLabel: '2p → 1s (hydrogenic Z=2 helium-II ion)',
      omegaFi,
      lambdaNm,
      nuHz,
    }
  }

  // Everything else: schematic interpolation between hand-drawn shape proxies.
  const upperLabel = labelFromLevelId(attrs.upperLevelId) ?? 'upper'
  const lowerLabel = labelFromLevelId(attrs.lowerLevelId) ?? 'lower'
  return {
    kind: 'schematic-interp',
    upperLabel,
    lowerLabel,
    omegaFi,
    lambdaNm,
    nuHz,
  }
}

function omegaFromLevels(
  primitivesById: Map<string, Primitive>,
  attrs: SpectralLineAttrs,
): number | undefined {
  const eU = energyEV(primitivesById, attrs.upperLevelId)
  const eL = energyEV(primitivesById, attrs.lowerLevelId)
  if (eU === undefined || eL === undefined) return undefined
  return transitionAngularFrequency_rad_per_s(eU, eL)
}

function energyEV(map: Map<string, Primitive>, id: string | undefined): number | undefined {
  if (!id) return undefined
  const p = map.get(id)
  if (!p) return undefined
  const a = p.attrs as EnergyLevelAttrs
  return typeof a.energyEV === 'number' ? a.energyEV : undefined
}

function labelFromLevelId(id: string | undefined): string | undefined {
  if (!id) return undefined
  // Examples: "energy-level.h.n3", "energy-level.he.3-3p", "energy-level.he.heII.2p"
  const tail = id.replace(/^energy-level\./, '')
  return tail
}

type HydrogenPair = {
  upper: { n: number; l: number; m: number; label: string }
  lower: { n: number; l: number; m: number; label: string }
  branchLabel: string
}

/**
 * Resolve a hydrogen spectral-line into a representative (n_u,l_u,m_u)/
 * (n_l,l_l,m_l) pair suitable for rendering ψ_nlm in the z=0 plane.
 *
 * Strategy:
 *   1. Try parsing primitive.name with `parseTransition` ("n=3 → 2").
 *      If both sides yield an n, expand to representative E1 branches
 *      via `representativeE1BranchesForBareHydrogenTransition`.
 *   2. Choose the branch with upper.l > lower.l and smallest upper.l;
 *      this picks 3p → 2s for Hα, 4p → 2s for Hβ, etc.
 *   3. m = 0 for both states (axial-symmetric slice, σ component).
 *   4. If parsing fails, return undefined and let the caller fall back
 *      to the schematic interp.
 */
function resolveHydrogenPair(
  primitive: Primitive,
  attrs: SpectralLineAttrs,
): HydrogenPair | undefined {
  // The Balmer/Lyman lines stash the n in the primitive name string,
  // e.g. "H Balmer α (n=3 → 2)". Pull the parenthetical first.
  const parenMatch = primitive.name.match(/\(([^)]+)\)/)
  const transitionString = parenMatch?.[1] ?? primitive.name
  const parsed = parseTransition(transitionString)
  if (!parsed) return undefined

  const nU = parsed.upper.n
  const nL = parsed.lower.n
  if (!isCatalogShellNumber(nU) || !isCatalogShellNumber(nL)) return undefined

  // If the parser pulled out both l values, just trust them.
  const haveLU = parsed.upper.letter !== 's' || parsed.upper.l > 0
  const haveLL = parsed.lower.letter !== 's' || parsed.lower.l > 0
  if (haveLU && haveLL) {
    if (isCatalogAngularMomentum(parsed.upper.l) && isCatalogAngularMomentum(parsed.lower.l)) {
      const uOrb = getOrbital(nU, parsed.upper.l, 0)
      const lOrb = getOrbital(nL, parsed.lower.l, 0)
      if (uOrb && lOrb) {
        return {
          upper: { n: nU, l: parsed.upper.l, m: 0, label: uOrb.subshellLabel },
          lower: { n: nL, l: parsed.lower.l, m: 0, label: lOrb.subshellLabel },
          branchLabel: `${uOrb.subshellLabel} → ${lOrb.subshellLabel} (m=0 slice)`,
        }
      }
    }
  }

  // Otherwise expand bare-n → bare-n and pick a representative branch.
  const branches = representativeE1BranchesForBareHydrogenTransition(nU, nL)
  if (branches.length === 0) return undefined

  // Tie-break: prefer upper.l > lower.l (Δl = +1 emission descent), then
  // smallest upper.l so we get 3p → 2s for Hα, 4p → 2s for Hβ, etc.
  const scored = branches.map((b) => {
    const dlSign = b.deltaL === 1 ? 0 : 1 // 0 means upper.l = lower.l + 1, preferred
    return { b, dlSign, upperL: b.upperSubshell.l }
  })
  scored.sort((a, b) => a.dlSign - b.dlSign || a.upperL - b.upperL)
  const winner = scored[0].b

  // Suppress unused-attrs warning while keeping the param for future signature stability.
  void attrs

  return {
    upper: {
      n: winner.upperSubshell.n,
      l: winner.upperSubshell.l,
      m: 0,
      label: winner.upperSubshell.label,
    },
    lower: {
      n: winner.lowerSubshell.n,
      l: winner.lowerSubshell.l,
      m: 0,
      label: winner.lowerSubshell.label,
    },
    branchLabel: `${winner.upperSubshell.label} → ${winner.lowerSubshell.label} (E1 representative of n=${nU} → ${nL}, m=0 slice)`,
  }
}

// Re-export the SI constants in case the app shell needs them; the
// runtime caption math is small enough to inline though.
export { C_M_PER_S, H_J_S, E_C }
