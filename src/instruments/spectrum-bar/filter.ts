/**
 * Element-pill filter logic.
 *
 * Pills are: H, He, Na, Hg, Ne (the primary atomic registry) and `survey`
 * (a single collective pill that gates every line whose element falls outside
 * the primary five — these come from `surveyLines`).
 *
 * Pure: callers own the active set and pass it in.
 */

import type { EmissionLine, ElementSymbol } from '../../data/types'

export type PillId = 'H' | 'He' | 'Na' | 'Hg' | 'Ne' | 'survey'

export const PILLS: readonly PillId[] = ['H', 'He', 'Na', 'Hg', 'Ne', 'survey']

const PRIMARY: ReadonlySet<ElementSymbol> = new Set(['H', 'He', 'Na', 'Hg', 'Ne'])

/** Pill that gates a given line. Returns 'survey' for everything not in the primary five. */
export function pillForLine(line: EmissionLine): PillId {
  if (PRIMARY.has(line.element)) return line.element as PillId
  return 'survey'
}

/** Filter lines down to those whose pill is currently active. */
export function visibleLines(
  lines: readonly EmissionLine[],
  active: ReadonlySet<PillId>,
): readonly EmissionLine[] {
  return lines.filter((l) => active.has(pillForLine(l)))
}

/** Toggle a single pill in an active-set. Returns a new set. */
export function togglePill(active: ReadonlySet<PillId>, pill: PillId): ReadonlySet<PillId> {
  const next = new Set(active)
  if (next.has(pill)) next.delete(pill)
  else next.add(pill)
  return next
}

/** Default state: all pills active. */
export function allPillsActive(): ReadonlySet<PillId> {
  return new Set(PILLS)
}
