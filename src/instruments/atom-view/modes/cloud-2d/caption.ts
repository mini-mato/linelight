/**
 * Caption strings for an Atom View 2D pane.
 *
 *   pane caption (existing):
 *     "upper · 2p · n=2 ℓ=1 · ²P₃/₂ · −3.40 eV"
 *
 *   psi formula caption (pedagogical):
 *     "ψ₂₁₀ ∝ Zr·exp(−Zr/2a₀) · cos θ"
 *
 *   node count callout (pedagogical):
 *     "nodes: 1 total (0 radial · 1 angular)"
 */

import type { ElementSymbol, TermState } from '../../../../types'
import { letterFromL } from '../../../../physics/atomic'

export type PaneRole = 'upper' | 'lower'

export function paneCaption(role: PaneRole, term: TermState): string {
  const letter = letterFromL(term.l)
  const nl = `${term.n}${letter}`
  const energy = `${formatEnergy(term.energy_eV)} eV`
  // Compose:  "upper · 2p · n=2 ℓ=1 · ²P₃/₂ · −3.40 eV"
  return `${role} · ${nl} · n=${term.n} ℓ=${term.l} · ${term.termSymbol} · ${energy}`
}

export function transitionString(upper: TermState, lower: TermState): string {
  const upperLetter = letterFromL(upper.l)
  const lowerLetter = letterFromL(lower.l)
  return `${upper.n}${upperLetter} → ${lower.n}${lowerLetter}`
}

export function elementString(symbol: ElementSymbol): string {
  return symbol
}

function formatEnergy(eV: number): string {
  // Use a Unicode minus for typographic consistency; render a fixed 2-decimal
  // figure so the caption width is stable across selections.
  const abs = Math.abs(eV).toFixed(2)
  return eV < 0 ? `−${abs}` : abs
}

/* ------------------------------------------------------------------------ */
/* Pedagogical captions: ψ formula and node count                            */
/* ------------------------------------------------------------------------ */

const SUB_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉']

function subscriptDigit(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9) return String(n)
  return SUB_DIGITS[n]
}

/**
 * Closed-form ψ_nlm (with m = 0, the rendered axial slice) for the (n, l)
 * combinations the instrument supports — n ∈ 1..4, l ∈ 0..n-1.
 *
 * These are the unnormalized hydrogenic forms (proportional to ∝). ρ = Zr/a₀.
 * Sources: Bransden & Joachain, "Physics of Atoms and Molecules", App. 5;
 * cross-checked against Hyperphysics' tabulated radial functions and the
 * spherical-harmonic table. The 1s case is given fully normalized because the
 * normalization constant is short and reads cleanly inline.
 */
const PSI_FORMULA_TABLE: Record<string, string> = {
  // n = 1
  '1,0': 'ψ₁₀₀ = (1/√π)(Z/a₀)^(3/2) exp(−Zr/a₀)',
  // n = 2
  '2,0': 'ψ₂₀₀ ∝ (2 − Zr/a₀) exp(−Zr/2a₀)',
  '2,1': 'ψ₂₁₀ ∝ Zr·exp(−Zr/2a₀) · cos θ',
  // n = 3
  '3,0': 'ψ₃₀₀ ∝ (27 − 18ρ + 2ρ²) exp(−ρ/3), ρ = Zr/a₀',
  '3,1': 'ψ₃₁₀ ∝ ρ(6 − ρ) exp(−ρ/3) cos θ',
  '3,2': 'ψ₃₂₀ ∝ ρ² exp(−ρ/3)(3cos²θ − 1)',
  // n = 4
  '4,0': 'ψ₄₀₀ ∝ (192 − 144ρ + 24ρ² − ρ³) exp(−ρ/4), ρ = Zr/a₀',
  '4,1': 'ψ₄₁₀ ∝ ρ(80 − 20ρ + ρ²) exp(−ρ/4) cos θ',
  '4,2': 'ψ₄₂₀ ∝ ρ²(12 − ρ) exp(−ρ/4)(3cos²θ − 1)',
  '4,3': 'ψ₄₃₀ ∝ ρ³ exp(−ρ/4)(5cos³θ − 3cos θ)',
}

/**
 * Return the ψ formula caption for (n, l). Falls back to the generic
 * "Rₙₗ · Yₗᵐ" form when (n, l) is outside the table.
 */
export function psiFormula(n: number, l: number): string {
  const key = `${n},${l}`
  const hit = PSI_FORMULA_TABLE[key]
  if (hit) return hit
  const letter = letterFromL(l) ?? '?'
  // Fallback: "ψ_${n}${letter} ∝ R_${n}${l}(r) · Y_${l}^${m}(θ, φ)"
  // We render m = 0 because the axial slice fixes m (see field.ts).
  const nSub = subscriptDigit(n)
  const lSub = subscriptDigit(l)
  return `ψ_${nSub}${letter} ∝ R_${nSub}${lSub}(r) · Y_${lSub}^0(θ, φ)`
}

/**
 * Node count callout for (n, l).
 *
 *   total nodes  = n − 1
 *   radial       = n − l − 1
 *   angular      = l
 *
 * Examples: 2p → "1 total (0 radial · 1 angular)";
 *           3s → "2 total (2 radial · 0 angular)";
 *           3p → "2 total (1 radial · 1 angular)".
 */
export function nodeCount(n: number, l: number): string {
  const total = Math.max(0, n - 1)
  const radial = Math.max(0, n - l - 1)
  const angular = Math.max(0, l)
  return `nodes: ${total} total (${radial} radial · ${angular} angular)`
}
