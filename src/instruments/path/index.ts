/**
 * Path — the proof-chain instrument.
 *
 * The single-stage front door of linelight. A 12-step derivation that walks
 * the learner from "Coulomb attracts a charge" through "spectral lines are
 * poles of the propagator" — one morphing Three.js stage the whole time.
 *
 * The five legacy instruments (atom-view, grotrian, spectrum-bar, cockpit,
 * propagator-view) survive in a "lab bench" section below this — wired by
 * `main.ts` — so anyone can free-explore after the derivation.
 */

import type { Store } from '../../store'
import type { PathStepIndex } from '../../types'
import { PATH_STEP_COUNT } from '../../types'
import { createStage } from './stage'
import { STEPS } from './steps'

function clampStep(n: number): PathStepIndex {
  const i = Math.max(0, Math.min(PATH_STEP_COUNT - 1, Math.round(n)))
  return i as PathStepIndex
}

const DOT_BASE = [
  'width: 26px',
  'height: 26px',
  'border-radius: 50%',
  'border: 1px solid #c0c0c0',
  'background: #fff',
  'color: #888',
  "font-family: 'JetBrains Mono', monospace",
  'font-size: 10px',
  'cursor: pointer',
  'display: flex',
  'align-items: center',
  'justify-content: center',
  'padding: 0',
  'flex: 0 0 auto',
  'transition: transform 0.12s ease',
].join(';')

const CHEVRON_BASE = [
  "font-family: 'JetBrains Mono', monospace",
  'font-size: 11px',
  'padding: 4px 10px',
  'border: 1px solid #0a0a0a',
  'background: #fff',
  'color: #0a0a0a',
  'cursor: pointer',
  'border-radius: 2px',
].join(';')

/**
 * Mount the Path instrument inside `container`. Returns a teardown.
 */
export function mountPath(container: HTMLElement, store: Store): () => void {
  const root = document.createElement('div')
  root.style.cssText = 'display: flex; flex-direction: column; gap: 16px;'

  // ---- Step navigator: 12 dots + prev/next chevrons + active title -----
  const navRow = document.createElement('div')
  navRow.style.cssText =
    'display: flex; gap: 10px; align-items: center; padding: 4px 0 12px; border-bottom: 1px solid #e5e5e5;'

  const prevBtn = document.createElement('button')
  prevBtn.textContent = '◀'
  prevBtn.title = 'Previous step (←)'
  prevBtn.setAttribute('aria-label', 'Previous step')
  prevBtn.dataset.role = 'prev'
  prevBtn.style.cssText = CHEVRON_BASE
  navRow.appendChild(prevBtn)

  // Dots row inside its own flexbox so it can squeeze without breaking.
  const dotsRow = document.createElement('div')
  dotsRow.style.cssText =
    'display: flex; gap: 4px; align-items: center; flex: 0 1 auto; min-width: 0; overflow: hidden;'
  const pills: HTMLButtonElement[] = []
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i]
    const dot = document.createElement('button')
    dot.textContent = String(i)
    dot.title = `${i}. ${step.title}`
    dot.style.cssText = DOT_BASE
    dot.dataset.stepId = String(i)
    dotsRow.appendChild(dot)
    pills.push(dot)
  }
  navRow.appendChild(dotsRow)

  const nextBtn = document.createElement('button')
  nextBtn.textContent = '▶'
  nextBtn.title = 'Next step (→)'
  nextBtn.setAttribute('aria-label', 'Next step')
  nextBtn.dataset.role = 'next'
  nextBtn.style.cssText = `${CHEVRON_BASE} background: #0a0a0a; color: #fff;`
  navRow.appendChild(nextBtn)

  // Active step title — replaces the chunky old in-rail labels.
  const activeTitle = document.createElement('div')
  activeTitle.style.cssText = [
    'flex: 1 1 auto',
    'min-width: 0',
    "font-family: 'Newsreader', serif",
    'font-style: italic',
    'font-size: 20px',
    'color: #1a1a1a',
    'padding-left: 8px',
    'white-space: nowrap',
    'overflow: hidden',
    'text-overflow: ellipsis',
  ].join(';')
  navRow.appendChild(activeTitle)

  root.appendChild(navRow)

  // ---- Stage -----------------------------------------------------
  const stage = createStage({ store })
  root.appendChild(stage.root)

  container.appendChild(root)

  // ---- Bring up the current step + sync nav ----------------------
  function activePillStyle(idx: number): void {
    for (let i = 0; i < pills.length; i++) {
      const active = i === idx
      const done = i < idx
      const dot = pills[i]
      const bg = active ? '#0a0a0a' : done ? '#e0e0e0' : '#fff'
      const color = active ? '#fff' : done ? '#555' : '#888'
      const border = active ? '#0a0a0a' : done ? '#999' : '#c0c0c0'
      dot.style.cssText = `${DOT_BASE} background: ${bg}; color: ${color}; border-color: ${border};`
      if (active) {
        dot.style.transform = 'scale(1.18)'
      }
    }
    activeTitle.textContent = `step ${idx.toString().padStart(2, '0')}  ·  ${STEPS[idx].title.toLowerCase()}`
  }

  function go(idx: PathStepIndex): void {
    const step = STEPS[idx]
    const currentKnob = store.getState().display.path.knob[idx]
    const knobInitial = typeof currentKnob === 'number' ? currentKnob : 0
    stage.mountStep(step, knobInitial, (v) => {
      store.setState((s) => ({
        ...s,
        display: {
          ...s.display,
          path: {
            ...s.display.path,
            knob: { ...s.display.path.knob, [idx]: v },
          },
        },
      }))
    })
    activePillStyle(idx)
  }

  function setStep(next: number): void {
    const idx = clampStep(next)
    store.setState((s) =>
      s.display.path.currentStep === idx
        ? s
        : { ...s, display: { ...s.display, path: { ...s.display.path, currentStep: idx } } },
    )
  }

  // Subscribe to store: when currentStep changes (from any source), mount it.
  let lastStep: PathStepIndex | -1 = -1
  function refreshFromStore(): void {
    const idx = store.getState().display.path.currentStep
    if (idx !== lastStep) {
      lastStep = idx
      go(idx)
    }
  }
  refreshFromStore()
  const unsubscribe = store.subscribe(refreshFromStore)

  // Wire navigator interactions.
  prevBtn.addEventListener('click', () => setStep(store.getState().display.path.currentStep - 1))
  nextBtn.addEventListener('click', () => setStep(store.getState().display.path.currentStep + 1))
  for (const pill of pills) {
    pill.addEventListener('click', () => {
      const idx = parseInt(pill.dataset.stepId ?? '0', 10)
      setStep(idx)
    })
  }

  // Keyboard arrows.
  function onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement) return
    if (e.target instanceof HTMLTextAreaElement) return
    if (e.key === 'ArrowRight') {
      setStep(store.getState().display.path.currentStep + 1)
    } else if (e.key === 'ArrowLeft') {
      setStep(store.getState().display.path.currentStep - 1)
    }
  }
  document.addEventListener('keydown', onKey)

  return function teardown(): void {
    document.removeEventListener('keydown', onKey)
    unsubscribe()
    stage.dispose()
    root.remove()
  }
}
