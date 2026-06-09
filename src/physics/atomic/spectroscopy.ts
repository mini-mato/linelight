/**
 * Spectroscopic notation helpers.
 *
 *   - Letter ↔ angular-momentum quantum number l mapping.
 *     s ↔ 0, p ↔ 1, d ↔ 2, f ↔ 3, g ↔ 4, h ↔ 5, i ↔ 6 (j is skipped).
 *   - Transition-string parser. Best-effort, picks a representative m=0 for
 *     tesseral rendering. Returns null on patterns it cannot resolve, so the
 *     caller can fall back to a manual selection.
 */

const LETTER_TO_L: Record<string, number> = {
  s: 0,
  p: 1,
  d: 2,
  f: 3,
  g: 4,
  h: 5,
  i: 6,
}

const L_TO_LETTER = ['s', 'p', 'd', 'f', 'g', 'h', 'i'] as const

/** Maps spectroscopic letter to angular-momentum number l. Case-insensitive. */
export function lFromLetter(letter: string): number | null {
  if (typeof letter !== 'string' || letter.length === 0) return null
  const ch = letter.trim().toLowerCase()
  const v = LETTER_TO_L[ch]
  return v === undefined ? null : v
}

/** Maps l to lowercase spectroscopic letter. */
export function letterFromL(l: number): string | null {
  if (!Number.isInteger(l) || l < 0 || l >= L_TO_LETTER.length) return null
  return L_TO_LETTER[l]
}

export type ParsedState = {
  n: number
  l: number
  /** Representative magnetic quantum number; 0 for axial-symmetric pick. */
  m: number
  /** Lowercase spectroscopic letter, e.g. 's' | 'p' | 'd' | 'f'. */
  letter: string
  /** Original raw token (preserved for downstream display). */
  termSymbolHint?: string
}

export type ParsedTransition = {
  upper: ParsedState
  lower: ParsedState
}

const SUPERS = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const SUBS = '₀₁₂₃₄₅₆₇₈₉'

/** Translate Unicode super/subscript digits to ASCII; leave other chars alone. */
function asciifyDigits(s: string): string {
  let out = ''
  for (const ch of s) {
    const sup = SUPERS.indexOf(ch)
    if (sup >= 0) {
      out += String(sup)
      continue
    }
    const sub = SUBS.indexOf(ch)
    if (sub >= 0) {
      out += String(sub)
      continue
    }
    out += ch
  }
  return out
}

/**
 * True iff token looks like a multi-electron configuration fragment:
 * has an `[Ne]`-style core, OR contains a digit-then-letter-then-digit
 * sequence in the ASCII-ified form (e.g. "2p53p").
 */
function looksLikeConfiguration(rawToken: string): boolean {
  if (/\[/.test(rawToken)) return true
  // ASCII-ify, then look for "<digit>+<letter><digit>+<letter>" — that pattern
  // only arises from concatenated sub-shells like "2p⁵3p", never from a
  // single-state designator or term symbol.
  const ascii = asciifyDigits(rawToken)
  return /\d+[a-z]\d+[a-z]/i.test(ascii)
}

/**
 * Parse one side of a transition into a ParsedState.
 * Returns null on patterns we cannot confidently resolve.
 *
 * Recognized forms (in priority order):
 *   1. Term symbol with explicit multiplicity:
 *        "3²P", "3 2P", "3^2P", "2²S_{1/2}", "3 ²P_{3/2}"
 *      (a digit n, then a multiplicity digit either as Unicode superscript
 *       or after `^` or as a separate whitespace-delimited digit, then an
 *       uppercase L letter, optional `_J`).
 *   2. Configuration-style state: "2p", "3d", "4f"
 *   3. Bare principal: "n=3" or just "3"
 */
function parseState(side: string): ParsedState | null {
  const original = side.trim()
  if (original.length === 0) return null

  if (looksLikeConfiguration(original)) return null

  // Hyperfine: F is the hyperfine total angular momentum, never a principal n.
  if (/^F\s*=/i.test(original)) return null

  // 1) Term symbol — multiplicity given as Unicode superscript.
  //    e.g. "3²P", "2³S_{1/2}", "3⁴P".
  const termSupRe = new RegExp(
    `^\\s*(\\d+)\\s*([${SUPERS}]+)\\s*([SPDFGHI])(?:[_]?\\{?[^}]*\\}?)?\\s*$`,
  )
  const termSupMatch = termSupRe.exec(original)
  if (termSupMatch) {
    const n = parseInt(termSupMatch[1], 10)
    const letter = termSupMatch[3].toLowerCase()
    const l = LETTER_TO_L[letter]
    if (Number.isFinite(n) && n >= 1 && l !== undefined) {
      return { n, l, m: 0, letter, termSymbolHint: original }
    }
  }

  // 1b) Term symbol with `^N` or whitespace-delimited multiplicity in ASCII.
  //    e.g. "3^2P", "3 2P", "3^4P_3/2".
  const termAsciiRe = /^\s*(\d+)\s*(?:\^|\s)\s*(\d+)\s*([SPDFGHI])(?:[_]?\{?[^}]*\}?)?\s*$/
  const termAsciiMatch = termAsciiRe.exec(original)
  if (termAsciiMatch) {
    const n = parseInt(termAsciiMatch[1], 10)
    const letter = termAsciiMatch[3].toLowerCase()
    const l = LETTER_TO_L[letter]
    if (Number.isFinite(n) && n >= 1 && l !== undefined) {
      return { n, l, m: 0, letter, termSymbolHint: original }
    }
  }

  // 2) Configuration-style state: "2p", "3d", "4f" (single n, single letter).
  const nlRe = /^\s*(\d+)\s*([a-zA-Z])\s*$/
  const nlMatch = nlRe.exec(original)
  if (nlMatch) {
    const n = parseInt(nlMatch[1], 10)
    const letter = nlMatch[2].toLowerCase()
    const l = LETTER_TO_L[letter]
    if (Number.isFinite(n) && n >= 1 && l !== undefined) {
      return { n, l, m: 0, letter }
    }
  }

  // 3) Bare principal: "n=3" or "3"
  const nEqRe = /^\s*(?:n\s*=\s*)?(\d+)\s*$/i
  const nEqMatch = nEqRe.exec(original)
  if (nEqMatch) {
    const n = parseInt(nEqMatch[1], 10)
    if (Number.isFinite(n) && n >= 1) {
      return { n, l: 0, m: 0, letter: 's' }
    }
  }

  return null
}

/**
 * Parse a transition string of the form "<upper> → <lower>" (or "->").
 * Whitespace tolerant; letters case-insensitive.
 *
 * Examples that return non-null:
 *   "2p → 1s"            → upper {n:2,l:1,letter:'p'}, lower {n:1,l:0,letter:'s'}
 *   "n=3 → 2"            → upper {n:3}, lower {n:2,l:0}
 *   "3²P → 2²S"          → upper {n:3,l:1}, lower {n:2,l:0}
 *   "3d -> 2p"           → upper {n:3,l:2}, lower {n:2,l:1}
 *
 * Examples that return null (caller can fall back):
 *   "F=1 → 0 (hyperfine)"
 *   "2p⁵3p → 2p⁵3s"      (multi-electron configuration)
 */
export function parseTransition(transition: string): ParsedTransition | null {
  if (typeof transition !== 'string') return null

  const raw = transition.trim()
  if (raw.length === 0) return null

  // Reject obvious hyperfine notation early — F is the hyperfine total
  // angular momentum, not a principal quantum number.
  if (/F\s*=/.test(raw)) return null

  // Reject parenthetical annotations like "(hyperfine)" by stripping them
  // out for the side parse — but if the annotation was the sole disambiguator
  // for hyperfine, we'd already have bailed above.
  const cleaned = raw.replace(/\([^)]*\)/g, '').trim()

  // Split on Unicode arrow or ASCII "->"
  const parts = cleaned.split(/\s*(?:→|->)\s*/)
  if (parts.length !== 2) return null

  const upper = parseState(parts[0])
  const lower = parseState(parts[1])

  if (!upper || !lower) return null

  return { upper, lower }
}
