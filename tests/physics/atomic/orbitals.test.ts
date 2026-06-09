/**
 * Hydrogenic orbital catalog metadata tests.
 */

import { describe, expect, it } from 'vitest'
import {
  ORBITAL_CATALOG,
  getOrbital,
  getShell,
  getSubshell,
  listOrbitals,
  representativeE1BranchesForBareHydrogenTransition,
  shellLabelForN,
  subshellLetterForL,
} from '../../../src/physics/atomic'

describe('orbital catalog', () => {
  it('covers every real hydrogenic orbital through n <= 7', () => {
    expect(ORBITAL_CATALOG).toHaveLength(7)
    expect(listOrbitals()).toHaveLength(140)
    expect(getShell(7)).toMatchObject({
      n: 7,
      label: 'Q',
      orbitalCount: 49,
      electronCapacity: 98,
    })
  })

  it('exposes shell and subshell labels', () => {
    expect(shellLabelForN(1)).toBe('K')
    expect(shellLabelForN(4)).toBe('N')
    expect(shellLabelForN(8)).toBeNull()

    expect(subshellLetterForL(0)).toBe('s')
    expect(subshellLetterForL(6)).toBe('i')
    expect(subshellLetterForL(7)).toBeNull()

    expect(getSubshell(3, 2)).toMatchObject({
      label: '3d',
      shellLabel: 'M',
      letter: 'd',
      magneticMValues: [-2, -1, 0, 1, 2],
    })
  })

  it('uses conventional real names for s, p, d, and f orbitals', () => {
    expect(listOrbitals({ n: 2, l: 1 }).map((orbital) => [orbital.name, orbital.m])).toEqual([
      ['px', 1],
      ['py', -1],
      ['pz', 0],
    ])

    expect(listOrbitals({ n: 3, l: 2 }).map((orbital) => orbital.name)).toEqual([
      'dxy',
      'dyz',
      'dz2',
      'dxz',
      'dx2-y2',
    ])

    expect(listOrbitals({ n: 4, l: 3 }).map((orbital) => orbital.name)).toEqual([
      'fy(3x2-y2)',
      'fxyz',
      'fyz2',
      'fz3',
      'fxz2',
      'fz(x2-y2)',
      'fx(x2-3y2)',
    ])
  })

  it('uses systematic m-labeled names for g, h, and i orbitals', () => {
    expect(getOrbital(5, 4, -4)).toMatchObject({
      label: '5g_m-4',
      name: 'g_m-4',
      m: -4,
    })

    expect(getOrbital(7, 6, 6)).toMatchObject({
      label: '7i_m+6',
      name: 'i_m+6',
      m: 6,
    })
  })

  it('reports radial, angular, and total node counts', () => {
    expect(getOrbital(5, 0, 0)).toMatchObject({
      radialNodes: 4,
      angularNodes: 0,
      totalNodes: 4,
    })

    expect(getOrbital(7, 6, 0)).toMatchObject({
      radialNodes: 0,
      angularNodes: 6,
      totalNodes: 6,
    })
  })
})

describe('representative E1 branches for bare hydrogen lines', () => {
  it('expands n=3 -> 2 into allowed subshell branches without s -> s', () => {
    const branches = representativeE1BranchesForBareHydrogenTransition(3, 2)

    expect(branches.map((branch) => branch.label)).toEqual(['3s -> 2p', '3p -> 2s', '3d -> 2p'])
    expect(branches.map((branch) => branch.label)).not.toContain('3s -> 2s')
    expect(branches.find((branch) => branch.label === '3p -> 2s')).toMatchObject({
      deltaL: 1,
      representativeUpper: { name: 'pz', m: 0 },
      representativeLower: { name: 's', m: 0 },
    })
  })

  it('respects valid subshell ranges for larger shells', () => {
    expect(
      representativeE1BranchesForBareHydrogenTransition(5, 3).map((branch) => branch.label),
    ).toEqual(['5s -> 3p', '5p -> 3s', '5p -> 3d', '5d -> 3p', '5f -> 3d'])
  })

  it('returns no branches for unsupported or same-n requests', () => {
    expect(representativeE1BranchesForBareHydrogenTransition(8, 1)).toEqual([])
    expect(representativeE1BranchesForBareHydrogenTransition(3, 3)).toEqual([])
  })
})
