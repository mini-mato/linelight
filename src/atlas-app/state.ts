/**
 * App state machine.
 *
 * State = { sectionIndex, cardIndex, mode, animTick, view }
 *
 * `view` is one of:
 *   - 'title'    — landing page (Esc/End)
 *   - 'card'     — a specific (section, card) pair, front or back
 *   - 'closing'  — End / past-last-card
 *
 * Transitions are pure (state, event) → state. No DOM in here.
 *
 *           ┌─────────┐
 *           │  title  │
 *           └────┬────┘
 *      Enter│    │Tab/→
 *           ▼    ▼
 *        ┌──────────┐ next →     ┌──────────┐
 *        │  card    │──────────▶│  card+1  │
 *        │  (front) │ ↑↓ flip   └──────────┘
 *        └────┬─────┘
 *             │↓ flip
 *             ▼
 *        ┌──────────┐
 *        │  card    │
 *        │  (back)  │
 *        └──────────┘
 *
 * Cross-section transitions: when `cardIndex` rolls off the end of a
 * family, jump to `sectionIndex+1, cardIndex=0`. Cross-act transitions
 * are computed on the fly from the seed's act/section mapping.
 */

import type { AppSeed } from './seed.js'

export type View = 'title' | 'card' | 'closing'
export type Mode = 'front' | 'back'

export type AppState = {
  view: View
  /** 0-based index into `seed.acts[..].families` (flattened across acts). */
  sectionIndex: number
  /** 0-based index into the section's `cardIds`. */
  cardIndex: number
  mode: Mode
  /** Monotonic counter advanced by the 4D animation loop; UI uses for cache-bust. */
  animTick: number
  /** True while paused (spacebar toggles). Drives the spectral-line animation. */
  paused: boolean
}

/** Initial state on page load. */
export function initialState(): AppState {
  return {
    view: 'title',
    sectionIndex: 0,
    cardIndex: 0,
    mode: 'front',
    animTick: 0,
    paused: false,
  }
}

/** Flatten seed.acts[*].families into a single ordered array. */
export function flattenSections(seed: AppSeed): {
  family: string
  sectionNumber: number
  actNumber: number
  cardIds: string[]
  title: string
  intro: string
}[] {
  const out: ReturnType<typeof flattenSections> = []
  for (const act of seed.acts) {
    for (const fs of act.families) {
      out.push({
        family: fs.family,
        sectionNumber: fs.sectionNumber,
        actNumber: act.actNumber,
        cardIds: fs.cardIds,
        title: fs.title,
        intro: fs.intro,
      })
    }
  }
  return out
}

export type Event =
  | { type: 'next-card' }
  | { type: 'prev-card' }
  | { type: 'flip' }
  | { type: 'next-section' }
  | { type: 'prev-section' }
  | { type: 'jump'; sectionIndex: number; cardIndex?: number }
  | { type: 'to-title' }
  | { type: 'to-closing' }
  | { type: 'toggle-pause' }
  | { type: 'set-from-hash'; partial: Partial<AppState> }

export type StateTransition = {
  next: AppState
  /** What kind of visual transition the renderer should run. */
  transition:
    | 'none'
    | 'slide-right' // newer card slides in from right
    | 'slide-left' // newer card slides in from left
    | 'flip-up' // back card slides up
    | 'flip-down' // front card slides down
    | 'cross-act' // longer, with act-title overlay
    | 'cross-section'
    | 'fade'
}

export function reduce(
  state: AppState,
  event: Event,
  sections: ReturnType<typeof flattenSections>,
): StateTransition {
  switch (event.type) {
    case 'next-card':
      return advanceCard(state, sections, +1)
    case 'prev-card':
      return advanceCard(state, sections, -1)
    case 'flip':
      return flipMode(state)
    case 'next-section':
      return advanceSection(state, sections, +1)
    case 'prev-section':
      return advanceSection(state, sections, -1)
    case 'jump':
      return jumpTo(state, sections, event.sectionIndex, event.cardIndex ?? 0)
    case 'to-title':
      return { next: { ...state, view: 'title', mode: 'front', paused: false }, transition: 'fade' }
    case 'to-closing':
      return {
        next: { ...state, view: 'closing', mode: 'front', paused: false },
        transition: 'fade',
      }
    case 'toggle-pause':
      return { next: { ...state, paused: !state.paused }, transition: 'none' }
    case 'set-from-hash': {
      const next: AppState = { ...state, ...event.partial }
      // Clamp.
      next.sectionIndex = clamp(next.sectionIndex, 0, sections.length - 1)
      const cardCount = sections[next.sectionIndex]?.cardIds.length ?? 1
      next.cardIndex = clamp(next.cardIndex, 0, cardCount - 1)
      return { next, transition: 'fade' }
    }
  }
}

function advanceCard(
  state: AppState,
  sections: ReturnType<typeof flattenSections>,
  delta: number,
): StateTransition {
  if (state.view === 'title') {
    if (delta > 0) {
      return {
        next: { ...state, view: 'card', sectionIndex: 0, cardIndex: 0, mode: 'front' },
        transition: 'fade',
      }
    }
    return { next: state, transition: 'none' }
  }
  if (state.view === 'closing') {
    if (delta < 0) {
      const last = sections.length - 1
      const cardCount = sections[last]?.cardIds.length ?? 1
      return {
        next: {
          ...state,
          view: 'card',
          sectionIndex: last,
          cardIndex: cardCount - 1,
          mode: 'front',
        },
        transition: 'slide-left',
      }
    }
    return { next: state, transition: 'none' }
  }
  // view === 'card'
  const section = sections[state.sectionIndex]
  if (!section) return { next: state, transition: 'none' }
  const nextCardIndex = state.cardIndex + delta
  if (nextCardIndex >= 0 && nextCardIndex < section.cardIds.length) {
    return {
      next: { ...state, cardIndex: nextCardIndex, mode: 'front' },
      transition: delta > 0 ? 'slide-right' : 'slide-left',
    }
  }
  // Section boundary: roll into neighbouring section.
  return advanceSection(state, sections, delta)
}

function advanceSection(
  state: AppState,
  sections: ReturnType<typeof flattenSections>,
  delta: number,
): StateTransition {
  if (state.view === 'title') {
    if (delta > 0) {
      return {
        next: { ...state, view: 'card', sectionIndex: 0, cardIndex: 0, mode: 'front' },
        transition: 'fade',
      }
    }
    return { next: state, transition: 'none' }
  }
  const currAct = sections[state.sectionIndex]?.actNumber
  const nextSection = state.sectionIndex + delta
  if (nextSection < 0) {
    return { next: { ...state, view: 'title', mode: 'front' }, transition: 'fade' }
  }
  if (nextSection >= sections.length) {
    return { next: { ...state, view: 'closing', mode: 'front' }, transition: 'fade' }
  }
  const nextAct = sections[nextSection].actNumber
  const transition: StateTransition['transition'] =
    currAct !== undefined && nextAct !== currAct ? 'cross-act' : 'cross-section'
  return {
    next: {
      ...state,
      view: 'card',
      sectionIndex: nextSection,
      cardIndex: delta > 0 ? 0 : sections[nextSection].cardIds.length - 1,
      mode: 'front',
    },
    transition,
  }
}

function flipMode(state: AppState): StateTransition {
  if (state.view !== 'card') return { next: state, transition: 'none' }
  const isFlippingToBack = state.mode === 'front'
  return {
    next: { ...state, mode: isFlippingToBack ? 'back' : 'front' },
    transition: isFlippingToBack ? 'flip-up' : 'flip-down',
  }
}

function jumpTo(
  state: AppState,
  sections: ReturnType<typeof flattenSections>,
  sectionIndex: number,
  cardIndex: number,
): StateTransition {
  if (sectionIndex < 0 || sectionIndex >= sections.length) {
    return { next: state, transition: 'none' }
  }
  const section = sections[sectionIndex]
  const clampedCardIndex = clamp(cardIndex, 0, section.cardIds.length - 1)
  const currAct = sections[state.sectionIndex]?.actNumber
  const nextAct = section.actNumber
  const transition: StateTransition['transition'] =
    state.view !== 'card' || currAct !== nextAct ? 'cross-act' : 'cross-section'
  return {
    next: {
      ...state,
      view: 'card',
      sectionIndex,
      cardIndex: clampedCardIndex,
      mode: 'front',
    },
    transition,
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  if (hi < lo) return lo
  return Math.max(lo, Math.min(hi, n))
}
