/**
 * Spectroscopy helpers — letter ↔ l mapping and transition parser.
 */

import { describe, expect, it } from 'vitest'
import { lFromLetter, letterFromL, parseTransition } from '../../../src/physics/atomic/spectroscopy'

describe('letter ↔ l mapping', () => {
  it("'s' ↔ 0", () => {
    expect(lFromLetter('s')).toBe(0)
    expect(letterFromL(0)).toBe('s')
  })

  it("'p' ↔ 1", () => {
    expect(lFromLetter('p')).toBe(1)
    expect(letterFromL(1)).toBe('p')
  })

  it("'d' ↔ 2, 'f' ↔ 3, 'g' ↔ 4", () => {
    expect(lFromLetter('d')).toBe(2)
    expect(lFromLetter('f')).toBe(3)
    expect(lFromLetter('g')).toBe(4)
    expect(letterFromL(2)).toBe('d')
    expect(letterFromL(3)).toBe('f')
    expect(letterFromL(4)).toBe('g')
  })

  it('letter lookup is case-insensitive', () => {
    expect(lFromLetter('P')).toBe(1)
    expect(lFromLetter(' D ')).toBe(2)
  })

  it('rejects unknown letters with null', () => {
    expect(lFromLetter('q')).toBeNull()
    expect(lFromLetter('')).toBeNull()
    expect(lFromLetter('xx')).toBeNull()
  })

  it('letterFromL rejects out-of-range with null', () => {
    expect(letterFromL(-1)).toBeNull()
    expect(letterFromL(99)).toBeNull()
  })
})

describe('parseTransition — happy paths', () => {
  it("parses '2p → 1s'", () => {
    const t = parseTransition('2p → 1s')
    expect(t).not.toBeNull()
    expect(t!.upper).toMatchObject({ n: 2, l: 1, letter: 'p' })
    expect(t!.lower).toMatchObject({ n: 1, l: 0, letter: 's' })
  })

  it("parses 'n=3 → 2' (l defaults to 0)", () => {
    const t = parseTransition('n=3 → 2')
    expect(t).not.toBeNull()
    expect(t!.upper).toMatchObject({ n: 3, l: 0, letter: 's' })
    expect(t!.lower).toMatchObject({ n: 2, l: 0, letter: 's' })
  })

  it("parses '3d → 2p'", () => {
    const t = parseTransition('3d → 2p')
    expect(t).not.toBeNull()
    expect(t!.upper).toMatchObject({ n: 3, l: 2, letter: 'd' })
    expect(t!.lower).toMatchObject({ n: 2, l: 1, letter: 'p' })
  })

  it("parses '3²P → 2²S' and preserves termSymbolHint", () => {
    const t = parseTransition('3²P → 2²S')
    expect(t).not.toBeNull()
    expect(t!.upper).toMatchObject({ n: 3, l: 1, letter: 'p' })
    expect(t!.lower).toMatchObject({ n: 2, l: 0, letter: 's' })
    expect(t!.upper.termSymbolHint).toBe('3²P')
    expect(t!.lower.termSymbolHint).toBe('2²S')
  })

  it("accepts ASCII arrow '->'", () => {
    const t = parseTransition('3d -> 2p')
    expect(t).not.toBeNull()
    expect(t!.upper.n).toBe(3)
    expect(t!.lower.n).toBe(2)
  })

  it('is whitespace and case tolerant', () => {
    const t = parseTransition('  2P  →   1S  ')
    expect(t).not.toBeNull()
    expect(t!.upper).toMatchObject({ n: 2, l: 1, letter: 'p' })
    expect(t!.lower).toMatchObject({ n: 1, l: 0, letter: 's' })
  })

  it('picks representative m = 0 for tesseral rendering', () => {
    const t = parseTransition('2p → 1s')
    expect(t!.upper.m).toBe(0)
    expect(t!.lower.m).toBe(0)
  })
})

describe('parseTransition — patterns we deliberately reject', () => {
  it("returns null on hyperfine: 'F=1 → 0 (hyperfine)'", () => {
    expect(parseTransition('F=1 → 0 (hyperfine)')).toBeNull()
  })

  it("returns null on multi-electron config: '2p⁵3p → 2p⁵3s'", () => {
    expect(parseTransition('2p⁵3p → 2p⁵3s')).toBeNull()
  })

  it("returns null on multi-electron config: '2p53p → 2p53s'", () => {
    expect(parseTransition('2p53p → 2p53s')).toBeNull()
  })

  it('returns null on missing arrow', () => {
    expect(parseTransition('2p 1s')).toBeNull()
  })

  it('returns null on empty input', () => {
    expect(parseTransition('')).toBeNull()
  })
})
