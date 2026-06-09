/**
 * Render a physics-identity primitive as an SVG card.
 *
 * Card layout (480x240):
 *   - top-left:  human name (e.g. "Planck-Einstein relation")
 *   - top-right: IDENTITY badge
 *   - center:    LHS = RHS in large math type
 *   - below:     "where:" line(s) plugging in the canonical numerical values
 *   - bottom:    source citation + primitive id
 *
 * `attrs` is the free-form `Record<string, unknown>` shape (per types.ts the
 * identity family carries no dedicated attrs schema). We read these
 * conventions:
 *   - `equation: string`  — pretty-printed identity (UTF-8 math glyphs)
 *   - `numeric: string`   — the same identity with numbers substituted
 *   - `where: string[]`   — optional list of "h = 6.626×10⁻³⁴ J·s" lines
 *   - `dimension: string` — dimension string (e.g. "energy")
 */

import type { Primitive } from '../types.js'
import type { BackRenderer, Renderer } from './types.js'
import { DEFAULT_CARD, SVG_CLOSE, escapeXml, svgOpen } from './svg.js'
import { buildBackParts } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'

type IdentityAttrs = {
  equation?: string
  numeric?: string
  where?: string[]
  dimension?: string
}

function readAttrs(p: Primitive): IdentityAttrs {
  const a = p.attrs
  if (typeof a !== 'object' || a === null) return {}
  const r = a as Record<string, unknown>
  return {
    equation: typeof r.equation === 'string' ? r.equation : undefined,
    numeric: typeof r.numeric === 'string' ? r.numeric : undefined,
    where: Array.isArray(r.where)
      ? r.where.filter((w): w is string => typeof w === 'string')
      : undefined,
    dimension: typeof r.dimension === 'string' ? r.dimension : undefined,
  }
}

export const renderIdentity: Renderer = (primitive, ctx) => {
  const a = readAttrs(primitive)
  const source = ctx.sources.get(primitive.sourceId)
  const sourceLabel = sourceShortLabel(source?.id ?? primitive.sourceId)
  const equation = a.equation ?? primitive.symbol ?? ''
  const numeric = a.numeric ?? ''
  const where = a.where ?? []

  // Render up to 3 "where:" lines below the numeric form.
  const whereLines: string[] = []
  const baseY = 178
  const lineH = 14
  for (let i = 0; i < Math.min(where.length, 3); i++) {
    whereLines.push(
      `<text class="uncertainty" x="24" y="${baseY + i * lineH}">${escapeXml(where[i])}</text>`,
    )
  }

  const dimensionTag = a.dimension
    ? `<text class="unit" x="${DEFAULT_CARD.width - 20}" y="62" text-anchor="end">${escapeXml(a.dimension)}</text>`
    : ''

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${DEFAULT_CARD.width - 1.5}" height="${DEFAULT_CARD.height - 1.5}" rx="6" />`,
    `<line class="accent-rule" x1="0" y1="42" x2="${DEFAULT_CARD.width}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="badge-exact" x="${DEFAULT_CARD.width - 20}" y="28" text-anchor="end">IDENTITY</text>`,
    dimensionTag,
    `<text class="symbol" x="24" y="100">${escapeXml(equation)}</text>`,
    numeric ? `<text class="value" x="24" y="140">${escapeXml(numeric)}</text>` : '',
    whereLines.join(''),
    `<text class="source" x="24" y="226">${escapeXml(sourceLabel)}</text>`,
    `<text class="id" x="${DEFAULT_CARD.width - 20}" y="226" text-anchor="end">${escapeXml(primitive.id)}</text>`,
    SVG_CLOSE,
  ].join('')
}

function sourceShortLabel(sourceId: string): string {
  const map: Record<string, string> = {
    'codata-2022': 'CODATA 2022',
    'bransden-joachain-2003': 'Bransden-Joachain 2003',
    'nist-dlmf': 'NIST DLMF',
  }
  return map[sourceId] ?? sourceId.toUpperCase()
}

// ============================================================================
// BACK RENDERER — 2D PARAMETRIC PLOTS
// ============================================================================
//
// The back's visual primitive is a 2D parametric plot of the relation when
// it has 1 or 2 free variables.  Achromatic chrome.
//
// Plot dispatch is keyed on `attrs.equation` via simple keyword/symbol
// matching:
//   E = h ν       → linear E vs ν (line through origin)
//   E = h c / λ   → hyperbola E vs λ
//   λ ν = c       → hyperbola ν vs λ (or λ ν product = constant)
//   α = e²/…      → "no parametric plot" (definition of a constant)
//   Ry = ½ m_e c² α²  → "no parametric plot" (definition)
//   a₀ = ℏ/(m_e c α)  → "no parametric plot" (definition)
//   m_p / m_e     → "no parametric plot" (ratio of two constants)
//   ν̃ = E / (h c) → linear ν̃ vs E (proportional)
//   λ = h / p     → 1/x (de Broglie) — log-log
//
// Below the plot, we render the equation LARGE in monospace as the primary
// identity statement.
// CODATA 2022 numerical constants used by the plots
const C_LIGHT = 299792458 // m/s, exact SI 2019
const H_PLANCK = 6.62607015e-34 // J·s, exact SI 2019
const HC_EV_NM = 1239.841984 // eV·nm (derived from h, c, e — all exact)

type PlotKind =
  | 'linear-Eh-nu' // E = h ν
  | 'hyperbola-Ehc-lambda' // E = h c / λ
  | 'hyperbola-c-nu-lambda' // λ ν = c
  | 'linear-nutilde-E' // ν̃ = E / (h c)
  | 'inverse-debroglie' // λ = h / p
  | 'unit-circle-euler' // e^{iπ} + 1 = 0
  | 'pythagorean' // c² = a² + b²
  | 'fma' // F = m a
  | 'none'

/**
 * Detect the plot kind from a primitive's id and equation string.  Order
 * matters — more specific patterns first.
 */
function detectPlotKind(p: Primitive, eq: string): PlotKind {
  const id = p.id
  const e = eq.replace(/\s+/g, '')

  if (id === 'identity.planck-einstein.energy-frequency') return 'linear-Eh-nu'
  if (id === 'identity.planck-einstein.energy-wavelength') return 'hyperbola-Ehc-lambda'
  if (id === 'identity.dispersion.lambda-nu-c') return 'hyperbola-c-nu-lambda'
  if (id === 'identity.energy-wavenumber') return 'linear-nutilde-E'
  if (id === 'identity.de-broglie.wavelength') return 'inverse-debroglie'

  // Fallback keyword/string matching for unknown ids.
  if (/E=hν|E=hv/i.test(e)) return 'linear-Eh-nu'
  if (/E=hc\/λ|E=hc\/lambda/i.test(e)) return 'hyperbola-Ehc-lambda'
  if (/λν=c|λ·ν=c|lambdaν=c|λ\*ν=c|λν=c/i.test(e)) return 'hyperbola-c-nu-lambda'
  if (/ν̃=E\/\(hc\)|nutilde=E\/\(hc\)/i.test(e)) return 'linear-nutilde-E'
  if (/λ=h\/p|lambda=h\/p/i.test(e)) return 'inverse-debroglie'
  if (/e\^\(iπ\)|e\^iπ|e\^\{iπ\}/i.test(e)) return 'unit-circle-euler'
  if (/F=ma/i.test(e)) return 'fma'
  if (/c²=a²\+b²|c\^2=a\^2\+b\^2/i.test(e)) return 'pythagorean'
  return 'none'
}

// ----------------------------------------------------------------------------
// Plot primitives — all ink-only, 2D, occupying the upper part of the family
// region (y ∈ [0, 200]).  The equation displays large at y≈250, "no parametric
// plot" caption at y≈220 when applicable.
// ----------------------------------------------------------------------------

const PLOT_X = 30
const PLOT_Y = 30
const PLOT_W = 380
const PLOT_H = 180

const INK = '#0e2a2f'
const INK_SOFT = '#4a6c70'
const RULE = '#d8d3c1'

type PlotMarker = { x: number; y: number; label: string }

/** Generic axis frame with optional ticks and axis labels. */
function axisFrame(opts: {
  xLabel: string
  yLabel: string
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  xTicks?: Array<{ value: number; label: string }>
  yTicks?: Array<{ value: number; label: string }>
  logX?: boolean
  logY?: boolean
}): string {
  const { xLabel, yLabel, xTicks, yTicks } = opts
  const parts: string[] = []
  // Frame
  parts.push(
    `<rect x="${PLOT_X}" y="${PLOT_Y}" width="${PLOT_W}" height="${PLOT_H}" fill="none" stroke="${RULE}" stroke-width="0.5" />`,
  )
  // Axes
  parts.push(
    `<line x1="${PLOT_X}" y1="${PLOT_Y + PLOT_H}" x2="${PLOT_X + PLOT_W}" y2="${PLOT_Y + PLOT_H}" stroke="${INK}" stroke-width="1" />`,
    `<line x1="${PLOT_X}" y1="${PLOT_Y}" x2="${PLOT_X}" y2="${PLOT_Y + PLOT_H}" stroke="${INK}" stroke-width="1" />`,
  )
  // X label (bottom-right)
  parts.push(
    `<text x="${PLOT_X + PLOT_W}" y="${PLOT_Y + PLOT_H + 22}" text-anchor="end" font-family="ui-serif, Georgia, serif" font-style="italic" font-size="11" fill="${INK_SOFT}">${escapeXml(xLabel)}</text>`,
  )
  // Y label (top-left, above axis)
  parts.push(
    `<text x="${PLOT_X - 4}" y="${PLOT_Y - 6}" text-anchor="end" font-family="ui-serif, Georgia, serif" font-style="italic" font-size="11" fill="${INK_SOFT}">${escapeXml(yLabel)}</text>`,
  )
  // X ticks
  if (xTicks) {
    for (const t of xTicks) {
      const proj = projectX(t.value, opts)
      parts.push(
        `<line x1="${proj.toFixed(2)}" y1="${PLOT_Y + PLOT_H}" x2="${proj.toFixed(2)}" y2="${PLOT_Y + PLOT_H + 3}" stroke="${INK}" stroke-width="0.5" />`,
        `<text x="${proj.toFixed(2)}" y="${PLOT_Y + PLOT_H + 13}" text-anchor="middle" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="8" fill="${INK_SOFT}">${escapeXml(t.label)}</text>`,
      )
    }
  }
  // Y ticks
  if (yTicks) {
    for (const t of yTicks) {
      const proj = projectY(t.value, opts)
      parts.push(
        `<line x1="${PLOT_X - 3}" y1="${proj.toFixed(2)}" x2="${PLOT_X}" y2="${proj.toFixed(2)}" stroke="${INK}" stroke-width="0.5" />`,
        `<text x="${PLOT_X - 5}" y="${(proj + 3).toFixed(2)}" text-anchor="end" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="8" fill="${INK_SOFT}">${escapeXml(t.label)}</text>`,
      )
    }
  }
  return parts.join('')
}

function projectX(v: number, opts: { xMin: number; xMax: number; logX?: boolean }): number {
  if (opts.logX) {
    const lMin = Math.log10(opts.xMin)
    const lMax = Math.log10(opts.xMax)
    return PLOT_X + ((Math.log10(v) - lMin) / (lMax - lMin)) * PLOT_W
  }
  return PLOT_X + ((v - opts.xMin) / (opts.xMax - opts.xMin)) * PLOT_W
}

function projectY(v: number, opts: { yMin: number; yMax: number; logY?: boolean }): number {
  if (opts.logY) {
    const lMin = Math.log10(opts.yMin)
    const lMax = Math.log10(opts.yMax)
    return PLOT_Y + PLOT_H - ((Math.log10(v) - lMin) / (lMax - lMin)) * PLOT_H
  }
  return PLOT_Y + PLOT_H - ((v - opts.yMin) / (opts.yMax - opts.yMin)) * PLOT_H
}

/** Render a parametric curve as an SVG path. */
function curvePath(opts: {
  f: (x: number) => number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  logX?: boolean
  logY?: boolean
  samples?: number
}): string {
  const samples = opts.samples ?? 200
  const segs: string[] = []
  let started = false
  for (let i = 0; i <= samples; i++) {
    let x: number
    if (opts.logX) {
      const lMin = Math.log10(opts.xMin)
      const lMax = Math.log10(opts.xMax)
      x = Math.pow(10, lMin + ((lMax - lMin) * i) / samples)
    } else {
      x = opts.xMin + ((opts.xMax - opts.xMin) * i) / samples
    }
    const y = opts.f(x)
    if (!Number.isFinite(y) || y < opts.yMin || y > opts.yMax) {
      started = false
      continue
    }
    const px = projectX(x, opts).toFixed(2)
    const py = projectY(y, opts).toFixed(2)
    if (!started) {
      segs.push(`M ${px} ${py}`)
      started = true
    } else {
      segs.push(`L ${px} ${py}`)
    }
  }
  return `<path d="${segs.join(' ')}" fill="none" stroke="${INK}" stroke-width="1.4" />`
}

/** Render a marker dot + label at a (data) point. */
function plotMarker(opts: {
  marker: PlotMarker
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  logX?: boolean
  logY?: boolean
}): string {
  const px = projectX(opts.marker.x, opts).toFixed(2)
  const py = projectY(opts.marker.y, opts).toFixed(2)
  return [
    `<circle cx="${px}" cy="${py}" r="2.5" fill="${INK}" />`,
    `<text x="${px}" y="${(parseFloat(py) - 6).toFixed(2)}" text-anchor="middle" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="8" fill="${INK_SOFT}">${escapeXml(opts.marker.label)}</text>`,
  ].join('')
}

// E = h ν — a linear plot through origin with slope h.  Plot in scaled
// units: x ∈ [0, 1.2 PHz], y in eV (slope = h/e ≈ 4.136e-15 eV·s = 4.136
// μeV/GHz; we use eV-per-PHz which is 4.136 eV/PHz).
function plotPlanckEinsteinFrequency(): { svg: string; caption: string } {
  // Use frequency in PHz (10^15 Hz), energy in eV.  Slope = h/e * 1e15 =
  // 4.135667696 eV per PHz (CODATA 2022 derived).  We render up to 2 PHz
  // to comfortably include the hard-X-ray region marker.
  const xMin = 0
  const xMax = 2 // PHz
  const yMin = 0
  const yMax = 8.3 // eV (fits ν ≈ 2 PHz: E = 4.136 * 2 ≈ 8.27 eV)
  const slope = 4.135667696 // eV/PHz, derived from h, e (both exact)
  const opts = { xMin, xMax, yMin, yMax }
  const parts: string[] = []
  parts.push(
    axisFrame({
      xLabel: 'ν (PHz)',
      yLabel: 'E (eV)',
      ...opts,
      xTicks: [
        { value: 0, label: '0' },
        { value: 0.5, label: '0.5' },
        { value: 1, label: '1' },
        { value: 1.5, label: '1.5' },
        { value: 2, label: '2' },
      ],
      yTicks: [
        { value: 0, label: '0' },
        { value: 4, label: '4' },
        { value: 8, label: '8' },
      ],
    }),
  )
  parts.push(curvePath({ f: (x) => slope * x, ...opts }))
  // Canonical markers — visible (~500 THz = 0.5 PHz, ~2.07 eV) and
  // hard-UV (~10 PHz outside frame; pick 1.5 PHz ≈ 6.20 eV instead so it
  // sits on-axis).
  parts.push(
    plotMarker({
      marker: { x: 0.5, y: slope * 0.5, label: 'visible' },
      ...opts,
    }),
    plotMarker({
      marker: { x: 1.5, y: slope * 1.5, label: 'UV' },
      ...opts,
    }),
  )
  return {
    svg: parts.join(''),
    caption: 'slope = h/e = 4.135 667 696 eV·PHz⁻¹  (exact, SI 2019)',
  }
}

// E = h c / λ — hyperbola plot (E in eV, λ in nm).
function plotPlanckEinsteinWavelength(): { svg: string; caption: string } {
  const xMin = 100 // nm (deep UV)
  const xMax = 1500 // nm (near-IR)
  const yMin = 0
  const yMax = HC_EV_NM / xMin // ≈ 12.4 eV at 100 nm
  const opts = { xMin, xMax, yMin, yMax }
  const parts: string[] = []
  parts.push(
    axisFrame({
      xLabel: 'λ (nm)',
      yLabel: 'E (eV)',
      ...opts,
      xTicks: [
        { value: 200, label: '200' },
        { value: 400, label: '400' },
        { value: 700, label: '700' },
        { value: 1000, label: '1000' },
        { value: 1500, label: '1500' },
      ],
      yTicks: [
        { value: 0, label: '0' },
        { value: 4, label: '4' },
        { value: 8, label: '8' },
        { value: 12, label: '12' },
      ],
    }),
  )
  parts.push(curvePath({ f: (x) => HC_EV_NM / x, ...opts }))
  parts.push(
    plotMarker({
      marker: { x: 656.28, y: HC_EV_NM / 656.28, label: 'Hα' },
      ...opts,
    }),
    plotMarker({
      marker: { x: 121.6, y: HC_EV_NM / 121.6, label: 'Lyα' },
      ...opts,
    }),
  )
  return {
    svg: parts.join(''),
    caption: 'h c = 1239.841 984 eV·nm  (exact, SI 2019)',
  }
}

// λ ν = c — hyperbola of ν vs λ.
function plotDispersion(): { svg: string; caption: string } {
  // x: λ in nm (100..1500), y: ν in PHz.  ν = c/λ.  c/(100 nm) ≈ 3.00 PHz.
  const xMin = 100
  const xMax = 1500
  const yMin = 0
  const yMax = C_LIGHT / (100 * 1e-9) / 1e15 // ≈ 3.0 PHz
  const opts = { xMin, xMax, yMin, yMax }
  const parts: string[] = []
  parts.push(
    axisFrame({
      xLabel: 'λ (nm)',
      yLabel: 'ν (PHz)',
      ...opts,
      xTicks: [
        { value: 200, label: '200' },
        { value: 500, label: '500' },
        { value: 1000, label: '1000' },
        { value: 1500, label: '1500' },
      ],
      yTicks: [
        { value: 0, label: '0' },
        { value: 1, label: '1' },
        { value: 2, label: '2' },
        { value: 3, label: '3' },
      ],
    }),
  )
  parts.push(curvePath({ f: (x) => C_LIGHT / (x * 1e-9) / 1e15, ...opts }))
  parts.push(
    plotMarker({
      marker: { x: 500, y: C_LIGHT / 500e-9 / 1e15, label: 'visible' },
      ...opts,
    }),
  )
  return {
    svg: parts.join(''),
    caption: 'c = 299 792 458 m/s  (exact, SI 2019)',
  }
}

// ν̃ = E / (h c).  Linear in (E, ν̃).
function plotEnergyWavenumber(): { svg: string; caption: string } {
  const xMin = 0
  const xMax = 5 // eV
  const yMin = 0
  const yMax = 5 * 8065.543937 // cm⁻¹ at 5 eV
  const opts = { xMin, xMax, yMin, yMax }
  const slope = 8065.543937 // cm⁻¹ per eV, derived from h, c, e (all exact)
  const parts: string[] = []
  parts.push(
    axisFrame({
      xLabel: 'E (eV)',
      yLabel: 'ν̃ (cm⁻¹)',
      ...opts,
      xTicks: [
        { value: 0, label: '0' },
        { value: 1, label: '1' },
        { value: 2, label: '2' },
        { value: 3, label: '3' },
        { value: 5, label: '5' },
      ],
      yTicks: [
        { value: 0, label: '0' },
        { value: 20000, label: '20k' },
        { value: 40000, label: '40k' },
      ],
    }),
  )
  parts.push(curvePath({ f: (x) => slope * x, ...opts }))
  parts.push(
    plotMarker({
      marker: { x: 1, y: slope, label: '1 eV' },
      ...opts,
    }),
  )
  return {
    svg: parts.join(''),
    caption: '1 eV ↔ 8065.543 937 cm⁻¹  (exact, SI 2019)',
  }
}

// λ = h / p — log-log plot (1/x).
function plotDeBroglie(): { svg: string; caption: string } {
  // x: p in kg·m/s (log axis), y: λ in m (log axis).
  // λ_e at 1 eV ≈ 1.226 nm; p = √(2 m_e e · 1V) ≈ 5.4e-25 kg·m/s.
  const xMin = 1e-26
  const xMax = 1e-22
  const yMin = 1e-12
  const yMax = 1e-7
  const opts = { xMin, xMax, yMin, yMax, logX: true, logY: true }
  const parts: string[] = []
  parts.push(
    axisFrame({
      xLabel: 'p (kg·m/s)',
      yLabel: 'λ (m)',
      ...opts,
      xTicks: [
        { value: 1e-26, label: '10⁻²⁶' },
        { value: 1e-24, label: '10⁻²⁴' },
        { value: 1e-22, label: '10⁻²²' },
      ],
      yTicks: [
        { value: 1e-12, label: '10⁻¹²' },
        { value: 1e-10, label: '10⁻¹⁰' },
        { value: 1e-8, label: '10⁻⁸' },
      ],
    }),
  )
  parts.push(curvePath({ f: (p) => H_PLANCK / p, ...opts }))
  // Marker: electron at 1 eV
  parts.push(
    plotMarker({
      marker: { x: 5.4e-25, y: 1.226e-9, label: 'e⁻ @ 1 eV' },
      ...opts,
    }),
  )
  return {
    svg: parts.join(''),
    caption: 'h = 6.626 070 15 × 10⁻³⁴ J·s  (exact, SI 2019)',
  }
}

/**
 * Render the family-specific block on the back of an identity card.
 *
 * Layout:
 *   - rows 1-N (y∈[0..200]): 2D parametric plot when available, else
 *     "(no parametric plot)" caption
 *   - row caption (y≈215):   one-line caption naming the relation's slope/
 *                            constant
 *   - row equation (y≈265):  the equation rendered LARGE in monospace
 *   - top-right tag:         dimension chip
 */
function renderIdentityFamilyBlock(primitive: Primitive): string {
  const a = readAttrs(primitive)
  const familyW = 440
  const equation = a.equation ?? primitive.symbol ?? ''

  const fragments: string[] = []

  // Top-right dimension chip
  if (a.dimension) {
    fragments.push(
      `<text x="${familyW}" y="14" text-anchor="end" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" letter-spacing="1.4" fill="${INK_SOFT}">${escapeXml(a.dimension.toUpperCase())}</text>`,
    )
  }

  const kind = detectPlotKind(primitive, equation)

  let captionLine = ''
  if (kind === 'linear-Eh-nu') {
    const r = plotPlanckEinsteinFrequency()
    fragments.push(r.svg)
    captionLine = r.caption
  } else if (kind === 'hyperbola-Ehc-lambda') {
    const r = plotPlanckEinsteinWavelength()
    fragments.push(r.svg)
    captionLine = r.caption
  } else if (kind === 'hyperbola-c-nu-lambda') {
    const r = plotDispersion()
    fragments.push(r.svg)
    captionLine = r.caption
  } else if (kind === 'linear-nutilde-E') {
    const r = plotEnergyWavenumber()
    fragments.push(r.svg)
    captionLine = r.caption
  } else if (kind === 'inverse-debroglie') {
    const r = plotDeBroglie()
    fragments.push(r.svg)
    captionLine = r.caption
  } else {
    // No parametric plot — render a centred placeholder where the plot
    // would have been, with the (no parametric plot) caption.
    fragments.push(
      `<rect x="${PLOT_X}" y="${PLOT_Y}" width="${PLOT_W}" height="${PLOT_H}" fill="none" stroke="${RULE}" stroke-width="0.5" stroke-dasharray="4 3" />`,
      `<text x="${PLOT_X + PLOT_W / 2}" y="${PLOT_Y + PLOT_H / 2 + 4}" text-anchor="middle" font-family="ui-serif, Georgia, serif" font-style="italic" font-size="12" fill="${INK_SOFT}">(no parametric plot)</text>`,
    )
    // Show the numeric form (if any) below the placeholder.
    if (a.numeric) {
      fragments.push(
        `<text x="${PLOT_X + PLOT_W / 2}" y="${PLOT_Y + PLOT_H / 2 + 22}" text-anchor="middle" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="11" fill="${INK_SOFT}">${escapeXml(a.numeric)}</text>`,
      )
    }
  }

  if (captionLine) {
    fragments.push(
      `<text x="${PLOT_X}" y="${PLOT_Y + PLOT_H + 32}" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="10" fill="${INK_SOFT}">${escapeXml(captionLine)}</text>`,
    )
  }

  // Equation rendered LARGE in monospace at the bottom of the block.
  if (equation) {
    fragments.push(
      `<text x="${familyW / 2}" y="285" text-anchor="middle" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="22" font-weight="500" fill="${INK}">${escapeXml(equation)}</text>`,
    )
  }

  return fragments.join('')
}

/**
 * Back-card renderer for the identity family.
 */
export const renderBack: BackRenderer = (primitive, ctx) => {
  const familyBlock = renderIdentityFamilyBlock(primitive)
  return { svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)) }
}
