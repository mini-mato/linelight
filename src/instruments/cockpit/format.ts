/**
 * Cockpit — pure display formatters.
 *
 * No DOM, no store. Each function takes a value and returns a string, with
 * units and rounding chosen for the readout-panel context (compact, one
 * line, monospace).
 *
 * Conventions:
 *   • Subscript / superscript glyphs use Unicode (²P₃/₂ rather than `<sup>`).
 *   • Frequencies auto-scale across Hz / kHz / MHz / GHz / THz / PHz.
 *   • Wavelength formatting matches the spectrum-bar's `formatWavelength`
 *     style for the visible band (nm with 3 decimals).
 */

import type { TermState } from '../../types'

/** Spectroscopic letter from orbital quantum number l. */
const L_LETTERS = ['s', 'p', 'd', 'f', 'g', 'h'] as const

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
}

const SUBSCRIPT_DIGITS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
}

/** Map an integer to a Unicode-superscript string. */
export function toSuperscript(n: number): string {
  return n
    .toString()
    .split('')
    .map((d) => SUPERSCRIPT_DIGITS[d] ?? d)
    .join('')
}

/** Map a half-integer (0.5, 1, 1.5, 2, …) to a subscript fraction like ₁/₂, ₃/₂, ₁, ₂, … */
export function fractionSubscript(j: number): string {
  // half-integer test
  const doubled = Math.round(j * 2)
  if (doubled % 2 === 0) {
    // integer
    return (doubled / 2)
      .toString()
      .split('')
      .map((d) => SUBSCRIPT_DIGITS[d] ?? d)
      .join('')
  }
  // odd over 2
  const num = doubled
    .toString()
    .split('')
    .map((d) => SUBSCRIPT_DIGITS[d] ?? d)
    .join('')
  return `${num}/₂`
}

/** Letter from orbital quantum number l (0=s, 1=p, …). Empty string when out of range. */
export function lLetter(l: number): string {
  if (!Number.isInteger(l) || l < 0 || l >= L_LETTERS.length) return ''
  return L_LETTERS[l]
}

/**
 * Format a TermState as `n=N · {l-letter} · ²S+1L_J`.
 *
 *   {n=3, l=1, s=0.5, j=1.5} → "n=3 · p · ²P₃/₂"
 *
 * If the TermState already carries a non-empty `termSymbol`, that symbol
 * is preferred (it may be human-curated, e.g. ²P₃/₂ vs the auto-form).
 */
export function formatTermState(t: TermState): string {
  const letter = lLetter(t.l) || '?'
  const multiplicity = Math.round(2 * t.s + 1)
  const supMult = toSuperscript(multiplicity)
  const lUpper = letter.toUpperCase()
  const auto = `${supMult}${lUpper}${fractionSubscript(t.j)}`
  const symbol = t.termSymbol && t.termSymbol.trim() !== '' ? t.termSymbol : auto
  return `n=${t.n} · ${letter} · ${symbol}`
}

/** Format ΔE in eV, 4 sig figs in the magnitude that fits in a small panel. */
export function formatEnergy_eV(eV: number): string {
  const abs = Math.abs(eV)
  if (abs === 0) return '0 eV'
  if (abs >= 100) return `${eV.toFixed(2)} eV`
  if (abs >= 10) return `${eV.toFixed(3)} eV`
  if (abs >= 1) return `${eV.toFixed(4)} eV`
  if (abs >= 0.01) return `${eV.toFixed(5)} eV`
  return `${eV.toExponential(3)} eV`
}

/** Format an energy in joules (compact scientific). */
export function formatEnergy_J(J: number): string {
  return `${J.toExponential(3)} J`
}

/**
 * Format a wavelength (nm) for the readout. Compact: 3 decimals when in the
 * visible / near-visible window, otherwise auto-scale to µm or m for very
 * long wavelengths (the 21 cm hyperfine line is the extreme case).
 */
export function formatWavelength_nm(nm: number): string {
  if (!Number.isFinite(nm)) return '∞ nm'
  const abs = Math.abs(nm)
  if (abs >= 1e7) {
    // 1e7 nm = 1 cm → switch to meters
    return `${(nm / 1e9).toExponential(3)} m`
  }
  if (abs >= 1e6) {
    return `${(nm / 1e6).toFixed(3)} mm`
  }
  if (abs >= 1e4) {
    return `${(nm / 1e3).toFixed(3)} µm`
  }
  if (abs >= 100) return `${nm.toFixed(3)} nm`
  if (abs >= 1) return `${nm.toFixed(4)} nm`
  return `${nm.toExponential(3)} nm`
}

/**
 * Auto-scale a frequency in Hz to the SI prefix that puts the leading
 * coefficient in [1, 1000). Falls back to scientific notation for very small
 * or very large values.
 */
export function formatFrequency_Hz(hz: number): string {
  if (!Number.isFinite(hz) || hz === 0) return '0 Hz'
  const abs = Math.abs(hz)
  const units: ReadonlyArray<{ scale: number; suffix: string }> = [
    { scale: 1e15, suffix: 'PHz' },
    { scale: 1e12, suffix: 'THz' },
    { scale: 1e9, suffix: 'GHz' },
    { scale: 1e6, suffix: 'MHz' },
    { scale: 1e3, suffix: 'kHz' },
    { scale: 1, suffix: 'Hz' },
  ]
  for (const u of units) {
    if (abs >= u.scale) {
      const v = hz / u.scale
      // Three sig figs total in the coefficient.
      const decimals = v >= 100 ? 1 : v >= 10 ? 2 : 3
      return `${v.toFixed(decimals)} ${u.suffix}`
    }
  }
  return `${hz.toExponential(3)} Hz`
}
