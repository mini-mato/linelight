/**
 * URL-hash router for the atlas-app.
 *
 * Mirrors AppState into `location.hash` so the URL is shareable and the
 * browser back/forward buttons advance through navigation history.
 *
 * Hash grammar:
 *
 *   ''                                  → title
 *   '#title'                            → title
 *   '#closing'                          → closing
 *   '#act-{actN}/{cardId}/{mode}'       → card; we resolve sectionIndex
 *                                          from the cardId
 *   '#sec-{sectionN}'                   → first card of that section
 *   '#sec-{sectionN}/{cardId}/{mode}'   → explicit
 *
 * Unknown / malformed hashes degrade to title.
 */

import type { AppSeed } from './seed.js'
import { flattenSections, type AppState } from './state.js'

export function stateToHash(state: AppState, seed: AppSeed): string {
  if (state.view === 'title') return '#title'
  if (state.view === 'closing') return '#closing'
  const sections = flattenSections(seed)
  const section = sections[state.sectionIndex]
  if (!section) return '#title'
  const cardId = section.cardIds[state.cardIndex]
  return `#act-${section.actNumber}/${section.family}/${encodeURIComponent(cardId)}/${state.mode}`
}

export function hashToState(hash: string, seed: AppSeed): Partial<AppState> {
  const sections = flattenSections(seed)
  const raw = hash.replace(/^#/, '').trim()
  if (raw === '' || raw === 'title') {
    return { view: 'title', sectionIndex: 0, cardIndex: 0, mode: 'front' }
  }
  if (raw === 'closing') {
    return { view: 'closing', mode: 'front' }
  }

  // #act-N/family/cardId/mode
  const actMatch = raw.match(/^act-(\d+)\/([^/]+)\/([^/]+)\/(front|back)$/)
  if (actMatch) {
    const cardId = decodeURIComponent(actMatch[3])
    const found = locateCard(sections, cardId)
    if (found) {
      return {
        view: 'card',
        sectionIndex: found.sectionIndex,
        cardIndex: found.cardIndex,
        mode: actMatch[4] as 'front' | 'back',
      }
    }
  }
  // #sec-N
  const secMatch = raw.match(/^sec-(\d+)$/)
  if (secMatch) {
    const sn = parseInt(secMatch[1], 10)
    const idx = sections.findIndex((s) => s.sectionNumber === sn)
    if (idx >= 0) {
      return { view: 'card', sectionIndex: idx, cardIndex: 0, mode: 'front' }
    }
  }

  return { view: 'title' }
}

function locateCard(
  sections: ReturnType<typeof flattenSections>,
  cardId: string,
): { sectionIndex: number; cardIndex: number } | undefined {
  for (let s = 0; s < sections.length; s++) {
    const idx = sections[s].cardIds.indexOf(cardId)
    if (idx >= 0) return { sectionIndex: s, cardIndex: idx }
  }
  return undefined
}
