/**
 * Hydrogenic energy-level tests.
 *
 * Pinned values:
 *   E_1(H,    Z=1) ≈ −13.6057 eV   (Lyman ground state)
 *   E_2(H,    Z=1) ≈  −3.4014 eV   (n=2)
 *   E_1(He⁺,  Z=2) ≈ −54.4228 eV   (= 4 × E_1(H))
 */

import { describe, expect, it } from 'vitest'
import { hydrogenicEnergy_eV } from '../../../src/physics/atomic/energy'

describe('hydrogenicEnergy_eV', () => {
  it('E_1 of hydrogen ≈ −13.6 eV', () => {
    expect(hydrogenicEnergy_eV(1, 1)).toBeCloseTo(-13.6057, 3)
  })

  it('E_2 of hydrogen ≈ −3.4 eV', () => {
    expect(hydrogenicEnergy_eV(2, 1)).toBeCloseTo(-3.4014, 3)
  })

  it('E_1 of He II = 4 × E_1(H) ≈ −54.4 eV', () => {
    expect(hydrogenicEnergy_eV(1, 2)).toBeCloseTo(-54.4228, 2)
  })

  it('Lyman-α energy E_2 − E_1 ≈ 10.2 eV', () => {
    const e2 = hydrogenicEnergy_eV(2, 1)
    const e1 = hydrogenicEnergy_eV(1, 1)
    expect(e2 - e1).toBeCloseTo(10.2043, 3)
  })
})
