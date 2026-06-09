/**
 * linelight atlas v4-α — app entry.
 *
 * Boots the app: fetches seed.json (sibling file), mounts the view,
 * wires keyboard + ToC + bottom-bar handlers, syncs URL hash.
 */

import './style.css'

import type { AppSeed } from './seed.js'
import { initialState, reduce, flattenSections, type AppState, type Event } from './state.js'
import { hashToState, stateToHash } from './router.js'
import { mountView } from './view.js'

async function boot(): Promise<void> {
  const root = document.getElementById('root')
  if (!root) {
    console.error('atlas-app: #root not found')
    return
  }

  let seed: AppSeed
  try {
    const resp = await fetch('./seed.json', { cache: 'no-cache' })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    seed = (await resp.json()) as AppSeed
  } catch (err) {
    root.innerHTML = `<div style="padding:24px;font-family:ui-monospace,monospace;color:#a23">atlas-app: failed to load seed.json (${escapeHtml(String((err as Error).message ?? err))})</div>`
    return
  }

  const sections = flattenSections(seed)
  const view = mountView(root, seed)

  let state: AppState = initialState()
  // Try to restore from URL hash first.
  const fromHash = hashToState(location.hash, seed)
  const restored = reduce(state, { type: 'set-from-hash', partial: fromHash }, sections)
  state = restored.next
  view.render(state, 'fade')
  syncHash(state)

  function dispatch(event: Event): void {
    const r = reduce(state, event, sections)
    if (r.next === state && r.transition === 'none') return
    state = r.next
    view.render(state, r.transition)
    syncHash(state)
  }

  function syncHash(s: AppState): void {
    const hash = stateToHash(s, seed)
    if (hash !== location.hash) {
      // Use replaceState to avoid stuffing the history stack with
      // every flip; back-button still steps through major navigation
      // events via popstate-on-hashchange.
      history.replaceState(null, '', hash)
    }
  }

  // --- Keyboard ---------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        dispatch({ type: 'next-card' })
        break
      case 'ArrowLeft':
        e.preventDefault()
        dispatch({ type: 'prev-card' })
        break
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault()
        dispatch({ type: 'flip' })
        break
      case 'Tab':
        e.preventDefault()
        if (e.shiftKey) dispatch({ type: 'prev-section' })
        else dispatch({ type: 'next-section' })
        break
      case 'Escape':
        e.preventDefault()
        dispatch({ type: 'to-title' })
        break
      case 'End':
        e.preventDefault()
        dispatch({ type: 'to-closing' })
        break
      case 'Home':
        e.preventDefault()
        dispatch({ type: 'to-title' })
        break
      case ' ':
      case 'Spacebar':
        e.preventDefault()
        // Pause is meaningful only on a live animation; we still dispatch
        // unconditionally — non-anim cards just toggle a paused flag we
        // never read. If the user is on a non-anim card and presses
        // space we additionally advance to the next card, matching the
        // spec's "Space → next" UX. We sequence it so the pause toggle
        // happens first, then on non-anim cards we also advance.
        {
          const onAnim = isOnSpectralBack(state, seed)
          if (onAnim) {
            dispatch({ type: 'toggle-pause' })
          } else {
            dispatch({ type: 'next-card' })
          }
        }
        break
    }
  })

  // --- ToC clicks -------------------------------------------------------
  view.tocEl.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('.toc-family') as HTMLElement | null
    if (!target) return
    const sec = parseInt(target.dataset.section ?? '', 10)
    if (!Number.isFinite(sec)) return
    const idx = sections.findIndex((s) => s.sectionNumber === sec)
    if (idx < 0) return
    dispatch({ type: 'jump', sectionIndex: idx, cardIndex: 0 })
  })

  // --- Bottom-bar buttons ----------------------------------------------
  view.bottomEl.addEventListener('click', (e) => {
    const action = (e.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action')
    switch (action) {
      case 'next':
        dispatch({ type: 'next-card' })
        break
      case 'prev':
        dispatch({ type: 'prev-card' })
        break
      case 'flip':
        dispatch({ type: 'flip' })
        break
    }
  })

  // --- Hash sync from back/forward -------------------------------------
  window.addEventListener('hashchange', () => {
    const partial = hashToState(location.hash, seed)
    dispatch({ type: 'set-from-hash', partial })
  })
}

function isOnSpectralBack(state: AppState, seed: AppSeed): boolean {
  if (state.view !== 'card' || state.mode !== 'back') return false
  const sections = flattenSections(seed)
  const cardId = sections[state.sectionIndex]?.cardIds[state.cardIndex]
  if (!cardId) return false
  const card = seed.cards[cardId]
  return !!card?.animation
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

boot().catch((err) => {
  console.error('atlas-app boot failed:', err)
})
