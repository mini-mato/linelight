/**
 * State-machine smoke tests for the v4 app shell.
 *
 * Builds a synthetic seed-shape resembling sections.json output and
 * walks the reducer through navigation events to confirm boundary
 * behavior (section roll-over, flip, title/closing edges).
 */

import { describe, it, expect } from 'vitest'

import { initialState, reduce, flattenSections, type AppState } from '../../src/atlas-app/state.js'
import type { AppSeed } from '../../src/atlas-app/seed.js'

const SEED: AppSeed = {
  schemaVersion: '4.0-alpha',
  generatedAt: '2026-05-04',
  gitRev: 'test',
  title: 'tt',
  subtitle: 'tt',
  intro: 'tt',
  acts: [
    {
      actNumber: 1,
      title: 'Act one',
      subtitle: '',
      intro: '',
      families: [
        {
          family: 'element',
          sectionNumber: 1,
          title: 'Elements',
          intro: '',
          cardIds: ['a1', 'a2'],
        },
        {
          family: 'spectral-line',
          sectionNumber: 2,
          title: 'Spectral lines',
          intro: '',
          cardIds: ['b1', 'b2', 'b3'],
        },
      ],
    },
    {
      actNumber: 2,
      title: 'Act two',
      subtitle: '',
      intro: '',
      families: [
        {
          family: 'energy-level',
          sectionNumber: 3,
          title: 'Levels',
          intro: '',
          cardIds: ['c1'],
        },
      ],
    },
  ],
  cards: {
    a1: stubCard('a1'),
    a2: stubCard('a2'),
    b1: stubCard('b1'),
    b2: stubCard('b2'),
    b3: stubCard('b3'),
    c1: stubCard('c1'),
  },
}

function stubCard(id: string) {
  return {
    id,
    family: 'element' as const,
    name: id,
    frontSvg: '',
    backSvg: '',
    sectionNumber: 1,
    actNumber: 1,
  }
}

const sections = flattenSections(SEED)

describe('atlas-app state', () => {
  it('initial state is title', () => {
    expect(initialState().view).toBe('title')
  })

  it('next-card from title enters first card', () => {
    const s0 = initialState()
    const r = reduce(s0, { type: 'next-card' }, sections)
    expect(r.next.view).toBe('card')
    expect(r.next.sectionIndex).toBe(0)
    expect(r.next.cardIndex).toBe(0)
  })

  it('next-card past end of section rolls to next section', () => {
    const s0: AppState = {
      view: 'card',
      sectionIndex: 0,
      cardIndex: 1, // last card of section 0 (which has [a1,a2])
      mode: 'front',
      animTick: 0,
      paused: false,
    }
    const r = reduce(s0, { type: 'next-card' }, sections)
    expect(r.next.sectionIndex).toBe(1)
    expect(r.next.cardIndex).toBe(0)
    expect(r.transition).toBe('cross-section')
  })

  it('cross-act transition flagged when act number changes', () => {
    const s0: AppState = {
      view: 'card',
      sectionIndex: 1, // last family of act 1
      cardIndex: 2, // last card of section
      mode: 'front',
      animTick: 0,
      paused: false,
    }
    const r = reduce(s0, { type: 'next-card' }, sections)
    expect(r.next.sectionIndex).toBe(2)
    expect(r.transition).toBe('cross-act')
  })

  it('flip toggles mode', () => {
    const s0: AppState = {
      view: 'card',
      sectionIndex: 0,
      cardIndex: 0,
      mode: 'front',
      animTick: 0,
      paused: false,
    }
    const r1 = reduce(s0, { type: 'flip' }, sections)
    expect(r1.next.mode).toBe('back')
    expect(r1.transition).toBe('flip-up')
    const r2 = reduce(r1.next, { type: 'flip' }, sections)
    expect(r2.next.mode).toBe('front')
    expect(r2.transition).toBe('flip-down')
  })

  it('to-title from any view returns to title', () => {
    const s0: AppState = {
      view: 'card',
      sectionIndex: 2,
      cardIndex: 0,
      mode: 'back',
      animTick: 7,
      paused: true,
    }
    const r = reduce(s0, { type: 'to-title' }, sections)
    expect(r.next.view).toBe('title')
    expect(r.next.mode).toBe('front')
  })

  it('jump clamps card index', () => {
    const s0 = initialState()
    const r = reduce(s0, { type: 'jump', sectionIndex: 2, cardIndex: 99 }, sections)
    expect(r.next.sectionIndex).toBe(2)
    expect(r.next.cardIndex).toBe(0) // section c has just one card
  })

  it('toggle-pause flips paused', () => {
    const s0 = initialState()
    const r = reduce(s0, { type: 'toggle-pause' }, sections)
    expect(r.next.paused).toBe(true)
  })

  it('next-section from last section goes to closing', () => {
    const s0: AppState = {
      view: 'card',
      sectionIndex: 2,
      cardIndex: 0,
      mode: 'front',
      animTick: 0,
      paused: false,
    }
    const r = reduce(s0, { type: 'next-section' }, sections)
    expect(r.next.view).toBe('closing')
  })

  it('prev-section from first section returns to title', () => {
    const s0: AppState = {
      view: 'card',
      sectionIndex: 0,
      cardIndex: 0,
      mode: 'front',
      animTick: 0,
      paused: false,
    }
    const r = reduce(s0, { type: 'prev-section' }, sections)
    expect(r.next.view).toBe('title')
  })
})
