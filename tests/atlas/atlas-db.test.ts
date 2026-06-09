import { describe, expect, it } from 'vitest'
import type { Primitive } from '../../src/atlas/types'
import { buildAtlasSql, deriveNotation } from '../../tools/build-atlas-db'
import { loadAtlasSeeds } from '../../tools/atlas-seeds'

describe('atlas database generation', () => {
  it('keeps the T_d point-group symbol mechanically consistent', async () => {
    const seeds = await loadAtlasSeeds()
    const td = seeds.primitives.find((p) => p.id === 'symmetry-group.point.3d.t-d')
    expect(td?.symbol).toBe('T_d')
    expect(deriveNotation(td!).issue).toBeNull()
  })

  it('catches the prior T_d -> T_a notation regression', () => {
    const bad: Primitive = {
      id: 'symmetry-group.point.3d.t-d',
      family: 'symmetry-group',
      name: 'T_d (full tetrahedral)',
      symbol: 'Tₐ',
      attrs: { groupType: 'point', order: 24 },
      sourceId: 'itc-vol-a',
      retrievedAt: '2026-05-04',
    }

    expect(deriveNotation(bad).asciiSymbol).toBe('T_a')
    expect(deriveNotation(bad).issue).toContain("does not match")
  })

  it('groups compound point-group subscripts in generated TeX', () => {
    const c2v: Primitive = {
      id: 'symmetry-group.point.3d.c2v',
      family: 'symmetry-group',
      name: 'C_2v',
      symbol: 'C₂ᵥ',
      attrs: { groupType: 'point', order: 4 },
      sourceId: 'itc-vol-a',
      retrievedAt: '2026-05-04',
    }

    expect(deriveNotation(c2v).asciiSymbol).toBe('C_2_v')
    expect(deriveNotation(c2v).texSymbol).toBe('C_{2v}')
  })

  it('emits SQL for notation, claims, and family projections', async () => {
    const seeds = await loadAtlasSeeds()
    const { sqlText, validationRows } = buildAtlasSql('', seeds, '2026-05-05T00:00:00.000Z')

    expect(sqlText).toContain('INSERT INTO notation')
    expect(sqlText).toContain('INSERT INTO claim')
    expect(sqlText).toContain('INSERT INTO spectral_transition')
    expect(sqlText).toContain('INSERT INTO group_invariant')
    expect(validationRows.some((row) => row.checkName === 'notation.symbol_matches_name')).toBe(
      true,
    )
  })
})
