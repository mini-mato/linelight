/**
 * Slater's-rules screened effective Z tests.
 *
 * Pinned values (Slater 1930):
 *   Z_eff(H,  1s) = 1.00
 *   Z_eff(He, 1s) = 1.70   (= 2 − 0.30)
 *   Z_eff(Na, 3s) = 2.20   (= 11 − [0 + 8·0.85 + 2·1.00])
 *   Z_eff(Mg, 3s) = 2.85   (= 12 − [0.35 + 8·0.85 + 2·1.00])
 *   Z_eff(C,  2p) = 3.25   (= 6 − [3·0.35 + 2·0.85])
 *   Z_eff(O,  2p) = 4.55   (= 8 − [5·0.35 + 2·0.85])
 *   Z_eff(Fe, 3d) = 6.25   (= 26 − [5·0.35 + 18·1.00])
 */

import { describe, expect, it } from 'vitest'
import { effectiveZ } from '../../../src/physics/atomic/slater'

describe('effectiveZ — pinned reference values', () => {
  it('H 1s: Z_eff = 1.00 (single electron)', () => {
    expect(effectiveZ('H', 1, 0)).toBeCloseTo(1.0, 6)
  })

  it('He 1s: Z_eff = 1.70', () => {
    expect(effectiveZ('He', 1, 0)).toBeCloseTo(1.7, 6)
  })

  it('Na 3s: Z_eff = 2.20', () => {
    expect(effectiveZ('Na', 3, 0)).toBeCloseTo(2.2, 6)
  })

  it('Mg 3s: Z_eff = 2.85', () => {
    expect(effectiveZ('Mg', 3, 0)).toBeCloseTo(2.85, 6)
  })

  it('C 2p: Z_eff = 3.25', () => {
    expect(effectiveZ('C', 2, 1)).toBeCloseTo(3.25, 6)
  })

  it('O 2p: Z_eff = 4.55', () => {
    expect(effectiveZ('O', 2, 1)).toBeCloseTo(4.55, 6)
  })

  it('Fe 3d: Z_eff = 6.25 (d-target: inner shells contribute 1.00, not 0.85)', () => {
    expect(effectiveZ('Fe', 3, 2)).toBeCloseTo(6.25, 6)
  })
})

describe('effectiveZ — invariants', () => {
  it('monotonic in Z: heavier element → higher Z_eff for same (n, l)', () => {
    const li = effectiveZ('Li', 2, 0)
    const c = effectiveZ('C', 2, 0)
    expect(c).toBeGreaterThan(li)
  })

  it('rejects unknown elements', () => {
    expect(() => effectiveZ('Xx', 1, 0)).toThrow()
  })
})
