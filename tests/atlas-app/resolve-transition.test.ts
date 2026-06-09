/**
 * Spectral-line transition resolver tests.
 *
 * Confirms:
 *   - hydrogen Balmer α (n=3 → 2) picks the 3p → 2s representative E1 branch
 *   - He I 388.9 (3³P → 2³S) falls back to schematic-interp
 *   - He II 30.4 picks Z=2 hydrogenic 2p → 1s
 *   - ω_fi is positive and matches 2π c / λ within a sliver when level
 *     energies are missing
 */

import { describe, it, expect } from 'vitest'

import { resolveSpectralLineAnimation } from '../../src/atlas-app/resolve-transition.js'
import type { Primitive } from '../../src/atlas/types.js'

function hAlphaPrimitive(): Primitive {
  return {
    id: 'spectral-line.h.h-alpha',
    family: 'spectral-line',
    name: 'H Balmer α (n=3 → 2)',
    symbol: 'Hα',
    attrs: {
      wavelengthVacuumNm: 656.281,
      transitionType: 'E1',
      upperLevelId: 'energy-level.h.n3',
      lowerLevelId: 'energy-level.h.n2',
    },
    sourceId: 'nist-asd-v5.10',
    retrievedAt: '2026-05-02',
  }
}

function levelEv(id: string, energyEV: number): Primitive {
  return {
    id,
    family: 'energy-level',
    name: id,
    attrs: { energyEV },
    sourceId: 'nist-asd-v5.10',
    retrievedAt: '2026-05-02',
  }
}

describe('resolveSpectralLineAnimation', () => {
  it('Hα picks 3p → 2s E1 branch', () => {
    const ham = hAlphaPrimitive()
    const map = new Map<string, Primitive>()
    map.set(ham.id, ham)
    map.set('energy-level.h.n3', levelEv('energy-level.h.n3', -1.51109))
    map.set('energy-level.h.n2', levelEv('energy-level.h.n2', -3.3995))
    const anim = resolveSpectralLineAnimation(ham, map)
    expect(anim?.kind).toBe('hydrogen-orbital-pair')
    if (anim?.kind !== 'hydrogen-orbital-pair') throw new Error('wrong kind')
    expect(anim.upper).toEqual({ n: 3, l: 1, m: 0, label: '3p' })
    expect(anim.lower).toEqual({ n: 2, l: 0, m: 0, label: '2s' })
    expect(anim.Z).toBe(1)
    expect(anim.lambdaNm).toBe(656.281)
    // ω_fi positive (upper − lower; level eV diff = -1.51109 - (-3.3995) ≈ 1.888)
    expect(anim.omegaFi).toBeGreaterThan(0)
  })

  it('He I 388.9 falls back to schematic-interp', () => {
    const p: Primitive = {
      id: 'spectral-line.he.388-9',
      family: 'spectral-line',
      name: 'He I 388.9 (3³P → 2³S)',
      attrs: {
        wavelengthVacuumNm: 388.86,
        transitionType: 'E1',
        upperLevelId: 'energy-level.he.3-3p',
        lowerLevelId: 'energy-level.he.2-3s',
      },
      sourceId: 'nist-asd-v5.10',
      retrievedAt: '2026-05-02',
    }
    const map = new Map<string, Primitive>([[p.id, p]])
    const anim = resolveSpectralLineAnimation(p, map)
    expect(anim?.kind).toBe('schematic-interp')
  })

  it('He II 30.4 picks Z=2 hydrogenic 2p → 1s', () => {
    const p: Primitive = {
      id: 'spectral-line.he.30-4',
      family: 'spectral-line',
      name: 'He II 30.4 (2p → 1s in He⁺)',
      attrs: {
        wavelengthVacuumNm: 30.4,
        transitionType: 'E1',
      },
      sourceId: 'nist-asd-v5.10',
      retrievedAt: '2026-05-02',
    }
    const map = new Map<string, Primitive>([[p.id, p]])
    const anim = resolveSpectralLineAnimation(p, map)
    expect(anim?.kind).toBe('hydrogen-orbital-pair')
    if (anim?.kind !== 'hydrogen-orbital-pair') throw new Error('wrong kind')
    expect(anim.Z).toBe(2)
    expect(anim.upper).toEqual({ n: 2, l: 1, m: 0, label: '2p' })
    expect(anim.lower).toEqual({ n: 1, l: 0, m: 0, label: '1s' })
  })

  it('omegaFi falls back to 2π·c/λ when level energies absent', () => {
    const p: Primitive = {
      id: 'spectral-line.h.h-alpha',
      family: 'spectral-line',
      name: 'H Balmer α (n=3 → 2)',
      attrs: { wavelengthVacuumNm: 656.281, transitionType: 'E1' },
      sourceId: 'nist-asd-v5.10',
      retrievedAt: '2026-05-02',
    }
    const map = new Map<string, Primitive>([[p.id, p]])
    const anim = resolveSpectralLineAnimation(p, map)
    expect(anim?.kind).toBe('hydrogen-orbital-pair')
    const expected = (2 * Math.PI * 299_792_458 * 1e9) / 656.281
    expect(anim?.omegaFi).toBeCloseTo(expected, -8)
  })

  it('returns undefined for non-spectral-line primitives', () => {
    const p: Primitive = {
      id: 'element.h',
      family: 'element',
      name: 'H',
      attrs: { z: 1 },
      sourceId: 'nist-asd-v5.10',
      retrievedAt: '2026-05-02',
    }
    const map = new Map<string, Primitive>()
    expect(resolveSpectralLineAnimation(p, map)).toBeUndefined()
  })
})
