/**
 * Propagator View — mount function.
 *
 * Plots emission lines as poles in the complex frequency plane (Re ω vs Im ω).
 *
 * Synced spine: reads Selection + Conditions from the store. B and P sliders
 * write ONLY to store.conditions.bField_T and store.conditions.pressure_Pa.
 */

import type { Store } from '../../store'
import type { ElementSymbol as TypesElementSymbol, LineSelection } from '../../types'
import { linesForElement } from '../../data'
import type { ElementSymbol as DataElementSymbol } from '../../data/types'
import { computePoles, type Pole } from './poles'
import { computeViewPort, drawPropagatorView } from './render'
import { hitTestPole, type RenderedPole } from './hit-test'
import { lifetime_s } from '../../physics/atomic/einstein'

const CANVAS_CSS_H = 280

const LABEL_STYLE = [
  "font-family: 'JetBrains Mono', monospace",
  'font-size: 11px',
  'color: #555',
  'letter-spacing: 0.04em',
].join(';')

/**
 * Mount the Propagator View inside `host`. Returns a teardown function
 * that unsubscribes from the store and clears the host.
 */
export function mountPropagatorView(host: HTMLElement, store: Store): () => void {
  host.innerHTML = `
    <div data-role="header" style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;margin-bottom:10px;">
      Propagator — where lines are poles
    </div>
    <div data-role="canvas-wrap" style="position:relative;border:1px solid #0a0a0a;">
      <canvas data-role="canvas" style="display:block;width:100%;height:${CANVAS_CSS_H}px;"></canvas>
      <div data-role="tooltip" style="position:absolute;display:none;background:#fff;border:1px solid #ccc;padding:6px 10px;font-family:'JetBrains Mono',monospace;font-size:11px;pointer-events:none;max-width:280px;z-index:10;line-height:1.45;"></div>
    </div>
    <div data-role="controls" style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;margin-top:10px;">
      <label style="${LABEL_STYLE}">
        B field (T)
        <input data-role="slider-b" type="range" min="0" max="5" step="0.01" value="0" style="margin-left:8px;vertical-align:middle;">
        <span data-role="value-b" style="${LABEL_STYLE};min-width:32px;display:inline-block;text-align:right;">0.00</span>
      </label>
      <label style="${LABEL_STYLE}">
        Pressure (Pa)
        <input data-role="slider-p" type="range" min="0" max="1000000" step="1000" value="101325" style="margin-left:8px;vertical-align:middle;">
        <span data-role="value-p" style="${LABEL_STYLE};min-width:60px;display:inline-block;text-align:right;">101325</span>
      </label>
    </div>
    <div data-role="fidelity-pill" style="font-family:'JetBrains Mono',monospace;font-size:10px;margin-top:8px;padding:3px 8px;border-radius:2px;display:inline-block;background:#e8f4e8;color:#2a7a2a;">
      fidelity: exact
    </div>
  `

  const canvas = host.querySelector<HTMLCanvasElement>('[data-role="canvas"]')!
  const tooltip = host.querySelector<HTMLDivElement>('[data-role="tooltip"]')!
  const sliderB = host.querySelector<HTMLInputElement>('[data-role="slider-b"]')!
  const sliderP = host.querySelector<HTMLInputElement>('[data-role="slider-p"]')!
  const valueB = host.querySelector<HTMLSpanElement>('[data-role="value-b"]')!
  const valueP = host.querySelector<HTMLSpanElement>('[data-role="value-p"]')!
  const pill = host.querySelector<HTMLDivElement>('[data-role="fidelity-pill"]')!

  let renderedPoles: RenderedPole[] = []

  function syncCanvasSize(): void {
    const w = canvas.offsetWidth || 600
    if (canvas.width !== w || canvas.height !== CANVAS_CSS_H) {
      canvas.width = w
      canvas.height = CANVAS_CSS_H
    }
  }

  function renderAll(): void {
    syncCanvasSize()
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const state = store.getState()
    const lines = linesForElement(state.selection.element as TypesElementSymbol & DataElementSymbol)
    const conds = state.conditions
    const selectedLine: LineSelection | null = state.selection.line

    const poles: Pole[] = []
    for (const line of lines) {
      const ps = computePoles({ line, conditions: conds })
      for (const p of ps) poles.push(p)
    }

    const vp = computeViewPort(poles, canvas.width, CANVAS_CSS_H)
    renderedPoles = drawPropagatorView(ctx, poles, vp, selectedLine)

    const anySchematic = poles.some((p) => p.fidelity === 'schematic')
    if (anySchematic) {
      pill.textContent = 'fidelity: schematic'
      pill.style.background = '#fdf3d0'
      pill.style.color = '#8a6200'
    } else {
      pill.textContent = 'fidelity: exact'
      pill.style.background = '#e8f4e8'
      pill.style.color = '#2a7a2a'
    }
  }

  function onSliderB(): void {
    const b = parseFloat(sliderB.value)
    valueB.textContent = b.toFixed(2)
    store.setState((s) => ({
      ...s,
      conditions: { ...s.conditions, bField_T: b },
    }))
  }

  function onSliderP(): void {
    const p = parseInt(sliderP.value, 10)
    valueP.textContent = String(p)
    store.setState((s) => ({
      ...s,
      conditions: { ...s.conditions, pressure_Pa: p },
    }))
  }

  sliderB.addEventListener('input', onSliderB)
  sliderP.addEventListener('input', onSliderP)

  function syncSlidersFromStore(): void {
    const { bField_T, pressure_Pa } = store.getState().conditions
    if (sliderB.value !== String(bField_T)) sliderB.value = String(bField_T)
    valueB.textContent = bField_T.toFixed(2)
    if (sliderP.value !== String(pressure_Pa)) sliderP.value = String(pressure_Pa)
    valueP.textContent = String(pressure_Pa)
  }

  function onMouseMove(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const hit = hitTestPole(renderedPoles, x, y)

    if (hit) {
      const lifetime = lifetime_s(hit.gamma_natural_rad_per_s)
      const lifetimeText =
        lifetime === Infinity
          ? 'τ = ∞'
          : lifetime < 1e-6
            ? `τ = ${(lifetime * 1e9).toFixed(1)} ns`
            : `τ = ${lifetime.toExponential(2)} s`

      tooltip.innerHTML = [
        `<strong>${hit.label}</strong>`,
        hit.subLabel ? `<span style="color:#888">${hit.subLabel}</span>` : '',
        `λ = ${hit.parent.wavelength_nm.toFixed(3)} nm`,
        `ω₀ = ${(hit.reOmega_rad_per_s / 1e15).toFixed(4)}×10¹⁵ rad/s`,
        `Γ = ${hit.gamma_natural_rad_per_s.toExponential(2)} rad/s`,
        lifetimeText,
        `fidelity: <em>${hit.fidelity}</em>`,
      ]
        .filter(Boolean)
        .join('<br>')

      tooltip.style.display = 'block'
      tooltip.style.left = `${x + 12}px`
      tooltip.style.top = `${y + 8}px`
    } else {
      tooltip.style.display = 'none'
    }
  }

  function onMouseLeave(): void {
    tooltip.style.display = 'none'
  }

  function onCanvasClick(e: MouseEvent): void {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const hit = hitTestPole(renderedPoles, x, y)

    if (hit) {
      const lineId = `${hit.parent.element}/${hit.parent.wavelength_nm}`
      store.setState((s) => ({
        ...s,
        selection: {
          ...s.selection,
          line: {
            id: lineId,
            element: hit.parent.element as LineSelection['element'],
            wavelength_nm: hit.parent.wavelength_nm,
            label: hit.parent.label,
            transition: hit.parent.transition,
          },
        },
      }))
    } else if (store.getState().selection.line !== null) {
      store.setState((s) => ({ ...s, selection: { ...s.selection, line: null } }))
    }
  }

  canvas.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mouseleave', onMouseLeave)
  canvas.addEventListener('click', onCanvasClick)

  const unsubscribe = store.subscribe(() => {
    syncSlidersFromStore()
    renderAll()
  })

  renderAll()

  return () => {
    unsubscribe()
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('mouseleave', onMouseLeave)
    canvas.removeEventListener('click', onCanvasClick)
    sliderB.removeEventListener('input', onSliderB)
    sliderP.removeEventListener('input', onSliderP)
    host.innerHTML = ''
  }
}
