/**
 * Provenance contract — every line in `allLines` must carry `source` and a
 * valid ISO-8601 `retrievedAt` date. This guards against silent regressions
 * when new data is added without attribution (spec §5).
 */

import { describe, expect, it } from 'vitest'
import { allLines } from '../../src/data'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

describe('Data provenance — every line carries source + retrievedAt', () => {
  it('every line has a non-empty source', () => {
    for (const line of allLines) {
      expect(line.source, `line ${line.element} ${line.label} missing source`).toBeTruthy()
    }
  })

  it('every line has a valid ISO-8601 retrievedAt date', () => {
    for (const line of allLines) {
      expect(
        line.retrievedAt,
        `line ${line.element} ${line.label} missing retrievedAt`,
      ).toBeTruthy()
      expect(line.retrievedAt!).toMatch(ISO_DATE)
      // Confirm it parses as a real calendar date.
      const parsed = new Date(line.retrievedAt!)
      expect(Number.isNaN(parsed.getTime())).toBe(false)
    }
  })
})
