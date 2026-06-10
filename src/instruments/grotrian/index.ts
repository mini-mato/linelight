/**
 * Grotrian energy diagram — v1.
 *
 * Hydrogen-first Grotrian instrument. Renders n=1..7 levels positioned by
 * E_n = -13.6/n², with the five canonical series (Lyman/Balmer/Paschen/
 * Brackett/Pfund) drawn as columns of arrows. Hydrogen lines from the
 * shared data registry that carry integer (upper, lower) n are placed
 * deterministically. Clicking an arrow updates `store.selection` to that
 * transition's TermStates; the active selection is highlighted.
 *
 * Multi-electron Grotrians (He, Na, Hg, Ne) are deferred to v2 — for those
 * elements the instrument shows a placeholder card and the element's lines
 * as a fallback list.
 *
 * The energy-unit toggle (eV / cm⁻¹ / nm / Hz) is local component state.
 * The store carries a project-wide `display.modes.energyUnit` but per the
 * task spec the Grotrian's own unit toggle is component-local.
 */

import type { Store } from '../../store'
import type { ElementSymbol, EnergyUnit, LineSelection, TermState } from '../../types'
import { elements } from '../../data'
import type { EmissionLine } from '../../data/types'
import { fireBus as defaultFireBus, type FireBus } from '../../store/fire-bus'
import {
  isE1Allowed,
  parseTransition,
  representativeE1BranchesForBareHydrogenTransition,
  type OrbitalDescriptor,
} from '../../physics/atomic'
import { isSuiteElement } from '../../suite-scope'
import { hydrogenLevelEnergy_eV, formatEnergy } from './physics'
import {
  SERIES_NAMES,
  SERIES_COLORS,
  type Arrow,
  buildLevels,
  buildArrows,
  isHydrogenNToNLine,
  seriesHeaderX,
} from './layout'

const SUPPORTED_ELEMENTS: readonly ElementSymbol[] = ['H', 'He', 'Na', 'Hg', 'Ne']
const ENERGY_UNITS: readonly EnergyUnit[] = ['eV', 'cm-1', 'Hz', 'nm']
const ENERGY_UNIT_LABEL: Record<EnergyUnit, string> = {
  eV: 'eV',
  'cm-1': 'cm⁻¹',
  Hz: 'Hz',
  nm: 'nm',
}

/** Build a TermState for a hydrogen n-level (compatible with the H line click handler). */
export function hydrogenTermStateFromN(n: number): TermState {
  return {
    n,
    l: 0,
    s: 0.5,
    j: 0.5,
    electronConfig: `${n}s¹`,
    termSymbol: '²S₁/₂',
    energy_eV: hydrogenLevelEnergy_eV(n),
  }
}

function hydrogenTermStateFromOrbital(orbital: OrbitalDescriptor): TermState {
  const letter = orbital.subshell.toUpperCase()
  return {
    n: orbital.n,
    l: orbital.l,
    m: orbital.m,
    s: 0.5,
    j: orbital.l + 0.5,
    electronConfig: `${orbital.subshellLabel}¹`,
    termSymbol: `²${letter}`,
    energy_eV: hydrogenLevelEnergy_eV(orbital.n),
  }
}

function representativeHydrogenTermsForNTransition(
  upper: number,
  lower: number,
): { upper: TermState; lower: TermState } {
  const branches = representativeE1BranchesForBareHydrogenTransition(upper, lower)
  const branch =
    branches.find(
      (candidate) => candidate.representativeUpper.l === 1 && candidate.representativeLower.l === 0,
    ) ??
    branches[0] ??
    null
  if (!branch) {
    return { upper: hydrogenTermStateFromN(upper), lower: hydrogenTermStateFromN(lower) }
  }
  return {
    upper: hydrogenTermStateFromOrbital(branch.representativeUpper),
    lower: hydrogenTermStateFromOrbital(branch.representativeLower),
  }
}

/** Find the Arrow whose (upper, lower) matches the current selection (if any). */
export function findActiveArrow(
  arrows: readonly Arrow[],
  selection: { upper: { n: number }; lower: { n: number } },
): Arrow | null {
  return arrows.find((a) => a.upper === selection.upper.n && a.lower === selection.lower.n) ?? null
}

/** Dashed-style transition kinds (visually distinguished from solid E1). */
type DashedKind = 'M1' | 'E2' | 'forbidden'

/**
 * Resolve a line's transition type for visual styling.
 *
 * Precedence:
 *   1. The line's explicit `transitionType` field (when set in data).
 *   2. Computed verdict from `isE1Allowed` parsed from `line.transition`.
 *   3. Default to 'E1' (solid) when neither is conclusive.
 *
 * Returns the explicit kind for non-E1 transitions, or null for E1/allowed.
 * The accompanying `reason` is the human-readable reason from selection rules
 * (empty string when no reason is available).
 */
export function classifyTransition(line: EmissionLine): {
  dashed: DashedKind | null
  reason: string
} {
  const explicit = line.transitionType
  if (explicit === 'M1' || explicit === 'E2' || explicit === 'forbidden') {
    // Best-effort reason text by re-parsing if possible.
    const parsed = parseTransition(line.transition)
    const reason = parsed ? isE1Allowed(parsed.upper, parsed.lower).reason : ''
    return { dashed: explicit, reason: reason || `transition type: ${explicit}` }
  }
  if (explicit === 'E1') return { dashed: null, reason: '' }

  // No explicit type — compute from parsed quantum numbers.
  const parsed = parseTransition(line.transition)
  if (!parsed) return { dashed: null, reason: '' }
  const verdict = isE1Allowed(parsed.upper, parsed.lower)
  if (verdict.allowed) return { dashed: null, reason: '' }
  return { dashed: 'forbidden', reason: verdict.reason }
}

type Geometry = {
  width: number
  height: number
  padL: number
  padR: number
  padTop: number
  padBot: number
  innerW: number
  innerH: number
  Emin_eV: number
  Emax_eV: number
}

const GEOMETRY: Geometry = (() => {
  const width = 800
  const height = 360
  const padL = 100
  const padR = 90
  const padTop = 44
  const padBot = 36
  return {
    width,
    height,
    padL,
    padR,
    padTop,
    padBot,
    innerW: width - padL - padR,
    innerH: height - padTop - padBot,
    Emin_eV: -13.6,
    Emax_eV: 0,
  }
})()

const SVG_NS = 'http://www.w3.org/2000/svg'

function renderHydrogenSVG(
  svg: SVGSVGElement,
  options: { unit: EnergyUnit; activeKey: string | null; focusKey: string | null },
): {
  arrows: readonly Arrow[]
} {
  const { unit, activeKey, focusKey } = options
  const { padL, padR, padTop, innerW, innerH, Emin_eV, Emax_eV, width } = GEOMETRY

  // Levels n=1..7
  const levels = buildLevels(7, Emin_eV, Emax_eV, innerH, padTop)
  // Ionization line at E=0
  const yIon = padTop + ((Emax_eV - 0) / (Emax_eV - Emin_eV)) * innerH

  const hLines: EmissionLine[] = elements.H.lines.filter(isHydrogenNToNLine)
  // Cast safe due to the predicate
  const hydrogenLines = hLines as readonly (EmissionLine & { upper: number; lower: number })[]

  const arrows = buildArrows(hydrogenLines, {
    padL,
    padR,
    padTop,
    innerW,
    innerH,
    Emin_eV,
    Emax_eV,
    width,
  })

  let g = ''

  // Ionization band
  g += `<line x1="${padL}" x2="${width - padR}" y1="${yIon}" y2="${yIon}" stroke="#999" stroke-dasharray="3,3" />`
  g += `<text x="${width - padR + 4}" y="${yIon + 4}" font-family="JetBrains Mono, monospace" font-size="10" fill="#666">ionization · 0 eV</text>`

  // n levels: horizontal rule + n-label (left) + energy readout (right)
  for (const lv of levels) {
    g += `<line x1="${padL}" x2="${width - padR}" y1="${lv.y}" y2="${lv.y}" stroke="#0a0a0a" stroke-width="1.5" />`
    g += `<text x="${padL - 10}" y="${lv.y + 4}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="11" fill="#0a0a0a">n=${lv.n}</text>`
    g += `<text x="${width - padR + 4}" y="${lv.y + 4}" font-family="JetBrains Mono, monospace" font-size="10" fill="#6b6b6b">${formatEnergy(lv.E_eV, unit)}</text>`
  }

  // Series headers (colored)
  for (const sn of SERIES_NAMES) {
    const x = seriesHeaderX(sn, { padL, innerW })
    g += `<text x="${x}" y="${padTop - 18}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" letter-spacing="0.1em" fill="${SERIES_COLORS[sn]}">${sn.toUpperCase()}</text>`
  }

  const haveActive = activeKey !== null
  const haveFocus = focusKey !== null

  // Arrows
  for (const a of arrows) {
    const key = `${a.upper}-${a.lower}`
    const active = key === activeKey
    const focused = key === focusKey
    // Focus mode (line selected): show only the focused arrow at full opacity,
    // mute all others to 0.12. Otherwise fall back to the active-highlight rule.
    const opacity = haveFocus ? (focused ? 1 : 0.12) : haveActive ? (active ? 1 : 0.28) : 1
    const strokeWidth = focused || (active && !haveFocus) ? 3 : 1.5
    const sourceLine = hydrogenLines[a.index]
    const { dashed, reason } = classifyTransition(sourceLine)
    const dashAttr = dashed ? ' stroke-dasharray="4 3"' : ''
    const dataDashed = dashed ? ` data-transition-type="${dashed}"` : ' data-transition-type="E1"'
    const titleSuffix = dashed ? ` · ${dashed}${reason ? `: ${reason}` : ''}` : ''
    g += `<g data-grotrian-arrow="${key}" data-upper="${a.upper}" data-lower="${a.lower}"${dataDashed} style="cursor: pointer;" opacity="${opacity}">`
    // Click hit-zone — wider invisible strip
    g += `<line x1="${a.x}" x2="${a.x}" y1="${a.yUp}" y2="${a.yDn + 4}" stroke="transparent" stroke-width="14" />`
    g += `<line data-role="arrow-stroke" x1="${a.x}" x2="${a.x}" y1="${a.yUp}" y2="${a.yDn + 4}" stroke="${a.color}" stroke-width="${strokeWidth}"${dashAttr} />`
    g += `<polygon points="${a.x - 3},${a.yDn - 2} ${a.x + 3},${a.yDn - 2} ${a.x},${a.yDn + 4}" fill="${a.color}" />`
    g += `<text x="${a.x}" y="${a.yDn + 14}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="9" fill="${a.color}">${a.label}</text>`
    g += `<title>${a.label} · n=${a.upper} → ${a.lower} · ${a.wavelength_nm.toFixed(2)} nm${titleSuffix}</title>`
    g += `</g>`
  }

  svg.setAttribute('viewBox', `0 0 ${width} ${GEOMETRY.height}`)
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', `${GEOMETRY.height}`)
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', 'hydrogen Grotrian diagram')
  svg.innerHTML = g

  return { arrows }
}

function placeholderHTML(symbol: ElementSymbol): string {
  const el = elements[symbol as keyof typeof elements]
  if (!el) return `<div style="padding: 16px;">no data for ${symbol}</div>`
  const items = el.lines
    .map(
      (l) =>
        `<li style="display: flex; justify-content: space-between; gap: 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 4px 0; border-bottom: 1px dashed #eee;"><span>${l.label}</span><span style="color: #6b6b6b;">${l.transition}</span><span style="color: #999;">${l.wavelength_nm.toFixed(2)} nm</span></li>`,
    )
    .join('')
  return `
    <div style="padding: 18px; border: 1px dashed #ccc; background: #fafafa;">
      <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b; margin-bottom: 8px;">
        ${el.name} · ${el.lines.length} lines
      </div>
      <p style="margin: 0 0 10px; font-size: 12px; color: #444; line-height: 1.5;">
        multi-electron Grotrian deferred to v2; see emission-spectra.html for term-symbol annotations.
      </p>
      <ul style="list-style: none; padding: 0; margin: 0; max-height: 220px; overflow: auto;">
        ${items}
      </ul>
    </div>
  `
}

/** Render the formula caption block (E_n + per-unit constants + ΔE display). */
function renderFormulaCaption(
  state: { selection: { upper: TermState; lower: TermState; element: ElementSymbol } },
  unit: EnergyUnit,
): string {
  // Display the canonical Rydberg with extra precision in the caption — this
  // is the published value, not the rounded constant the renderer uses.
  const formulaByUnit: Record<EnergyUnit, string> = {
    eV: `E_n = −13.6058 eV / n²`,
    'cm-1': `E_n = −109737 cm⁻¹ / n²`,
    Hz: `E_n = −3.290×10¹⁵ Hz / n²`,
    nm: `λ_n = 1239.842 nm·eV / |E_n|`,
  }
  const formula = formulaByUnit[unit] ?? formulaByUnit.eV
  // A small active-unit pill so the caption visually reflects the unit toggle.
  const constantNote = `units · ${ENERGY_UNIT_LABEL[unit]}`

  let dEBlock = ''
  const sel = state.selection
  if (sel.element === 'H' && Number.isFinite(sel.upper?.n) && Number.isFinite(sel.lower?.n)) {
    const u = sel.upper.energy_eV
    const l = sel.lower.energy_eV
    const dE = u - l
    dEBlock = `<div data-role="delta-e" style="margin-top: 4px;">ΔE = E_upper − E_lower = ${u.toFixed(4)} − ${l.toFixed(4)} = ${dE.toFixed(4)} eV</div>`
  }

  return `
    <div data-role="formula-caption" style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #6b6b6b; margin-top: 10px; line-height: 1.6;">
      <div data-role="formula">${formula}</div>
      <div data-role="formula-unit" style="font-size: 10px; color: #999;">${constantNote}</div>
      ${dEBlock}
    </div>
  `
}

export type MountGrotrianOptions = {
  /** Override the fire bus (for tests). Defaults to the singleton in `src/store/fire-bus.ts`. */
  bus?: FireBus
}

export function mountGrotrian(
  container: HTMLElement,
  store: Store,
  options?: MountGrotrianOptions,
): () => void {
  // Local (component-only) state — energy unit toggle.
  let unit: EnergyUnit = 'eV'
  const bus = options?.bus ?? defaultFireBus

  container.innerHTML = `
    <style data-grotrian-pulse-style>
      @keyframes grotrian-pulse {
        0%   { stroke-width: 1.5; stroke-opacity: 1; filter: none; }
        25%  { stroke-width: 6;   stroke-opacity: 1; filter: drop-shadow(0 0 4px currentColor); }
        100% { stroke-width: 1.5; stroke-opacity: 1; filter: none; }
      }
      [data-grotrian-arrow].grotrian-pulse [data-role="arrow-stroke"] {
        animation: grotrian-pulse 800ms ease-out;
      }
    </style>
    <div class="grotrian" style="font-family: 'Inter', system-ui, sans-serif;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 12px; flex-wrap: wrap;">
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b;">
          grotrian · energy levels
        </div>
        <div data-role="element-pills" style="display: flex; gap: 6px;"></div>
        <div data-role="unit-pills" style="display: flex; gap: 6px;"></div>
      </div>
      <div data-role="canvas" style="position: relative;"></div>
      <div data-role="caption-slot"></div>
    </div>
  `

  const elementPills = container.querySelector<HTMLDivElement>('[data-role="element-pills"]')
  const unitPills = container.querySelector<HTMLDivElement>('[data-role="unit-pills"]')
  const canvas = container.querySelector<HTMLDivElement>('[data-role="canvas"]')
  const captionSlot = container.querySelector<HTMLDivElement>('[data-role="caption-slot"]')
  if (!elementPills || !unitPills || !canvas || !captionSlot) {
    throw new Error('grotrian: required mount targets missing')
  }

  let svg: SVGSVGElement | null = null
  let arrows: readonly Arrow[] = []

  function pillButton(label: string, active: boolean, dataAttr: string, disabled = false): string {
    const bg = active ? '#0a0a0a' : '#fff'
    const fg = active ? '#fff' : '#0a0a0a'
    const muted = disabled ? 'opacity: 0.45; cursor: not-allowed;' : 'cursor: pointer;'
    const title = disabled ? 'title="Full Grotrian deferred — see Atlas"' : ''
    return `<button ${dataAttr} ${title} ${disabled ? 'disabled aria-disabled="true"' : ''} style="font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.06em; padding: 4px 9px; border: 1px solid #0a0a0a; background: ${bg}; color: ${fg}; ${muted}">${label}${disabled ? ' · atlas' : ''}</button>`
  }

  function renderElementPills(currentEl: ElementSymbol): void {
    if (!elementPills) return
    elementPills.innerHTML = SUPPORTED_ELEMENTS.map((sym) =>
      pillButton(sym, sym === currentEl, `data-element="${sym}"`, !isSuiteElement(sym)),
    ).join('')
  }

  function renderUnitPills(): void {
    if (!unitPills) return
    unitPills.innerHTML = ENERGY_UNITS.map((u) =>
      pillButton(ENERGY_UNIT_LABEL[u], u === unit, `data-unit="${u}"`),
    ).join('')
  }

  function activeKeyFor(el: ElementSymbol): string | null {
    if (el !== 'H') return null
    const sel = store.getState().selection
    return `${sel.upper.n}-${sel.lower.n}`
  }

  /**
   * Focus key for line-isolation mode: when `selection.line` names a hydrogen
   * line whose corresponding `EmissionLine` carries integer (upper, lower) n,
   * return `${upper}-${lower}`. Otherwise null (no focus).
   */
  function focusKeyFor(el: ElementSymbol): string | null {
    if (el !== 'H') return null
    const sel = store.getState().selection
    if (!sel.line || sel.line.element !== 'H') return null
    const match = elements.H.lines.find(
      (l) => l.wavelength_nm === sel.line!.wavelength_nm && isHydrogenNToNLine(l),
    )
    if (!match || !isHydrogenNToNLine(match)) return null
    return `${match.upper}-${match.lower}`
  }

  function render(): void {
    const state = store.getState()
    const el = state.selection.element
    renderElementPills(el)
    renderUnitPills()
    if (!canvas || !captionSlot) return

    if (el === 'H') {
      if (!svg) {
        svg = document.createElementNS(SVG_NS, 'svg')
        canvas.innerHTML = ''
        canvas.appendChild(svg)
      }
      const result = renderHydrogenSVG(svg, {
        unit,
        activeKey: activeKeyFor(el),
        focusKey: focusKeyFor(el),
      })
      arrows = result.arrows
      captionSlot.innerHTML = renderFormulaCaption(state, unit)
    } else {
      svg = null
      arrows = []
      canvas.innerHTML = placeholderHTML(el)
      captionSlot.innerHTML = ''
    }
  }

  function onCanvasClick(ev: Event): void {
    const target = ev.target as Element | null
    if (!target) return
    const group = target.closest('[data-grotrian-arrow]')
    if (!group) return
    const upper = Number(group.getAttribute('data-upper'))
    const lower = Number(group.getAttribute('data-lower'))
    if (!Number.isInteger(upper) || !Number.isInteger(lower)) return
    const arrow = arrows.find((a) => a.upper === upper && a.lower === lower)
    if (!arrow) return
    const matchingLine = elements.H.lines.find((l) => l.upper === upper && l.lower === lower)
    const line: LineSelection | null = matchingLine
      ? {
          id: `H/${matchingLine.wavelength_nm}`,
          element: 'H',
          wavelength_nm: matchingLine.wavelength_nm,
          label: matchingLine.label,
          transition: matchingLine.transition,
        }
      : null
    const terms = representativeHydrogenTermsForNTransition(upper, lower)
    store.setState((s) => ({
      ...s,
      selection: {
        ...s.selection,
        element: 'H',
        ...terms,
        line,
      },
      display: {
        ...s.display,
        atomView: {
          ...s.display.atomView,
          upperM: terms.upper.m ?? 0,
          lowerM: terms.lower.m ?? 0,
        },
      },
    }))
  }

  function onPillsClick(ev: Event): void {
    const target = ev.target as HTMLElement | null
    if (!target) return
    const el = target.closest('button')
    if (!el) return
    const elementAttr = el.getAttribute('data-element')
    const unitAttr = el.getAttribute('data-unit')
    if (elementAttr && SUPPORTED_ELEMENTS.includes(elementAttr as ElementSymbol)) {
      const sym = elementAttr as ElementSymbol
      if (!isSuiteElement(sym)) return
      store.setState((s) =>
        s.selection.element === sym ? s : { ...s, selection: { ...s.selection, element: sym } },
      )
      return
    }
    if (unitAttr && (ENERGY_UNITS as readonly string[]).includes(unitAttr)) {
      unit = unitAttr as EnergyUnit
      render()
    }
  }

  canvas.addEventListener('click', onCanvasClick)
  elementPills.addEventListener('click', onPillsClick)
  unitPills.addEventListener('click', onPillsClick)

  const unsubscribe = store.subscribe(() => render())

  // Pulse animation on fire-bus events: find the arrow group matching the
  // current selection and toggle the `grotrian-pulse` class for one keyframe
  // cycle. Skipped silently if no arrow matches (e.g. non-H element or a
  // selection that doesn't correspond to any rendered transition).
  let pulseTimer: ReturnType<typeof setTimeout> | null = null
  function pulseMatchingArrow(): void {
    if (!canvas) return
    const sel = store.getState().selection
    if (sel.element !== 'H') return
    const key = `${sel.upper.n}-${sel.lower.n}`
    const matchingArrow = arrows.find((a) => a.upper === sel.upper.n && a.lower === sel.lower.n)
    if (!matchingArrow) return
    const group = canvas.querySelector(`[data-grotrian-arrow="${key}"]`) as Element | null
    if (!group) return
    // Restart the animation by removing + re-adding the class on the next frame.
    group.classList.remove('grotrian-pulse')
    // Force reflow so the class re-add restarts the keyframe animation.
    void (group as SVGGElement).getBoundingClientRect?.()
    group.classList.add('grotrian-pulse')
    if (pulseTimer !== null) clearTimeout(pulseTimer)
    pulseTimer = setTimeout(() => {
      group.classList.remove('grotrian-pulse')
      pulseTimer = null
    }, 800)
  }
  const unsubscribeFire = bus.subscribe(() => pulseMatchingArrow())

  render()

  return () => {
    unsubscribe()
    unsubscribeFire()
    if (pulseTimer !== null) {
      clearTimeout(pulseTimer)
      pulseTimer = null
    }
    canvas.removeEventListener('click', onCanvasClick)
    elementPills.removeEventListener('click', onPillsClick)
    unitPills.removeEventListener('click', onPillsClick)
    container.innerHTML = ''
    svg = null
    arrows = []
  }
}
