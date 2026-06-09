/**
 * Cultural-context coverage smoke test — at least 15 lines should carry a
 * `culturalContext` string so the Cockpit + Spectrum Bar tooltips have a
 * meaningful pedagogy payload across the EM spectrum.
 */

import { describe, expect, it } from 'vitest'
import { allLines } from '../../src/data'

describe('Cultural context coverage', () => {
  it('at least 15 lines carry a non-empty culturalContext', () => {
    const withContext = allLines.filter(
      (line) => typeof line.culturalContext === 'string' && line.culturalContext.length > 0,
    )
    expect(withContext.length).toBeGreaterThanOrEqual(15)
  })
})
