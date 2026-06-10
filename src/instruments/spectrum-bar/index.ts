/**
 * Spectrum Bar — v1.
 *
 * A horizontal wavelength bar with two range modes (visible / full-EM-log),
 * two display modes (emission / absorption), per-element filter pills, region
 * dividers (log mode), hover tooltips, and click-to-select-element behavior.
 *
 * Subscribed to the synced spine: re-renders whenever `display.modes.colorPipeline`
 * changes. All other UI controls live in instrument-local state — they do
 * not yet flow through the global store.
 *
 * Pure helpers live in `./scale`, `./gradient`, `./filter`. This file owns
 * DOM mounting, store wiring, and event handlers.
 */

import type { Store } from '../../store'
import type { ColorPipeline } from '../../physics/color'
import type { ElementSymbol, LineSelection, TermState } from '../../types'
import { wavelengthToHex } from '../../physics/color'
import { allLines, regions } from '../../data'
import type { EmissionLine } from '../../data/types'
import {
  parseTransition,
  hydrogenicEnergy_eV,
  effectiveZ,
  representativeE1BranchesForBareHydrogenTransition,
  type OrbitalDescriptor,
} from '../../physics/atomic'
import type { ParsedState } from '../../physics/atomic'
import { fireBus as defaultFireBus, type FireBus } from '../../store/fire-bus'
import { isSuiteElement } from '../../suite-scope'
import {
  type RangeMode,
  type AxisTick,
  axisTicks,
  formatWavelength,
  inBand,
  positionPercent,
} from './scale'
import { buildGradientStops, stopsToCss } from './gradient'
import { type PillId, PILLS, allPillsActive, togglePill, visibleLines } from './filter'

export type DisplayMode = 'emission' | 'absorption'

type LocalState = {
  range: RangeMode
  display: DisplayMode
  active: ReadonlySet<PillId>
}

const PILL_LABEL: Record<PillId, string> = {
  H: 'H',
  He: 'He',
  Na: 'Na',
  Hg: 'Hg',
  Ne: 'Ne',
  survey: 'survey',
}

/**
 * Options for `mountSpectrumBar`. The `bus` parameter is dependency-injectable
 * so tests can pass a fresh `createFireBus()` and assert pulse behavior in
 * isolation; production callers omit it and get the shared singleton.
 */
export type MountSpectrumBarOptions = {
  bus?: FireBus
}

/**
 * Mount the Spectrum Bar inside `container`. Returns a teardown function
 * that unsubscribes from the store and clears the container.
 */
export function mountSpectrumBar(
  container: HTMLElement,
  store: Store,
  options?: MountSpectrumBarOptions,
): () => void {
  // ---- local state ----
  const local: LocalState = {
    range: 'visible',
    display: 'emission',
    active: allPillsActive(),
  }

  // ---- DOM scaffolding ----
  container.innerHTML = scaffoldHTML()

  const els = {
    rangeButtons: container.querySelectorAll<HTMLButtonElement>('[data-range]'),
    displayButtons: container.querySelectorAll<HTMLButtonElement>('[data-display]'),
    pillsRoot: container.querySelector<HTMLDivElement>('[data-role="pills"]'),
    band: container.querySelector<HTMLDivElement>('[data-role="band"]'),
    gradient: container.querySelector<HTMLDivElement>('[data-role="gradient"]'),
    linesLayer: container.querySelector<HTMLDivElement>('[data-role="lines"]'),
    tooltip: container.querySelector<HTMLDivElement>('[data-role="tooltip"]'),
    regionsRow: container.querySelector<HTMLDivElement>('[data-role="regions"]'),
    axisRow: container.querySelector<HTMLDivElement>('[data-role="axis"]'),
    cultural: container.querySelector<HTMLDivElement>('[data-role="cultural-strip"]'),
  }
  if (
    !els.pillsRoot ||
    !els.band ||
    !els.gradient ||
    !els.linesLayer ||
    !els.tooltip ||
    !els.regionsRow ||
    !els.axisRow ||
    !els.cultural
  ) {
    throw new Error('spectrum-bar: scaffold targets missing')
  }

  renderPills(els.pillsRoot, local.active)

  // ---- handlers ----
  els.rangeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.range as RangeMode
      if (next !== local.range) {
        local.range = next
        renderAll()
      }
    })
  })
  els.displayButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.display as DisplayMode
      if (next !== local.display) {
        local.display = next
        renderAll()
      }
    })
  })
  els.pillsRoot.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-pill]')
    if (!target) return
    const pill = target.dataset.pill as PillId
    local.active = togglePill(local.active, pill)
    renderPills(els.pillsRoot!, local.active)
    renderLines()
  })

  // ---- render passes ----
  function pipeline(): ColorPipeline {
    return store.getState().display.modes.colorPipeline
  }

  function renderAll(): void {
    syncToggleStyles(els.rangeButtons, local.range)
    syncToggleStyles(els.displayButtons, local.display)
    renderBackground()
    renderRegions(els.regionsRow!, local.range)
    renderAxis(els.axisRow!, local.range)
    renderLines()
    renderCulturalStrip()
  }

  function renderBackground(): void {
    const stops = buildGradientStops(local.range, pipeline())
    const css = stopsToCss(stops)
    if (local.display === 'absorption') {
      // gradient is the bar; lines drawn over it as dark notches
      els.band!.style.background = css
      els.gradient!.style.opacity = '0'
    } else {
      // emission: black bar with a subtle gradient ghost behind the lines
      els.band!.style.background = '#000'
      els.gradient!.style.background = css
      els.gradient!.style.opacity = '0.18'
    }
  }

  function renderLines(): void {
    const filtered = visibleLines(allLines, local.active)
    const focus = store.getState().selection.line
    const html: string[] = []
    for (const line of filtered) {
      if (!inBand(line.wavelength_nm, local.range)) continue
      const pct = positionPercent(line.wavelength_nm, local.range)
      const lineColor =
        local.display === 'absorption'
          ? '#000000'
          : inBand(line.wavelength_nm, 'visible')
            ? wavelengthToHex(line.wavelength_nm, pipeline())
            : '#e5e5e5'
      const baseOpacity = local.display === 'absorption' ? 0.85 : 0.95
      // Focus mode: when a line is selected, dim non-matches and emphasize the match.
      const isMatch =
        focus !== null &&
        focus.element === line.element &&
        focus.wavelength_nm === line.wavelength_nm
      const opacity = focus === null ? baseOpacity : isMatch ? 1 : 0.12
      const shadowBlur = focus !== null && isMatch ? 6 : 4
      const shadow =
        local.display === 'emission' ? `box-shadow: 0 0 ${shadowBlur}px 0 ${lineColor};` : ''
      const tipPayload = encodeURIComponent(JSON.stringify(serializeLine(line)))
      // The `data-line-color` and `data-match` attributes power the pulse
      // animation (see `pulseFocusedLine`) so the animator can recover the
      // base color/width/shadow each frame without re-running render.
      const matchAttr = isMatch ? ' data-match="1"' : ''
      html.push(
        `<div data-line="${tipPayload}" data-line-color="${lineColor}"${matchAttr} style="position: absolute; top: 0; bottom: 0; left: ${pct.toFixed(4)}%; width: 2px; transform: translateX(-1px); background: ${lineColor}; ${shadow} opacity: ${opacity}; cursor: pointer;"></div>`,
      )
    }
    els.linesLayer!.innerHTML = html.join('')
  }

  /**
   * Render the cultural-context strip below the band. The strip displays the
   * `culturalContext` of the currently focused line, in italic serif. When no
   * line is focused, or the focused line carries no cultural context, the
   * strip is rendered empty (no caption).
   */
  function renderCulturalStrip(): void {
    const focus = store.getState().selection.line
    if (focus === null) {
      els.cultural!.innerHTML = ''
      return
    }
    const matched = allLines.find(
      (l) => l.element === focus.element && l.wavelength_nm === focus.wavelength_nm,
    )
    const ctx = matched?.culturalContext
    if (!ctx) {
      els.cultural!.innerHTML = ''
      return
    }
    els.cultural!.innerHTML = `<span style="font-family: 'Newsreader', serif; font-style: italic; font-size: 13px; color: #6b6b6b;">${escapeHtml(ctx)}</span>`
  }

  // ---- tooltip / click ----
  els.linesLayer.addEventListener('mousemove', (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-line]')
    if (!target) {
      els.tooltip!.style.opacity = '0'
      return
    }
    const payload = decodeLineAttr(target.dataset.line ?? '')
    if (!payload) return
    showTooltip(els.tooltip!, els.band!, ev as MouseEvent, payload)
  })
  els.linesLayer.addEventListener('mouseleave', () => {
    els.tooltip!.style.opacity = '0'
  })
  els.linesLayer.addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-line]')
    if (!target) return
    const payload = decodeLineAttr(target.dataset.line ?? '')
    if (!payload) return
    const element = payload.element as ElementSymbol
    const lineSelection: LineSelection = {
      id: lineId(element, payload.wavelength_nm),
      element,
      wavelength_nm: payload.wavelength_nm,
      label: payload.label,
      transition: payload.transition,
    }
    // Best-effort — populate upper/lower from the transition string when the
    // parser recognizes it. For multi-electron / hyperfine notation the parser
    // returns null and we leave the existing TermStates untouched.
    // Non-suite elements: highlight the line in the spectrum only — keep the
    // hydrogen instrument suite selection intact.
    if (!isSuiteElement(element)) {
      store.setState((s) => ({
        ...s,
        selection: { ...s.selection, line: lineSelection },
      }))
      ev.stopPropagation()
      return
    }
    const parsed = parseTransition(payload.transition)
    const states = parsed ? termStatesFromParsed(parsed, element, payload.transition) : null
    store.setState((s) => ({
      ...s,
      selection: states
        ? {
            ...s.selection,
            element,
            upper: states.upper,
            lower: states.lower,
            line: lineSelection,
          }
        : { ...s.selection, element, line: lineSelection },
      display: states
        ? {
            ...s.display,
            atomView: {
              ...s.display.atomView,
              upperM: states.upper.m ?? 0,
              lowerM: states.lower.m ?? 0,
            },
          }
        : s.display,
    }))
    // Stop the click from also bubbling to the band-background handler that clears focus.
    ev.stopPropagation()
  })

  // Click on empty band background (between the line marks) clears the line focus.
  // Lines stop propagation above, so this only fires for non-line clicks.
  els.band.addEventListener('click', () => {
    const focus = store.getState().selection.line
    if (focus === null) return
    store.setState((s) => ({ ...s, selection: { ...s.selection, line: null } }))
  })

  // ---- store subscription ----
  const unsubscribe = store.subscribe(() => {
    renderBackground()
    renderLines()
    renderCulturalStrip()
  })

  // ---- fire-bus subscription: pulse the focused line ----
  // Active animation handle so a second emit cancels and restarts cleanly.
  let pulseRaf: number | null = null
  const cancelPulse = (): void => {
    if (pulseRaf !== null) {
      cancelAnimationFrame(pulseRaf)
      pulseRaf = null
    }
  }
  /**
   * Animate the focused line over ~600 ms with a peak at 200 ms.
   *
   * We deliberately do not use CSS keyframes — the lines are positioned
   * `<div>`s redrawn whenever filters/range/focus change, so a programmatic
   * rAF loop with explicit start/stop is easier to reason about than juggling
   * stylesheets that could be invalidated mid-animation.
   *
   * Width is set via `width` (px) and `transform: translateX(-w/2)` so the
   * line stays centered on its wavelength position as it grows.
   */
  function pulseFocusedLine(): void {
    const focus = store.getState().selection.line
    if (focus === null) return
    const target = els.linesLayer!.querySelector<HTMLElement>('[data-match="1"]')
    if (!target) return
    const baseColor = target.dataset.lineColor ?? '#ffffff'
    const isEmission = local.display === 'emission'

    cancelPulse()
    const start = performance.now()

    const step = (now: number): void => {
      const t = now - start
      // Triangular envelope peaking at 200 ms then settling by 600 ms.
      // 0   ms → width 2,   opacity 0.95, blur 4
      // 200 ms → width 4,   opacity 1.00, blur 12
      // 400 ms → width 3,   opacity 0.97, blur 8
      // 600 ms → width 2,   opacity 0.95, blur 4 (settle)
      let width: number
      let opacity: number
      let blur: number
      if (t <= 200) {
        const k = t / 200
        width = 2 + 2 * k
        opacity = 0.95 + 0.05 * k
        blur = 4 + 8 * k
      } else if (t <= 400) {
        const k = (t - 200) / 200
        width = 4 - 1 * k
        opacity = 1.0 - 0.03 * k
        blur = 12 - 4 * k
      } else if (t <= 600) {
        const k = (t - 400) / 200
        width = 3 - 1 * k
        opacity = 0.97 - 0.02 * k
        blur = 8 - 4 * k
      } else {
        // Settle to standard.
        target.style.width = '2px'
        target.style.transform = 'translateX(-1px)'
        target.style.opacity = '1'
        if (isEmission) target.style.boxShadow = `0 0 6px 0 ${baseColor}`
        pulseRaf = null
        return
      }

      target.style.width = `${width.toFixed(2)}px`
      target.style.transform = `translateX(${(-width / 2).toFixed(2)}px)`
      target.style.opacity = opacity.toFixed(3)
      if (isEmission) target.style.boxShadow = `0 0 ${blur.toFixed(2)}px 0 ${baseColor}`

      pulseRaf = requestAnimationFrame(step)
    }
    pulseRaf = requestAnimationFrame(step)
  }

  const bus: FireBus = options?.bus ?? defaultFireBus
  const unsubscribeFire = bus.subscribe(() => {
    pulseFocusedLine()
  })

  // First render.
  renderAll()

  return () => {
    cancelPulse()
    unsubscribeFire()
    unsubscribe()
    container.innerHTML = ''
  }
}

// ---------- DOM helpers ----------

function scaffoldHTML(): string {
  const ctrlBtn = (key: 'range' | 'display', value: string, label: string): string =>
    `<button data-${key}="${value}" style="${BTN_STYLE}">${label}</button>`

  return `
    <div class="spectrum-bar" style="position: relative;">
      <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 12px; font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.06em;">
        <div style="display: inline-flex; gap: 4px;" data-role="range-group">
          ${ctrlBtn('range', 'visible', 'visible 380–750')}
          ${ctrlBtn('range', 'full-em-log', 'full EM · log')}
        </div>
        <div style="display: inline-flex; gap: 4px;" data-role="display-group">
          ${ctrlBtn('display', 'emission', 'emission')}
          ${ctrlBtn('display', 'absorption', 'absorption')}
        </div>
        <div data-role="pills" style="display: inline-flex; gap: 4px; margin-left: auto;"></div>
      </div>
      <div data-role="regions" style="position: relative; height: 18px; margin-bottom: 4px;"></div>
      <div
        data-role="band"
        style="position: relative; width: 100%; height: 96px; background: #000; overflow: visible; border: 1px solid #0a0a0a;"
      >
        <div data-role="gradient" style="position: absolute; inset: 0; opacity: 0.18; pointer-events: none;"></div>
        <div data-role="lines" style="position: absolute; inset: 0;"></div>
        <div
          data-role="tooltip"
          style="position: absolute; pointer-events: none; opacity: 0; transition: opacity 0.08s; background: #0a0a0a; color: #f5f5f5; border: 1px solid #2a2a2a; padding: 6px 10px; font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.45; white-space: nowrap; z-index: 4;"
        ></div>
      </div>
      <div data-role="axis" style="position: relative; height: 22px; margin-top: 8px;"></div>
      <div data-role="cultural-strip" style="margin-top: 6px; min-height: 18px; line-height: 1.4;"></div>
    </div>
  `
}

const BTN_STYLE =
  "font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.06em; padding: 5px 10px; border: 1px solid #0a0a0a; background: #fff; color: #0a0a0a; cursor: pointer;"

function syncToggleStyles(buttons: NodeListOf<HTMLButtonElement>, active: string): void {
  buttons.forEach((b) => {
    const key = (b.dataset.range ?? b.dataset.display) as string
    const on = key === active
    b.style.background = on ? '#0a0a0a' : '#fff'
    b.style.color = on ? '#fff' : '#0a0a0a'
  })
}

function renderPills(root: HTMLDivElement, active: ReadonlySet<PillId>): void {
  const html = PILLS.map((p) => {
    const on = active.has(p)
    const suiteOnly = p !== 'H' && p !== 'survey'
    const title = suiteOnly ? 'Lines only in v1 — open Atlas for full context' : ''
    const opacity = suiteOnly ? 'opacity: 0.55;' : ''
    return `<button data-pill="${p}" title="${title}" style="${BTN_STYLE} background: ${on ? '#0a0a0a' : '#fff'}; color: ${on ? '#fff' : '#0a0a0a'}; ${opacity}">${PILL_LABEL[p]}${suiteOnly ? ' · lines' : ''}</button>`
  }).join('')
  root.innerHTML = html
}

function renderRegions(root: HTMLDivElement, range: RangeMode): void {
  if (range !== 'full-em-log') {
    root.innerHTML = ''
    return
  }
  const html: string[] = []
  for (const r of regions) {
    const start = positionPercent(r.min_nm, range)
    const end = positionPercent(r.max_nm, range)
    const width = Math.max(0, end - start)
    const accent = r.visible ? '#fafafa' : '#9a9a9a'
    html.push(
      `<div style="position: absolute; top: 0; left: ${start.toFixed(3)}%; width: ${width.toFixed(3)}%; height: 100%; border-right: 1px dashed #3a3a3a; box-sizing: border-box;">
        <span style="position: absolute; top: 0; left: 4px; font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.08em; color: ${accent};">${r.name}</span>
      </div>`,
    )
  }
  root.innerHTML = html.join('')
}

function renderAxis(root: HTMLDivElement, range: RangeMode): void {
  const ticks: readonly AxisTick[] = axisTicks(range)
  const html = ticks
    .map(
      (t) =>
        `<span style="position: absolute; top: 0; left: ${t.pct.toFixed(3)}%; transform: translateX(-50%); font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.06em; color: #6b6b6b;"><span style="display: block; width: 1px; height: 6px; background: #6b6b6b; margin: 0 auto 3px;"></span>${t.label}</span>`,
    )
    .join('')
  root.innerHTML = html
}

type LinePayload = {
  label: string
  transition: string
  wavelength_nm: number
  element: string
  series: string
  note?: string
  culturalContext?: string
}

function serializeLine(line: EmissionLine): LinePayload {
  return {
    label: line.label,
    transition: line.transition,
    wavelength_nm: line.wavelength_nm,
    element: line.element,
    series: line.series,
    note: line.note,
    culturalContext: line.culturalContext,
  }
}

function decodeLineAttr(raw: string): LinePayload | null {
  if (!raw) return null
  try {
    return JSON.parse(decodeURIComponent(raw)) as LinePayload
  } catch {
    return null
  }
}

function showTooltip(
  tooltip: HTMLDivElement,
  band: HTMLDivElement,
  ev: MouseEvent,
  payload: LinePayload,
): void {
  const rect = band.getBoundingClientRect()
  const x = ev.clientX - rect.left
  const y = ev.clientY - rect.top
  const noteHTML = payload.note
    ? `<div style="color: #a3a3a3;">${escapeHtml(payload.note)}</div>`
    : ''
  // Cultural-context row — italic serif at 12 px, gray-ink (#6b6b6b). Omitted
  // entirely when the line carries no culturalContext so tooltips for lines
  // without context do not gain a stray italic row.
  const culturalHTML = payload.culturalContext
    ? `<div data-role="tooltip-cultural" style="font-family: 'Newsreader', serif; font-style: italic; font-size: 12px; color: #6b6b6b; margin-top: 2px;">${escapeHtml(payload.culturalContext)}</div>`
    : ''
  tooltip.innerHTML = `
    <div style="font-weight: 600;">${escapeHtml(payload.label)}</div>
    <div>${escapeHtml(payload.transition)}</div>
    <div>${formatWavelength(payload.wavelength_nm)}</div>
    <div style="color: #a3a3a3;">${escapeHtml(payload.element)} · ${escapeHtml(payload.series)}</div>
    ${noteHTML}
    ${culturalHTML}
  `
  tooltip.style.left = `${x + 12}px`
  tooltip.style.top = `${Math.max(0, y - 10)}px`
  tooltip.style.opacity = '1'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Stable ISO-style id for a line: `${element}/${wavelength_nm}`. */
export function lineId(element: ElementSymbol, wavelength_nm: number): string {
  return `${element}/${wavelength_nm}`
}

/**
 * Construct full TermStates from a parsed transition for the Atom View / Grotrian
 * to render. For non-hydrogenic elements this is approximate (s/j are
 * representative placeholders) and the UI labels it `(schematic)`.
 */
export function termStatesFromParsed(
  parsed: { upper: ParsedState; lower: ParsedState },
  element: ElementSymbol,
  rawTransition?: string,
): { upper: TermState; lower: TermState } {
  const branch = representativeBranchFromBareHydrogenTransition(parsed, element, rawTransition)
  if (branch) {
    return {
      upper: termStateFromOrbital(branch.representativeUpper, element),
      lower: termStateFromOrbital(branch.representativeLower, element),
    }
  }
  return {
    upper: termStateFromParsed(parsed.upper, element),
    lower: termStateFromParsed(parsed.lower, element),
  }
}

function representativeBranchFromBareHydrogenTransition(
  parsed: { upper: ParsedState; lower: ParsedState },
  element: ElementSymbol,
  rawTransition?: string,
) {
  if (element !== 'H' || !rawTransition) return null
  if (!/^\s*(?:n\s*=\s*)?\d+\s*(?:→|->)\s*(?:n\s*=\s*)?\d+\s*$/i.test(rawTransition)) {
    return null
  }
  const branches = representativeE1BranchesForBareHydrogenTransition(parsed.upper.n, parsed.lower.n)
  return (
    branches.find(
      (branch) => branch.representativeUpper.l === 1 && branch.representativeLower.l === 0,
    ) ??
    branches[0] ??
    null
  )
}

function termStateFromOrbital(orbital: OrbitalDescriptor, element: ElementSymbol): TermState {
  const letter = orbital.subshell.toUpperCase()
  const raw = element === 'H' ? 1 : effectiveZ(element, orbital.n, orbital.l)
  const Zeff = raw >= 1 ? raw : element === 'H' ? 1 : Math.max(raw, 0.5)
  return {
    n: orbital.n,
    l: orbital.l,
    m: orbital.m,
    s: 0.5,
    j: orbital.l + 0.5,
    electronConfig: `${orbital.subshellLabel}¹`,
    termSymbol: `²${letter}`,
    energy_eV: hydrogenicEnergy_eV(orbital.n, Zeff),
  }
}

function termStateFromParsed(p: ParsedState, element: ElementSymbol): TermState {
  // effectiveZ throws for elements outside its supported v1 set; fall back to Z=1
  // (hydrogenic) so the click never hard-fails — the resulting energies are
  // schematic for those elements, which the UI labels.
  //
  // Slater's rules are calibrated to GROUND-state configurations. For an
  // EXCITED state of hydrogen (e.g. 3d) the rules over-screen and can return
  // Z_eff ≤ 0; in reality the lone H electron has nothing screening it, so
  // we floor at 1.0 for hydrogen and at a small positive value otherwise.
  let raw = 1
  try {
    raw = effectiveZ(element, p.n, p.l)
  } catch {
    raw = 1
  }
  const Zeff = raw >= 1 ? raw : element === 'H' ? 1 : Math.max(raw, 0.5)
  return {
    n: p.n,
    l: p.l,
    s: 0.5,
    j: p.l + 0.5,
    electronConfig: `${p.n}${p.letter}¹`,
    termSymbol: p.termSymbolHint ?? '',
    energy_eV: hydrogenicEnergy_eV(p.n, Zeff),
  }
}
