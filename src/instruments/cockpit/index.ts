/**
 * Cockpit — selected-transition readout.
 *
 * A compact instrument that names what is *exact*, *measured*, and
 * *schematic* for the active selection, and teaches the math that produced
 * each visible quantity. Closes the audit gap flagged in
 *   kb/linelight/wiki/audits/2026-05-03-go-live-product-coherence-audit.md
 * (Recommended Next 3 Work Items §1, Gaps Not Adequately Flagged §1 + §5).
 *
 * Sections (top → bottom):
 *   1. Header strip · "▶ FIRE TRANSITION" button (top-right) emits on the
 *      shared `fireBus` so Spectrum Bar / Grotrian / Atom View can animate.
 *   2. Selection-rule badge — green when E1-allowed, amber when forbidden,
 *      with the violation reason as a tooltip.
 *   3. Cultural-context callout — italic serif, gray-ink, populated when
 *      the active line carries a `culturalContext` string in the data.
 *   4. Readout grid — 2-column (label · value) of derived facts.
 *   5. Math panel — monospace, one row per formula, showing how ΔE, λ_vac,
 *      and ν were computed for the active selection.
 *   6. "why this color?" trace — collapsible <details> block exposing the
 *      4-step pipeline ΔE → λ → CIE chromaticity → sRGB, with a swatch.
 *   7. Fidelity callout — leading colored pill names the dominant fidelity
 *      (`exact` / `schematic` / `measured`).
 *
 * Subscription: re-renders on every change to `state.selection` — equality
 * is by reference on the `selection` object, so rerendering on color or
 * display changes is naturally avoided.
 */

import type { Store } from '../../store'
import type { Selection } from '../../types'
import { fireBus } from '../../store/fire-bus'
import { isE1Allowed, type SelectionVerdict } from '../../physics/atomic'
import { wavelengthToHex } from '../../physics/color'
import { wavelengthToXYZ } from '../../physics/color/cie1931'
import {
  classifyFidelity,
  deltaE_eV,
  elementName,
  emissionLineFor,
  eV_to_J,
  photonFrequency_Hz,
  photonWavelength_nm,
  type FidelityKind,
  type FidelityReport,
} from './derive'
import {
  formatEnergy_J,
  formatEnergy_eV,
  formatFrequency_Hz,
  formatTermState,
  formatWavelength_nm,
} from './format'

const SCAFFOLD_HTML = `
  <div class="cockpit" data-role="cockpit" style="font-family: 'Inter', system-ui, sans-serif;">
    <div data-role="header-strip" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px;">
      <div data-role="header" style="font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b;">
        cockpit · selected transition
      </div>
      <button type="button" data-role="fire-button" data-cockpit-fire-button style="font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #ffffff; background: #0a0a0a; border: 1px solid #0a0a0a; padding: 6px 12px; cursor: pointer;">▶ Fire transition</button>
    </div>
    <div data-role="rule-badge" data-cockpit-rule-badge style="margin-bottom: 10px;"></div>
    <div data-role="cultural" data-cockpit-cultural class="cockpit__cultural" style="margin-bottom: 12px;"></div>
    <div data-role="rows" class="cockpit__rows" style="display: grid; grid-template-columns: minmax(120px, 1fr) minmax(0, 2fr); gap: 4px 16px; align-items: baseline;"></div>
    <div data-role="math" data-cockpit-math class="cockpit__math" style="margin-top: 14px; padding: 10px 12px; border: 1px solid #e5e5e5; background: #fafafa;"></div>
    <details data-role="why-color" data-cockpit-why-color class="cockpit__why-color" style="margin-top: 10px;"></details>
    <div data-role="fidelity" class="cockpit__fidelity" style="margin-top: 14px; padding: 10px 12px; border: 1px solid #e5e5e5; background: #fafafa;"></div>
  </div>
  <style data-cockpit-style>
    @media (max-width: 540px) {
      .cockpit__rows { grid-template-columns: 1fr !important; gap: 2px 0 !important; }
      .cockpit__rows [data-role='label'] { padding-top: 6px; }
    }
    .cockpit [data-cockpit-fire-button]:hover { background: #2a2a2a; border-color: #2a2a2a; }
    .cockpit [data-cockpit-fire-button]:active { transform: translateY(1px); }
    .cockpit__cultural:empty { display: none; }
    .cockpit__why-color > summary { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b; cursor: pointer; padding: 4px 0; }
  </style>
`

const ROW_LABEL_STYLE =
  "font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #6b6b6b;"
const ROW_VALUE_STYLE =
  "font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #0a0a0a; word-break: break-word;"

/** Color associated with each fidelity kind. */
const FIDELITY_DOT_COLOR: Record<FidelityKind, string> = {
  exact: '#2a8c3a',
  schematic: '#c47a1a',
  measured: '#2a6cc4',
}

const FIDELITY_LABEL: Record<FidelityKind, string> = {
  exact: 'exact',
  schematic: 'schematic',
  measured: 'measured',
}

/**
 * Options for `mountCockpit`. The `bus` parameter is dependency-injectable
 * so tests can pass a fresh `createFireBus()` and assert emit counts in
 * isolation; production callers omit it and get the shared singleton.
 */
export type MountCockpitOptions = {
  bus?: { emit: () => unknown }
}

/** Mount the Cockpit and return a teardown function. */
export function mountCockpit(
  container: HTMLElement,
  store: Store,
  options?: MountCockpitOptions,
): () => void {
  container.innerHTML = SCAFFOLD_HTML

  const rowsRoot = container.querySelector<HTMLDivElement>('[data-role="rows"]')
  const fidelityRoot = container.querySelector<HTMLDivElement>('[data-role="fidelity"]')
  const ruleBadgeRoot = container.querySelector<HTMLDivElement>('[data-role="rule-badge"]')
  const culturalRoot = container.querySelector<HTMLDivElement>('[data-role="cultural"]')
  const mathRoot = container.querySelector<HTMLDivElement>('[data-role="math"]')
  const whyColorRoot = container.querySelector<HTMLDetailsElement>('[data-role="why-color"]')
  const fireButton = container.querySelector<HTMLButtonElement>('[data-role="fire-button"]')
  if (
    !rowsRoot ||
    !fidelityRoot ||
    !ruleBadgeRoot ||
    !culturalRoot ||
    !mathRoot ||
    !whyColorRoot ||
    !fireButton
  ) {
    throw new Error('cockpit: scaffold targets missing')
  }

  // Wire the fire button. The bus is dependency-injectable for tests; the
  // production singleton from `src/store/fire-bus.ts` is the default.
  const bus = options?.bus ?? fireBus
  const onFireClick = (): void => {
    bus.emit()
  }
  fireButton.addEventListener('click', onFireClick)

  let lastSelection: Selection | null = null

  function render(): void {
    const state = store.getState()
    if (state.selection === lastSelection) return
    lastSelection = state.selection
    rowsRoot!.innerHTML = renderRowsHTML(state.selection)
    ruleBadgeRoot!.innerHTML = renderRuleBadgeHTML(state.selection)
    culturalRoot!.innerHTML = renderCulturalHTML(state.selection)
    mathRoot!.innerHTML = renderMathHTML(state.selection)
    whyColorRoot!.innerHTML = renderWhyColorHTML(state.selection)
    fidelityRoot!.innerHTML = renderFidelityHTML(classifyFidelity(state.selection))
  }

  // Subscribe — render is a no-op when `state.selection` reference is stable,
  // so spurious renders for unrelated state slices are filtered cheaply.
  const unsubscribe = store.subscribe(render)
  render()

  return () => {
    unsubscribe()
    fireButton.removeEventListener('click', onFireClick)
    lastSelection = null
    container.innerHTML = ''
  }
}

/* ----------------------------------------------------------------------- */
/* HTML builders — pure, take Selection-derived facts and return strings.  */
/* ----------------------------------------------------------------------- */

function renderRowsHTML(selection: Selection): string {
  const rows = buildRowModel(selection)
  return rows
    .map(
      (r) =>
        `<div data-role="label" data-cockpit-row="${escapeAttr(r.key)}" style="${ROW_LABEL_STYLE}">${escapeHTML(r.label)}</div>` +
        `<div data-role="value" data-cockpit-row-value="${escapeAttr(r.key)}" style="${ROW_VALUE_STYLE}"${r.title ? ` title="${escapeAttr(r.title)}"` : ''}>${escapeHTML(r.value)}</div>`,
    )
    .join('')
}

type RowModel = {
  key: string
  label: string
  value: string
  /** Optional tooltip — used to expose the joules form of photon energy. */
  title?: string
}

function buildRowModel(selection: Selection): RowModel[] {
  const { element, upper, lower, line } = selection

  const dE = deltaE_eV(upper, lower)
  const lambda = photonWavelength_nm(dE)
  const nu = photonFrequency_Hz(lambda)
  const photonJ = eV_to_J(dE)

  const elName = elementName(element)
  const elValue = elName ? `${elName} · ${element}` : element

  // transition: prefer the line's curated string, fall back to upper→lower configs.
  const transitionFromConfigs = `${upper.electronConfig} → ${lower.electronConfig}`
  const transitionValue = line?.transition ?? transitionFromConfigs

  const lineRecord = emissionLineFor(line)

  return [
    { key: 'element', label: 'element', value: elValue },
    { key: 'transition', label: 'transition', value: transitionValue },
    { key: 'upper', label: 'upper state', value: formatTermState(upper) },
    { key: 'lower', label: 'lower state', value: formatTermState(lower) },
    { key: 'delta-e', label: 'ΔE', value: formatEnergy_eV(dE) },
    {
      key: 'lambda-vac',
      label: 'photon λ (vac)',
      value: formatWavelength_nm(lambda),
    },
    {
      key: 'lambda-air',
      label: 'photon λ (air)',
      value: `${formatWavelength_nm(lambda)} (approx — vac=air pending Edlén)`,
    },
    {
      key: 'nu',
      label: 'photon ν',
      value: formatFrequency_Hz(nu),
    },
    {
      key: 'photon-energy',
      label: 'photon energy',
      value: formatEnergy_eV(dE),
      title: formatEnergy_J(photonJ),
    },
    {
      key: 'line-label',
      label: 'line label',
      value: line?.label ?? '—',
    },
    {
      key: 'line-series',
      label: 'line series',
      value: lineRecord?.series ?? '—',
    },
    {
      key: 'line-note',
      label: 'line note',
      value: lineRecord?.note ?? '—',
    },
  ]
}

/* ----------------------------------------------------------------------- */
/* Selection-rule badge                                                     */
/* ----------------------------------------------------------------------- */

/**
 * Build the E1 selection-rule verdict for the active Selection.
 * Uses upper.n + upper.l and lower.n + lower.l directly — these are the
 * canonical inputs to `isE1Allowed` per the v1 hydrogenic LS-coupling rules.
 */
function selectionRuleVerdict(selection: Selection): SelectionVerdict {
  const { upper, lower } = selection
  return isE1Allowed(
    { n: upper.n, l: upper.l, m: 0, letter: '' },
    { n: lower.n, l: lower.l, m: 0, letter: '' },
  )
}

function renderRuleBadgeHTML(selection: Selection): string {
  const verdict = selectionRuleVerdict(selection)
  if (verdict.allowed) {
    return (
      `<span data-cockpit-rule="allowed" title="electric-dipole (E1) allowed: ΔL=±1, ΔS=0, ΔJ=0,±1" ` +
      `style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border: 1px solid #2a8c3a; background: #e8f5ec; color: #1e6e2c; font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;">` +
      `<span aria-hidden="true" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #2a8c3a;"></span>` +
      `allowed · E1` +
      `</span>`
    )
  }
  const reason = verdict.reason || 'forbidden by E1 rules'
  return (
    `<span data-cockpit-rule="forbidden" title="${escapeAttr(reason)}" ` +
    `style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border: 1px solid #c47a1a; background: #fff4e0; color: #8a4f0a; font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;">` +
    `<span aria-hidden="true" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #c47a1a;"></span>` +
    `forbidden · ${escapeHTML(verdict.reason || 'E1 rules')}` +
    `</span>`
  )
}

/* ----------------------------------------------------------------------- */
/* Cultural-context callout                                                 */
/* ----------------------------------------------------------------------- */

function renderCulturalHTML(selection: Selection): string {
  const lineRecord = emissionLineFor(selection.line)
  const text = lineRecord?.culturalContext
  if (!text || text.trim() === '') return ''
  return (
    `<div data-cockpit-cultural-text style="font-family: 'Newsreader', Georgia, serif; font-style: italic; font-size: 13px; line-height: 1.5; color: #4a4a4a; padding: 8px 10px; border-left: 2px solid #c0c0c0; background: #fafafa;">` +
    `${escapeHTML(text)}` +
    `</div>`
  )
}

/* ----------------------------------------------------------------------- */
/* Math panel                                                               */
/* ----------------------------------------------------------------------- */

const MATH_ROW_STYLE =
  "font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.6; color: #2a2a2a; white-space: pre; overflow-x: auto;"

/**
 * Render the live formula panel — one monospace row per formula.
 *
 * Design choice: each row carries the full numeric chain for the active
 * selection (`hc/ΔE = 1239.842 / 1.8900 = 656.000 nm`) rather than abstract
 * symbol-only forms. The reasoning is that the audit gap was specifically
 * about *traceability* — a student should be able to read each panel row
 * left-to-right and reproduce the value shown in the readout above with a
 * pocket calculator. Symbol-only forms appear in the wiki concept articles
 * (`kb/linelight/wiki/concepts/`) and don't need to be repeated here.
 */
function renderMathHTML(selection: Selection): string {
  const { element, upper, lower } = selection
  const dE = deltaE_eV(upper, lower)
  const lambda = photonWavelength_nm(dE)
  const nu = photonFrequency_Hz(lambda)

  const rows: string[] = []

  if (element === 'H') {
    rows.push(`E_n = −13.6058 / n²  eV`)
  }

  // Use Unicode minus inside the absolute-value expression.
  const u = upper.energy_eV
  const l = lower.energy_eV
  rows.push(`ΔE = |E_upper − E_lower| = |${u.toFixed(4)} − ${l.toFixed(4)}| = ${dE.toFixed(4)} eV`)

  if (Number.isFinite(lambda)) {
    rows.push(`λ_vac = hc / ΔE = 1239.842 / ${dE.toFixed(4)} = ${lambda.toFixed(3)} nm`)
  } else {
    rows.push(`λ_vac = hc / ΔE = ∞ (ΔE → 0)`)
  }

  if (Number.isFinite(nu) && nu > 0) {
    rows.push(`ν = c / λ = ${nu.toExponential(3)} Hz`)
  } else {
    rows.push(`ν = c / λ = 0 Hz`)
  }

  const headLine = `<div data-cockpit-math-head style="font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b; margin-bottom: 6px;">live math</div>`

  const body = rows
    .map(
      (row, i) =>
        `<div data-cockpit-math-row="${i}" style="${MATH_ROW_STYLE}">${escapeHTML(row)}</div>`,
    )
    .join('')

  return headLine + body
}

/* ----------------------------------------------------------------------- */
/* "why this color?" trace                                                  */
/* ----------------------------------------------------------------------- */

function renderWhyColorHTML(selection: Selection): string {
  const dE = deltaE_eV(selection.upper, selection.lower)
  const lambda = photonWavelength_nm(dE)
  const inVisibleBand = Number.isFinite(lambda) && lambda >= 380 && lambda <= 780

  const summary = `<summary>why this color?</summary>`
  const listOpen = `<ol data-cockpit-why-list style="margin: 8px 0 0 0; padding-left: 20px; font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.7; color: #2a2a2a;">`
  const listClose = `</ol>`

  // For wavelengths outside the visible band, the color pipeline returns
  // black. Say so plainly rather than rendering a misleading swatch.
  if (!inVisibleBand) {
    const reason = !Number.isFinite(lambda)
      ? 'ΔE → 0 ⇒ λ undefined'
      : lambda < 380
        ? `λ = ${lambda.toFixed(2)} nm is in the UV (< 380 nm)`
        : `λ = ${lambda.toFixed(2)} nm is in the IR (> 780 nm)`
    return (
      summary +
      listOpen +
      `<li data-cockpit-why-step="1">ΔE = ${dE.toFixed(4)} eV  ← E_upper − E_lower</li>` +
      `<li data-cockpit-why-step="2">λ = ${Number.isFinite(lambda) ? lambda.toFixed(3) + ' nm' : '∞'}  ← hc / ΔE</li>` +
      `<li data-cockpit-why-step="3">CIE 1931 chromaticity — (n/a, ${escapeHTML(reason)})</li>` +
      `<li data-cockpit-why-step="4">sRGB — (no visible color outside 380–780 nm)</li>` +
      listClose
    )
  }

  const [X, Y, Z] = wavelengthToXYZ(lambda)
  const sum = X + Y + Z
  const x = sum > 0 ? X / sum : 0
  const y = sum > 0 ? Y / sum : 0
  const hex = wavelengthToHex(lambda)

  const swatch = `<span data-cockpit-color-swatch style="display: inline-block; width: 16px; height: 16px; border: 1px solid #2a2a2a; vertical-align: middle; background: ${hex}; margin-right: 6px;"></span>`

  return (
    summary +
    listOpen +
    `<li data-cockpit-why-step="1">ΔE = ${dE.toFixed(4)} eV  ← E_upper − E_lower</li>` +
    `<li data-cockpit-why-step="2">λ = ${lambda.toFixed(3)} nm  ← hc / ΔE</li>` +
    `<li data-cockpit-why-step="3">CIE 1931 chromaticity (x, y) = (${x.toFixed(4)}, ${y.toFixed(4)})</li>` +
    `<li data-cockpit-why-step="4">${swatch}sRGB = ${hex}</li>` +
    listClose
  )
}

function renderFidelityHTML(report: FidelityReport): string {
  const dot = FIDELITY_DOT_COLOR[report.topKind]
  const head = FIDELITY_LABEL[report.topKind]
  const headLine =
    `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">` +
    `<span aria-hidden="true" style="display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: ${dot};"></span>` +
    `<span style="font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #0a0a0a;">${head}</span>` +
    `</div>`

  const rows = report.rows
    .map((r) => {
      const c = FIDELITY_DOT_COLOR[r.kind]
      return (
        `<div data-cockpit-fidelity-row="${escapeAttr(r.label)}" style="display: flex; align-items: baseline; gap: 8px; padding: 2px 0; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #2a2a2a; line-height: 1.5;">` +
        `<span aria-hidden="true" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${c}; flex-shrink: 0; transform: translateY(-1px);"></span>` +
        `<span style="color: #6b6b6b;">${escapeHTML(r.label)}:</span>` +
        `<span>${escapeHTML(r.detail)}</span>` +
        `</div>`
      )
    })
    .join('')

  return headLine + rows
}

/* ----------------------------------------------------------------------- */
/* tiny escape helpers — DOM strings only.                                  */
/* ----------------------------------------------------------------------- */

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export {
  classifyFidelity,
  deltaE_eV,
  elementName,
  emissionLineFor,
  photonFrequency_Hz,
  photonWavelength_nm,
} from './derive'
export {
  formatEnergy_J,
  formatEnergy_eV,
  formatFrequency_Hz,
  formatTermState,
  formatWavelength_nm,
} from './format'
