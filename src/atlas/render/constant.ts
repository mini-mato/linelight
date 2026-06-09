/**
 * Render a fundamental-physical-constant primitive as an SVG card.
 *
 * Card layout (480x240):
 *   - top-left:  human name
 *   - top-right: badge (EXACT | DERIVED)
 *   - center:    symbol (large), value (mantissa + optional exponent), unit
 *   - bottom-left: derivation prose (italic) when present
 *   - bottom-right: source citation + primitive id
 */

import type { ConstantAttrs, Primitive } from '../types.js'
import type { BackRenderer, Renderer } from './types.js'
import {
  DEFAULT_CARD,
  SVG_CLOSE,
  THIN_SPACE,
  TIMES,
  escapeXml,
  formatValueGrouped,
  prettifyUnit,
  svgOpen,
  toSuperscript,
} from './svg.js'
import { buildBackParts } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'

function isConstantAttrs(a: unknown): a is ConstantAttrs {
  return (
    typeof a === 'object' &&
    a !== null &&
    'value' in a &&
    'unit' in a &&
    typeof (a as ConstantAttrs).value === 'number' &&
    typeof (a as ConstantAttrs).unit === 'string'
  )
}

export const renderConstant: Renderer = (primitive, ctx) => {
  if (!isConstantAttrs(primitive.attrs)) {
    throw new Error(`renderConstant: primitive ${primitive.id} attrs do not satisfy ConstantAttrs`)
  }
  const attrs = primitive.attrs
  const source = ctx.sources.get(primitive.sourceId)
  const sourceLabel = sourceShortLabel(source?.id ?? primitive.sourceId)
  const isDerived = primitive.id.startsWith('constant.derived.')

  const { mantissa, exponent } = formatValueGrouped(attrs.value)
  const prettyUnit = prettifyUnit(attrs.unit)
  const exact = attrs.exact
  const badgeText = exact ? 'EXACT' : 'MEASURED'
  const badgeClass = isDerived ? 'badge-derived' : 'badge-exact'
  const ruleClass = isDerived ? 'accent-rule-derived' : 'accent-rule'

  // Build the value line. We compose it manually so the exponent can use a
  // smaller font via class="exponent" while keeping x-flow predictable.
  // Approximate widths are tuned for Iosevka 22px.
  const valueX = 24
  const valueY = 140
  const charW = 13
  let cursorX = valueX

  const valueParts: string[] = []
  valueParts.push(`<text class="value" x="${valueX}" y="${valueY}">${escapeXml(mantissa)}</text>`)
  cursorX += mantissa.length * charW

  if (exponent !== null) {
    cursorX += 6
    valueParts.push(
      `<text class="value" x="${cursorX}" y="${valueY}">${TIMES}${THIN_SPACE}10</text>`,
    )
    cursorX += 4 * charW
    const expStr =
      exponent < 0 ? `⁻${toSuperscript(String(-exponent))}` : toSuperscript(String(exponent))
    valueParts.push(
      `<text class="exponent" x="${cursorX}" y="${valueY - 10}">${escapeXml(expStr)}</text>`,
    )
    cursorX += expStr.length * 9
  }

  // Unit goes to the right of the value with a thin gap.
  cursorX += 10
  valueParts.push(`<text class="unit" x="${cursorX}" y="${valueY}">${escapeXml(prettyUnit)}</text>`)

  // Optional uncertainty line under the value.
  let uncertaintyLine = ''
  if (!exact && typeof attrs.relativeUncertainty === 'number') {
    const ru = attrs.relativeUncertainty
    const uText = ru === 0 ? '(exact)' : `relative uncertainty: ${ru.toExponential(2)}`
    uncertaintyLine = `<text class="uncertainty" x="${valueX}" y="${valueY + 22}">${escapeXml(uText)}</text>`
  }

  const derivLine = attrs.derivationLatex
    ? `<text class="deriv" x="24" y="200">${escapeXml(stripLatex(attrs.derivationLatex))}</text>`
    : ''

  const symbol = primitive.symbol ?? primitive.id.split('.').pop() ?? ''

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${DEFAULT_CARD.width - 1.5}" height="${DEFAULT_CARD.height - 1.5}" rx="6" />`,
    `<line class="${ruleClass}" x1="0" y1="42" x2="${DEFAULT_CARD.width}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="${badgeClass}" x="${DEFAULT_CARD.width - 20}" y="28" text-anchor="end">${badgeText}</text>`,
    `<text class="symbol" x="24" y="92">${escapeXml(symbol)}</text>`,
    valueParts.join(''),
    uncertaintyLine,
    derivLine,
    `<text class="source" x="24" y="226">${escapeXml(sourceLabel)}</text>`,
    `<text class="id" x="${DEFAULT_CARD.width - 20}" y="226" text-anchor="end">${escapeXml(primitive.id)}</text>`,
    SVG_CLOSE,
  ].join('')
}

/**
 * Strip a small subset of LaTeX so the derivation reads cleanly in SVG <text>.
 * Not a real parser — just removes `\text{...}` wrappers and common backslash
 * commands that aren't math-rendered here.
 */
function stripLatex(s: string): string {
  return s
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\hbar/g, 'ℏ')
    .replace(/\\pi/g, 'π')
    .replace(/\\alpha/g, 'α')
    .replace(/\\,/g, ' ')
    .replace(/\$/g, '')
    .replace(/\\\\/g, ' ')
    .trim()
}

function sourceShortLabel(sourceId: string): string {
  const map: Record<string, string> = {
    'codata-2022': 'CODATA 2022',
    'codata-2018': 'CODATA 2018',
    'nist-asd-v5.10': 'NIST ASD v5.10',
    'nist-dlmf': 'NIST DLMF',
    'cie-015-2018': 'CIE 015:2018',
    'iec-61966-2-1': 'IEC 61966-2-1',
    'ciddor-1996': 'Ciddor 1996',
    'edlen-1966': 'Edlen 1966',
    'coxeter-1973': 'Coxeter 1973',
    'itc-vol-a': 'ITC Vol A',
    'morse-feshbach-1953': 'Morse-Feshbach 1953',
    'sansonetti-martin-2005': 'Sansonetti-Martin 2005',
  }
  return map[sourceId] ?? sourceId.toUpperCase()
}

// ============================================================================
// BACK RENDERER — VISUAL PRIMITIVE PER DIMENSION CLASS
// ============================================================================
//
// The back of a constant card asks "what is the visual representation of
// this constant's *kind*?"  Strategy:
//
//   - Length      → 1D log scale-bar with reference markers (proton, atom, …)
//   - Mass        → 1D log-mass scale with electron / proton / neutron markers
//   - Energy      → 1D log-energy scale (J or eV) with chemical / thermal /
//                   visible-photon / hartree markers
//   - Time        → 1D log-time scale
//   - Frequency   → 1D log-frequency scale
//   - Dimensionless → 1D ratio bar relative to unity, plus an arc when α-like
//   - Wavenumber / cross-section / G / σ_SB / mu_0 / μ_B / etc. → 1D log-
//                   magnitude tick with the unit symbol as the axis label
//   - EXACT (SI 2019 defining): a small "EXACT" geometric badge — these have
//                   zero uncertainty by definition, so a precision bar would
//                   be misleading.
//
// Achromatic palette only:
//   --ink #0e2a2f, --ink-soft #4a6c70, --rule #d8d3c1, --bg #fdfdfd
//
// All reference markers come from the CODATA seed (or are SI-defined) — no
// invented numbers.

type DimensionClass =
  | 'length'
  | 'mass'
  | 'energy'
  | 'time'
  | 'frequency'
  | 'wavenumber'
  | 'dimensionless'
  | 'speed'
  | 'magnetic-moment'
  | 'cross-section'
  | 'permittivity'
  | 'permeability'
  | 'gravitation'
  | 'stefan-boltzmann'
  | 'unknown'

/**
 * Classify a constant by its `attrs.unit` string. Returns 'unknown' when the
 * unit can't be matched — the caller falls back to a generic log-magnitude
 * tick.
 */
function classifyByUnit(unit: string): DimensionClass {
  const u = unit.trim()
  if (u === '') return 'dimensionless'
  if (u === 'm') return 'length'
  if (u === 'kg') return 'mass'
  if (u === 'J' || u === 'eV') return 'energy'
  if (u === 's') return 'time'
  if (u === 'Hz' || u === 's^-1') return 'frequency'
  if (u === 'm^-1') return 'wavenumber'
  if (u === 'm s^-1') return 'speed'
  if (u === 'm^2') return 'cross-section'
  if (u === 'F m^-1') return 'permittivity'
  if (u === 'N A^-2') return 'permeability'
  if (u === 'J T^-1' || u === 'eV T^-1') return 'magnetic-moment'
  if (u === 'm^3 kg^-1 s^-2') return 'gravitation'
  if (u === 'W m^-2 K^-4') return 'stefan-boltzmann'
  if (u === 'C') return 'dimensionless' // charge — no axis worth drawing
  if (u === 'mol^-1') return 'dimensionless'
  if (u === 'J s' || u === 'J K^-1') return 'dimensionless'
  return 'unknown'
}

/** Reference markers for a 1D log scale, all from the CODATA-2022 seed or SI. */
type RefMarker = { value: number; label: string }

const LENGTH_REFS: RefMarker[] = [
  // proton charge radius (CODATA 2018 ≈ 0.8414 fm; we cite Thomson cross
  // section's r_e instead for atomic-physics consistency)
  { value: 2.8179403205e-15, label: 'r_e' }, // classical electron radius
  { value: 2.42631023538e-12, label: 'λ_C' }, // Compton wavelength
  { value: 5.29177210544e-11, label: 'a₀' }, // Bohr radius
  { value: 1e-10, label: 'Å' }, // ångström (SI prefix, exact)
  { value: 1e-9, label: 'nm' },
  { value: 1, label: 'm' },
]

const MASS_REFS: RefMarker[] = [
  { value: 9.1093837139e-31, label: 'm_e' }, // electron mass
  { value: 1.67262192595e-27, label: 'm_p' }, // proton mass
  { value: 1.67492750056e-27, label: 'm_n' }, // neutron mass
  { value: 1, label: 'kg' },
]

const ENERGY_REFS_J: RefMarker[] = [
  { value: 4.359744722206e-18, label: 'E_h' }, // Hartree
  { value: 2.1798723611035e-18, label: 'Ry' }, // Rydberg
  { value: 1.602176634e-19, label: '1 eV' }, // exact since SI 2019
  { value: 1, label: 'J' },
]

const ENERGY_REFS_EV: RefMarker[] = [
  { value: 13.60569312299, label: 'Ry' },
  { value: 27.211386245981, label: 'E_h' },
  { value: 1, label: '1 eV' },
]

const FREQUENCY_REFS: RefMarker[] = [
  { value: 1e8, label: '100 MHz' }, // radio (didactic ref point)
  { value: 5e14, label: 'visible' }, // ~600 nm photon
  { value: 1e18, label: 'X-ray' }, // ~1 keV photon
]

const WAVENUMBER_REFS: RefMarker[] = [
  { value: 100, label: '1 cm⁻¹' },
  { value: 10973731.568157, label: 'R∞' }, // Rydberg constant (CODATA 2022)
]

/**
 * Draw a 1D log-scale bar with markers and the constant's value tagged.
 *
 * Bar is `width` wide, anchored at (x, y). `valueLabel` describes the unit
 * axis ("m", "kg", "J", …). Returns SVG fragment text.
 */
function drawLogScaleBar(opts: {
  x: number
  y: number
  width: number
  axisLabel: string
  value: number
  valueLabel: string
  refs: RefMarker[]
}): string {
  const { x, y, width, axisLabel, value, valueLabel, refs } = opts
  const allValues = [value, ...refs.map((r) => r.value)].filter((v) => v > 0)
  if (allValues.length === 0) return ''
  const logs = allValues.map((v) => Math.log10(v))
  const lMin = Math.floor(Math.min(...logs) - 0.5)
  const lMax = Math.ceil(Math.max(...logs) + 0.5)
  const lRange = lMax - lMin || 1

  const project = (v: number): number => {
    const l = Math.log10(v)
    return x + ((l - lMin) / lRange) * width
  }

  const ink = '#0e2a2f'
  const inkSoft = '#4a6c70'
  const rule = '#d8d3c1'

  const parts: string[] = []

  // Axis line
  parts.push(
    `<line x1="${x}" y1="${y}" x2="${x + width}" y2="${y}" stroke="${ink}" stroke-width="1" />`,
  )

  // Decade ticks
  for (let l = lMin; l <= lMax; l++) {
    const px = x + ((l - lMin) / lRange) * width
    parts.push(
      `<line x1="${px.toFixed(2)}" y1="${y - 3}" x2="${px.toFixed(2)}" y2="${y + 3}" stroke="${rule}" stroke-width="0.5" />`,
    )
    if ((l - lMin) % 2 === 0 || l === lMax) {
      const tickLabel = `10${toSuperscript(String(l))}`
      parts.push(
        `<text x="${px.toFixed(2)}" y="${y + 14}" text-anchor="middle" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="8" fill="${inkSoft}">${escapeXml(tickLabel)}</text>`,
      )
    }
  }

  // Reference markers (above the axis)
  for (const ref of refs) {
    if (ref.value <= 0) continue
    const px = project(ref.value)
    parts.push(
      `<line x1="${px.toFixed(2)}" y1="${y - 8}" x2="${px.toFixed(2)}" y2="${y}" stroke="${inkSoft}" stroke-width="0.5" />`,
      `<text x="${px.toFixed(2)}" y="${y - 11}" text-anchor="middle" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="8" fill="${inkSoft}">${escapeXml(ref.label)}</text>`,
    )
  }

  // The constant's own marker — heavier, below the axis
  if (value > 0) {
    const px = project(value)
    parts.push(
      `<line x1="${px.toFixed(2)}" y1="${y}" x2="${px.toFixed(2)}" y2="${y + 18}" stroke="${ink}" stroke-width="1.5" />`,
      `<circle cx="${px.toFixed(2)}" cy="${y}" r="3" fill="${ink}" />`,
      `<text x="${px.toFixed(2)}" y="${y + 30}" text-anchor="middle" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="9" font-weight="600" fill="${ink}">${escapeXml(valueLabel)}</text>`,
    )
  }

  // Axis label (right of bar)
  parts.push(
    `<text x="${x + width + 6}" y="${y + 4}" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="10" fill="${ink}">${escapeXml(axisLabel)}</text>`,
  )

  return parts.join('')
}

/**
 * Draw a 1D ratio bar showing `value / reference` (typically reference = 1).
 * Width-proportional rendering for values in (0, 1]; for values > 1 we draw
 * the full bar plus an extension annotation. Used for dimensionless ratios.
 */
function drawRatioBar(opts: {
  x: number
  y: number
  width: number
  value: number
  label: string
  reference: number
  referenceLabel: string
}): string {
  const { x, y, width, value, label, reference, referenceLabel } = opts
  const ink = '#0e2a2f'
  const inkSoft = '#4a6c70'
  const rule = '#d8d3c1'
  const ratio = value / reference
  const parts: string[] = []

  // Frame
  parts.push(
    `<rect x="${x}" y="${y}" width="${width}" height="14" fill="none" stroke="${rule}" stroke-width="0.5" />`,
  )

  // Tick at 1.0
  parts.push(
    `<line x1="${x + width}" y1="${y - 2}" x2="${x + width}" y2="${y + 16}" stroke="${inkSoft}" stroke-width="0.5" />`,
    `<text x="${x + width}" y="${y - 4}" text-anchor="end" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="8" fill="${inkSoft}">${escapeXml(referenceLabel)}</text>`,
  )

  if (ratio >= 0 && ratio <= 1) {
    // Sliver bar
    const w = Math.max(1, ratio * width)
    parts.push(`<rect x="${x}" y="${y}" width="${w.toFixed(2)}" height="14" fill="${ink}" />`)
    parts.push(
      `<text x="${x + w + 4}" y="${y + 11}" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="9" fill="${ink}">${escapeXml(label)}</text>`,
    )
  } else if (ratio > 1) {
    // Full bar plus a notch indicating extent.  We render the bar at full
    // width, then a small "× N" annotation, since drawing a 137× bar would
    // overflow the family region.
    parts.push(`<rect x="${x}" y="${y}" width="${width}" height="14" fill="${ink}" />`)
    parts.push(
      `<text x="${x + width + 6}" y="${y + 11}" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="10" fill="${ink}">× ${escapeXml(formatRatioMultiplier(ratio))} ${escapeXml(referenceLabel)}</text>`,
    )
    parts.push(
      `<text x="${x + 4}" y="${y + 11}" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="9" fill="#fdfdfd">${escapeXml(label)}</text>`,
    )
  } else {
    // negative — draw notation only
    parts.push(
      `<text x="${x}" y="${y + 11}" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="9" fill="${ink}">${escapeXml(label)} (signed)</text>`,
    )
  }

  return parts.join('')
}

function formatRatioMultiplier(r: number): string {
  if (r >= 100) return r.toFixed(0)
  if (r >= 10) return r.toFixed(1)
  return r.toFixed(2)
}

/**
 * Draw a circular arc representing a fractional ratio of a unit circle.
 * Used to depict α as "fraction of a circle".
 */
function drawFractionalArc(opts: {
  cx: number
  cy: number
  r: number
  fraction: number
  label: string
}): string {
  const { cx, cy, r, fraction, label } = opts
  const ink = '#0e2a2f'
  const inkSoft = '#4a6c70'
  const rule = '#d8d3c1'

  // Fraction of full circle as an arc starting at top (12 o'clock) going CW.
  const theta = Math.max(0.001, Math.min(0.999, fraction)) * 2 * Math.PI
  const x1 = cx
  const y1 = cy - r
  const x2 = cx + r * Math.sin(theta)
  const y2 = cy - r * Math.cos(theta)
  const largeArc = theta > Math.PI ? 1 : 0

  const parts: string[] = []
  // Reference circle (light)
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${rule}" stroke-width="0.5" />`,
  )
  // Arc
  parts.push(
    `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="none" stroke="${ink}" stroke-width="1.2" />`,
  )
  // Centre dot
  parts.push(`<circle cx="${cx}" cy="${cy}" r="1" fill="${ink}" />`)
  // Label
  parts.push(
    `<text x="${cx}" y="${cy + r + 14}" text-anchor="middle" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="9" fill="${inkSoft}">${escapeXml(label)}</text>`,
  )
  return parts.join('')
}

/**
 * Render the EXACT-by-SI-2019 badge: a small geometric mark indicating
 * the constant has zero defining uncertainty.
 */
function drawExactBadge(x: number, y: number): string {
  const ink = '#0e2a2f'
  // Diamond (rotated square) with "EXACT" caption
  const s = 14
  return [
    `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" transform="rotate(45 ${x} ${y})" fill="${ink}" />`,
    `<text x="${x + 14}" y="${y + 4}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" font-weight="700" letter-spacing="1.5" fill="${ink}">EXACT</text>`,
    `<text x="${x + 14}" y="${y + 18}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="8" letter-spacing="1" fill="#4a6c70">SI 2019 DEFINING</text>`,
  ].join('')
}

/**
 * Format the constant's value compactly for inclusion as a single-line
 * footer under the visual primitive. Mirrors the front's value but smaller.
 */
function formatValueLine(value: number, unit: string): string {
  const { mantissa, exponent } = formatValueGrouped(value)
  const prettyUnit = prettifyUnit(unit)
  let s = mantissa
  if (exponent !== null) {
    const expStr =
      exponent < 0 ? `⁻${toSuperscript(String(-exponent))}` : toSuperscript(String(exponent))
    s += ` ${TIMES} 10${expStr}`
  }
  if (prettyUnit.length > 0) s += `  ${prettyUnit}`
  return s
}

/**
 * Render the family-specific block on the back of a constant card.
 *
 * Visual primitives keyed on the constant's dimension class (inferred from
 * `attrs.unit`). The footer carries the value in a single compact monospace
 * line — the front already renders the value larger; this is reference.
 */
function renderConstantFamilyBlock(primitive: Primitive): string {
  if (!isConstantAttrs(primitive.attrs)) {
    return `<text x="0" y="20" class="muted">(constant attrs missing)</text>`
  }
  const attrs = primitive.attrs
  const familyW = 440
  const ink = '#0e2a2f'
  const inkSoft = '#4a6c70'

  const cls = classifyByUnit(attrs.unit)
  const isSiDefining =
    attrs.exact &&
    typeof attrs.derivationLatex === 'string' &&
    attrs.derivationLatex.includes('SI redefinition')

  const fragments: string[] = []

  // Top-left visual primitive area — vertical centre near y≈100.
  // Below the visual, a footer at y≈260 carrying the value compactly.

  if (isSiDefining) {
    // Geometric "EXACT" badge — these constants have zero uncertainty by
    // definition; a precision bar would be misleading.
    fragments.push(drawExactBadge(familyW / 2 - 50, 70))
    // Plus a minimal context line: "defines …".
    if (typeof attrs.derivationLatex === 'string') {
      const note = attrs.derivationLatex.replace(/\\text\{([^}]*)\}/g, '$1')
      fragments.push(
        `<text x="${familyW / 2}" y="120" text-anchor="middle" font-family="ui-serif, Georgia, serif" font-style="italic" font-size="11" fill="${inkSoft}">${escapeXml(note)}</text>`,
      )
    }
    if (primitive.notes) {
      fragments.push(
        `<text x="${familyW / 2}" y="138" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" fill="${inkSoft}">${escapeXml(primitive.notes)}</text>`,
      )
    }
  } else {
    // Visual primitive based on dimension class.
    const barX = 30
    const barY = 100
    const barW = 340

    if (cls === 'length') {
      const valueLabel = primitive.symbol ?? primitive.id.split('.').pop() ?? ''
      fragments.push(
        drawLogScaleBar({
          x: barX,
          y: barY,
          width: barW,
          axisLabel: 'm',
          value: attrs.value,
          valueLabel,
          refs: LENGTH_REFS,
        }),
      )
      fragments.push(
        `<text x="${barX}" y="${barY - 32}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" font-weight="600" letter-spacing="1.2" fill="${inkSoft}">LENGTH (log m)</text>`,
      )
    } else if (cls === 'mass') {
      const valueLabel = primitive.symbol ?? primitive.id.split('.').pop() ?? ''
      fragments.push(
        drawLogScaleBar({
          x: barX,
          y: barY,
          width: barW,
          axisLabel: 'kg',
          value: attrs.value,
          valueLabel,
          refs: MASS_REFS,
        }),
      )
      fragments.push(
        `<text x="${barX}" y="${barY - 32}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" font-weight="600" letter-spacing="1.2" fill="${inkSoft}">MASS (log kg)</text>`,
      )
    } else if (cls === 'energy') {
      const valueLabel = primitive.symbol ?? primitive.id.split('.').pop() ?? ''
      const useEv = attrs.unit === 'eV'
      fragments.push(
        drawLogScaleBar({
          x: barX,
          y: barY,
          width: barW,
          axisLabel: useEv ? 'eV' : 'J',
          value: attrs.value,
          valueLabel,
          refs: useEv ? ENERGY_REFS_EV : ENERGY_REFS_J,
        }),
      )
      fragments.push(
        `<text x="${barX}" y="${barY - 32}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" font-weight="600" letter-spacing="1.2" fill="${inkSoft}">ENERGY (log ${useEv ? 'eV' : 'J'})</text>`,
      )
    } else if (cls === 'frequency') {
      const valueLabel = primitive.symbol ?? primitive.id.split('.').pop() ?? ''
      fragments.push(
        drawLogScaleBar({
          x: barX,
          y: barY,
          width: barW,
          axisLabel: 'Hz',
          value: attrs.value,
          valueLabel,
          refs: FREQUENCY_REFS,
        }),
      )
      fragments.push(
        `<text x="${barX}" y="${barY - 32}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" font-weight="600" letter-spacing="1.2" fill="${inkSoft}">FREQUENCY (log Hz)</text>`,
      )
    } else if (cls === 'wavenumber') {
      const valueLabel = primitive.symbol ?? primitive.id.split('.').pop() ?? ''
      fragments.push(
        drawLogScaleBar({
          x: barX,
          y: barY,
          width: barW,
          axisLabel: 'm⁻¹',
          value: attrs.value,
          valueLabel,
          refs: WAVENUMBER_REFS,
        }),
      )
      fragments.push(
        `<text x="${barX}" y="${barY - 32}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" font-weight="600" letter-spacing="1.2" fill="${inkSoft}">WAVENUMBER (log m⁻¹)</text>`,
      )
    } else if (cls === 'dimensionless') {
      // Ratio bar.  For α (≈ 0.0073) we draw a sliver; for α⁻¹ (≈ 137) a
      // full bar plus a multiplier.  Add an optional fractional arc when
      // the ratio is in (0,1) — that's the "fraction of a circle" view.
      const valueLabel = `${primitive.symbol ?? ''} ≈ ${attrs.value.toExponential(3)}`
      fragments.push(
        `<text x="${barX}" y="${barY - 32}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" font-weight="600" letter-spacing="1.2" fill="${inkSoft}">DIMENSIONLESS RATIO (vs unity)</text>`,
      )
      fragments.push(
        drawRatioBar({
          x: barX,
          y: barY - 8,
          width: barW,
          value: attrs.value,
          label: valueLabel,
          reference: 1,
          referenceLabel: '= 1',
        }),
      )
      // Fractional-arc visual for α-like constants in (0, 1).
      if (attrs.value > 0 && attrs.value < 1) {
        fragments.push(
          drawFractionalArc({
            cx: barX + 40,
            cy: barY + 60,
            r: 28,
            fraction: attrs.value,
            label: `arc = ${attrs.value.toExponential(2)} × 2π`,
          }),
        )
      }
      // For values > 1 (α⁻¹ etc.), show inverse-arc representation too.
      if (attrs.value > 1) {
        const inverse = 1 / attrs.value
        fragments.push(
          drawFractionalArc({
            cx: barX + 40,
            cy: barY + 60,
            r: 28,
            fraction: inverse,
            label: `1/${primitive.symbol ?? 'x'} ≈ ${inverse.toExponential(2)}`,
          }),
        )
      }
    } else {
      // Fallback: a generic 1D log-magnitude tick on a labelled axis.
      const valueLabel = primitive.symbol ?? primitive.id.split('.').pop() ?? ''
      const refs: RefMarker[] = [{ value: 1, label: '1' }]
      fragments.push(
        drawLogScaleBar({
          x: barX,
          y: barY,
          width: barW,
          axisLabel: prettifyUnit(attrs.unit) || '(unit)',
          value: Math.abs(attrs.value) || 1e-300,
          valueLabel,
          refs,
        }),
      )
      const axisName = labelForUnit(cls, attrs.unit)
      fragments.push(
        `<text x="${barX}" y="${barY - 32}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" font-weight="600" letter-spacing="1.2" fill="${inkSoft}">${escapeXml(axisName)}</text>`,
      )
    }
  }

  // Footer: compact value line at the bottom of the family block.
  const valueText = formatValueLine(attrs.value, attrs.unit)
  fragments.push(
    `<text x="0" y="280" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="12" fill="${ink}">${escapeXml(valueText)}</text>`,
  )

  // Optional uncertainty band on the far right of the footer (only when
  // measured, non-zero).
  if (
    !attrs.exact &&
    typeof attrs.relativeUncertainty === 'number' &&
    attrs.relativeUncertainty > 0
  ) {
    const ru = attrs.relativeUncertainty.toExponential(1)
    fragments.push(
      `<text x="${familyW}" y="280" text-anchor="end" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="10" fill="${inkSoft}">u_r = ${escapeXml(ru)}</text>`,
    )
  } else if (attrs.exact && !isSiDefining) {
    fragments.push(
      `<text x="${familyW}" y="280" text-anchor="end" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" letter-spacing="1.2" fill="${inkSoft}">EXACT (DERIVED)</text>`,
    )
  }

  // Top-right class chip (for orientation when scanning the deck).
  const chipText = chipLabelForClass(cls, isSiDefining)
  if (chipText) {
    fragments.push(
      `<text x="${familyW}" y="14" text-anchor="end" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" letter-spacing="1.4" fill="${inkSoft}">${escapeXml(chipText)}</text>`,
    )
  }

  return fragments.join('')
}

function chipLabelForClass(cls: DimensionClass, exact: boolean): string {
  if (exact) return 'EXACT · SI 2019'
  switch (cls) {
    case 'length':
      return 'LENGTH'
    case 'mass':
      return 'MASS'
    case 'energy':
      return 'ENERGY'
    case 'time':
      return 'TIME'
    case 'frequency':
      return 'FREQUENCY'
    case 'wavenumber':
      return 'WAVENUMBER'
    case 'dimensionless':
      return 'DIMENSIONLESS'
    case 'speed':
      return 'SPEED'
    case 'magnetic-moment':
      return 'MAGNETIC MOMENT'
    case 'cross-section':
      return 'CROSS-SECTION'
    case 'permittivity':
      return 'PERMITTIVITY'
    case 'permeability':
      return 'PERMEABILITY'
    case 'gravitation':
      return 'GRAVITATION'
    case 'stefan-boltzmann':
      return 'STEFAN-BOLTZMANN'
    default:
      return ''
  }
}

function labelForUnit(cls: DimensionClass, unit: string): string {
  if (cls === 'magnetic-moment') return 'MAGNETIC MOMENT (log ' + prettifyUnit(unit) + ')'
  if (cls === 'cross-section') return 'CROSS-SECTION (log m²)'
  if (cls === 'permittivity') return 'PERMITTIVITY (log F·m⁻¹)'
  if (cls === 'permeability') return 'PERMEABILITY (log N·A⁻²)'
  if (cls === 'gravitation') return 'GRAVITATION (log m³·kg⁻¹·s⁻²)'
  if (cls === 'stefan-boltzmann') return 'STEFAN-BOLTZMANN (log W·m⁻²·K⁻⁴)'
  if (cls === 'speed') return 'SPEED (log m·s⁻¹)'
  return 'MAGNITUDE (log ' + (prettifyUnit(unit) || '·') + ')'
}

/**
 * Back-card renderer for the constant family.
 *
 * Surfaces a visual primitive based on the constant's dimension class,
 * with reference markers drawn from the CODATA seed.  No text dump.
 */
export const renderBack: BackRenderer = (primitive, ctx) => {
  const familyBlock = renderConstantFamilyBlock(primitive)
  return { svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)) }
}
