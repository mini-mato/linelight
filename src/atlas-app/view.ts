/**
 * View layer — owns the DOM. Re-renders on every state change.
 *
 * Kept deliberately simple: each top-level region (topbar, toc, stage,
 * bottombar) is created once on mount; the stage's card-frame is
 * recycled across navigation events. Transitions are CSS animations
 * triggered by toggling a class name on the frame.
 *
 * No virtual DOM. The card-frame's innerHTML is replaced wholesale
 * when the card changes — total per-update cost is roughly one
 * mid-size SVG string + one ~360x240 canvas reinitialisation.
 */

import type { AppSeed } from './seed.js'
import { flattenSections, type AppState, type StateTransition } from './state.js'
import { mountSpectralAnim, type SpectralAnimHandle } from './spectral-anim.js'

export type ViewHandles = {
  /** Re-render given the latest state + transition kind. */
  render: (state: AppState, tx: StateTransition['transition']) => void
  /** Container references the keyboard handler / ToC clicker reads. */
  tocEl: HTMLElement
  bottomEl: HTMLElement
  stageEl: HTMLElement
}

export function mountView(root: HTMLElement, seed: AppSeed): ViewHandles {
  root.innerHTML = ''

  const topbar = document.createElement('header')
  topbar.className = 'app-topbar'
  topbar.innerHTML = `
    <div class="breadcrumb">
      <span class="act-label" data-region="act-label"></span>
      <span class="section-num" data-region="section-num"></span>
      <span class="section-title" data-region="section-title"></span>
    </div>
    <div class="spacer"></div>
    <div class="help">← → next/prev · ↑↓ flip · Tab next section · Esc title</div>
  `
  root.appendChild(topbar)

  const toc = document.createElement('aside')
  toc.className = 'app-toc'
  toc.innerHTML = renderToc(seed)
  root.appendChild(toc)

  const stage = document.createElement('main')
  stage.className = 'app-stage'
  root.appendChild(stage)

  const bottom = document.createElement('footer')
  bottom.className = 'app-bottombar'
  bottom.innerHTML = `
    <button data-action="prev" title="Previous (←)">◂</button>
    <button data-action="flip" title="Flip (↑↓)">⇕</button>
    <span class="position" data-region="position"></span>
    <button data-action="next" title="Next (→)">▸</button>
  `
  root.appendChild(bottom)

  const sections = flattenSections(seed)

  // Animation handle scoped to the current card. Disposed when we
  // navigate away from a spectral-line back card.
  let animHandle: SpectralAnimHandle | undefined
  let activeKey = ''

  function isActive(key: string): () => boolean {
    return () => activeKey === key
  }

  function render(state: AppState, tx: StateTransition['transition']): void {
    // Top bar
    const actLabelEl = topbar.querySelector<HTMLElement>('[data-region="act-label"]')!
    const secNumEl = topbar.querySelector<HTMLElement>('[data-region="section-num"]')!
    const secTitleEl = topbar.querySelector<HTMLElement>('[data-region="section-title"]')!
    if (state.view === 'card') {
      const section = sections[state.sectionIndex]
      actLabelEl.textContent = `Act ${section.actNumber} / `
      secNumEl.textContent = `${section.sectionNumber}.`
      secTitleEl.textContent = section.title
    } else if (state.view === 'title') {
      actLabelEl.textContent = ''
      secNumEl.textContent = ''
      secTitleEl.textContent = seed.title
    } else {
      actLabelEl.textContent = ''
      secNumEl.textContent = ''
      secTitleEl.textContent = 'Closing'
    }

    // ToC active highlight.
    const tocFamilies = toc.querySelectorAll<HTMLElement>('.toc-family')
    tocFamilies.forEach((el) => el.classList.remove('active'))
    if (state.view === 'card') {
      const section = sections[state.sectionIndex]
      const want = `family-${section.family}-${section.sectionNumber}`
      const active = toc.querySelector<HTMLElement>(`[data-toc-key="${want}"]`)
      if (active) active.classList.add('active')
    }

    // Position
    const positionEl = bottom.querySelector<HTMLElement>('[data-region="position"]')!
    if (state.view === 'card') {
      const section = sections[state.sectionIndex]
      positionEl.textContent = `${state.cardIndex + 1} / ${section.cardIds.length}`
    } else {
      positionEl.textContent = ''
    }

    // Stage
    const prevActOverlay = stage.querySelector('.act-overlay')
    if (prevActOverlay) prevActOverlay.remove()

    // Dispose the existing animation if any.
    if (animHandle) {
      animHandle.dispose()
      animHandle = undefined
    }

    stage.innerHTML = ''

    if (tx === 'cross-act' && state.view === 'card') {
      const overlay = document.createElement('div')
      overlay.className = 'act-overlay'
      const section = sections[state.sectionIndex]
      overlay.innerHTML = `<div class="eyebrow">Act ${section.actNumber}</div><h2>${escapeHtml(actTitle(seed, section.actNumber))}</h2>`
      stage.appendChild(overlay)
      // Auto-cleanup after the animation ends.
      setTimeout(() => overlay.remove(), 620)
    }

    if (state.view === 'title') {
      const titleEl = document.createElement('div')
      titleEl.className = 'card-frame title-page tx-fade-in'
      titleEl.innerHTML = `
        <h1>${escapeHtml(seed.title)}</h1>
        <div class="subtitle">${escapeHtml(seed.subtitle)}</div>
        <div class="intro">${escapeHtml(seed.intro)}</div>
        <div class="cta">press → or Tab to begin</div>
      `
      stage.appendChild(titleEl)
      return
    }
    if (state.view === 'closing') {
      const titleEl = document.createElement('div')
      titleEl.className = 'card-frame closing-page tx-fade-in'
      titleEl.innerHTML = `
        <h2>${escapeHtml(seed.closing?.title ?? "What you've seen")}</h2>
        <div class="intro">${escapeHtml(seed.closing?.intro ?? '')}</div>
      `
      stage.appendChild(titleEl)
      return
    }

    // view === 'card'
    const section = sections[state.sectionIndex]
    const cardId = section.cardIds[state.cardIndex]
    const card = seed.cards[cardId]
    if (!card) {
      stage.textContent = `card missing: ${cardId}`
      return
    }

    const frame = document.createElement('div')
    frame.className = `card-frame mode-${state.mode} ${transitionClass(tx)}`
    frame.dataset.cardId = card.id

    const front = document.createElement('div')
    front.className = 'card-face face-front'
    front.innerHTML = card.frontSvg
    frame.appendChild(front)

    const back = document.createElement('div')
    back.className = 'card-face face-back'
    if (state.mode === 'back' && card.family === 'spectral-line' && card.animation) {
      // Replace the static back family-block with a live animation.
      // We still render the back SVG so the title, descriptor, source
      // line and band-strip are kept; the animation is appended below.
      back.innerHTML = card.backSvg
      const animContainer = document.createElement('div')
      animContainer.className = 'spectral-anim-container'
      back.appendChild(animContainer)
      activeKey = `${cardId}-back-${state.animTick}`
      animHandle = mountSpectralAnim(animContainer, card.animation, isActive(activeKey))
      animHandle.setPaused(state.paused)
    } else {
      back.innerHTML = card.backSvg
    }
    frame.appendChild(back)

    // Card meta line (id + source) — small and outside the SVG so we
    // can keep the SVG renderer untouched.
    const meta = document.createElement('div')
    meta.className = 'face-meta'
    meta.innerHTML = `<span>${escapeHtml(card.id)}</span><span>${escapeHtml(card.sourceLabel ?? '')}</span>`
    frame.appendChild(meta)

    stage.appendChild(frame)
  }

  return { render, tocEl: toc, bottomEl: bottom, stageEl: stage }
}

function transitionClass(tx: StateTransition['transition']): string {
  switch (tx) {
    case 'slide-right':
      return 'tx-slide-right-in'
    case 'slide-left':
      return 'tx-slide-left-in'
    case 'flip-up':
      return 'tx-flip-up-in'
    case 'flip-down':
      return 'tx-flip-down-in'
    case 'cross-act':
      return 'tx-cross-act-in'
    case 'cross-section':
      return 'tx-slide-right-in'
    case 'fade':
      return 'tx-fade-in'
    case 'none':
    default:
      return ''
  }
}

function actTitle(seed: AppSeed, actNumber: number): string {
  return seed.acts.find((a) => a.actNumber === actNumber)?.title ?? ''
}

function renderToc(seed: AppSeed): string {
  const items: string[] = ['<h3>Contents</h3>', '<ol>']
  for (const act of seed.acts) {
    items.push(`<li class="toc-act">Act ${act.actNumber}. ${escapeHtml(act.title)}</li>`)
    for (const fs of act.families) {
      items.push(
        `<li class="toc-family" data-toc-key="family-${fs.family}-${fs.sectionNumber}" data-section="${fs.sectionNumber}">${fs.sectionNumber}. ${escapeHtml(fs.title)}</li>`,
      )
    }
  }
  items.push('</ol>')
  return items.join('')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
