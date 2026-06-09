/**
 * Render a spectral-line primitive as an SVG card.
 *
 * Card layout (480x240, FRONT — unchanged):
 *   - top-left:  primitive.name
 *   - top-right: transition-type badge (E1 / M1 / E2 / FORBIDDEN)
 *   - center:    visible-spectrum strip (380-780 nm) with a vertical tick at
 *                the line's wavelength colored by CIE 1931 → sRGB. UV/IR lines
 *                anchor the tick at the strip edge with a "(UV)" or "(IR)"
 *                marker.
 *   - upper-mid: λ in nm (vacuum)
 *   - lower-mid: transition descriptor
 *   - bottom:    source + id
 *
 * Back family block (440 × 320 — v2):
 *   The front already shows λ as text. The back lifts λ into a visual
 *   primitive: a 1D EM-spectrum strip spanning ~10 decades from γ-rays
 *   (1 nm) to radio (10 m), with the line's λ marked as a tick + bead.
 *   Bands are shaded with achromatic gray-tones; the visible band gets
 *   a faint blue-gray emphasis. The bead is colored via Bruton(λ) only
 *   when λ ∈ [380, 740] nm (the only place the back uses chroma); off-
 *   visible λ render with an achromatic ink bead.
 *
 *   Below the strip, a 2D level-pair diagram shows upper/lower rungs
 *   with a downward photon arrow. Rung positions reflect the linked
 *   levels' energyEV when known; otherwise schematic.
 *
 *   Multipole badge (E1/M1/E2/FORBIDDEN) is shown — it's a derived
 *   classification not visible on the front.
 */

import type { EnergyLevelAttrs, Primitive, SpectralLineAttrs } from '../types.js'
import type { BackRenderContext, BackRenderer, Renderer } from './types.js'
import { wavelengthToHex } from '../../physics/color/index.js'
import { DEFAULT_CARD, SVG_CLOSE, escapeXml, svgOpen } from './svg.js'
import { buildBackParts } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'

function isSpectralLineAttrs(a: unknown): a is SpectralLineAttrs {
  return (
    typeof a === 'object' &&
    a !== null &&
    'wavelengthVacuumNm' in a &&
    typeof (a as SpectralLineAttrs).wavelengthVacuumNm === 'number'
  )
}

const VIS_MIN = 380
const VIS_MAX = 780
const STRIP_X = 24
const STRIP_W = DEFAULT_CARD.width - 48
const STRIP_Y = 100
const STRIP_H = 36

function buildSpectrumStripBackground(): string {
  // Sample the visible band as a series of thin colored rectangles; cheaper
  // than a gradient and avoids defining many <stop>s. 80 samples ≈ 5 nm each.
  const samples = 80
  const step = STRIP_W / samples
  const rects: string[] = []
  for (let i = 0; i < samples; i++) {
    const t = (i + 0.5) / samples
    const lambda = VIS_MIN + t * (VIS_MAX - VIS_MIN)
    const color = wavelengthToHex(lambda, 'cie1931')
    rects.push(
      `<rect x="${(STRIP_X + i * step).toFixed(2)}" y="${STRIP_Y}" width="${(step + 0.6).toFixed(2)}" height="${STRIP_H}" fill="${color}" />`,
    )
  }
  return rects.join('')
}

function tickForWavelength(lambdaNm: number): {
  x: number
  offBand: 'UV' | 'IR' | null
  tickColor: string
} {
  if (lambdaNm < VIS_MIN) {
    return { x: STRIP_X, offBand: 'UV', tickColor: '#7a3fb8' }
  }
  if (lambdaNm > VIS_MAX) {
    return { x: STRIP_X + STRIP_W, offBand: 'IR', tickColor: '#7a2a1a' }
  }
  const t = (lambdaNm - VIS_MIN) / (VIS_MAX - VIS_MIN)
  return {
    x: STRIP_X + t * STRIP_W,
    offBand: null,
    tickColor: wavelengthToHex(lambdaNm, 'cie1931'),
  }
}

function formatLambda(lambdaNm: number): string {
  if (lambdaNm >= 1000) {
    if (lambdaNm >= 1e6) {
      // sub-mm / radio territory — express in mm or m.
      const mm = lambdaNm / 1e6
      if (mm >= 100) return `${(mm / 1000).toFixed(2)} m`
      return `${mm.toFixed(2)} mm`
    }
    return `${(lambdaNm / 1000).toFixed(3)} μm`
  }
  return `${lambdaNm.toFixed(3)} nm`
}

export const renderSpectralLine: Renderer = (primitive, ctx) => {
  if (!isSpectralLineAttrs(primitive.attrs)) {
    throw new Error(
      `renderSpectralLine: primitive ${primitive.id} attrs do not satisfy SpectralLineAttrs`,
    )
  }
  const attrs = primitive.attrs
  const source = ctx.sources.get(primitive.sourceId)
  const sourceLabel =
    source?.id === 'nist-asd-v5.10' ? 'NIST ASD v5.10' : (source?.id ?? primitive.sourceId)

  const lambda = attrs.wavelengthVacuumNm
  const transitionType = attrs.transitionType ?? 'E1'
  const badge = transitionType === 'forbidden' ? 'FORBIDDEN' : transitionType.toUpperCase()
  const tick = tickForWavelength(lambda)

  const strip = buildSpectrumStripBackground()
  const stripFrame = `<rect x="${STRIP_X}" y="${STRIP_Y}" width="${STRIP_W}" height="${STRIP_H}" fill="none" stroke="#1a3a3f" stroke-opacity="0.4" />`

  const tickLine = `<line x1="${tick.x.toFixed(2)}" y1="${STRIP_Y - 6}" x2="${tick.x.toFixed(2)}" y2="${STRIP_Y + STRIP_H + 6}" stroke="${tick.tickColor}" stroke-width="2.2" />`
  const offBandTag = tick.offBand
    ? `<text class="unit" x="${tick.x.toFixed(2)}" y="${STRIP_Y - 10}" text-anchor="${tick.offBand === 'UV' ? 'start' : 'end'}">(${tick.offBand})</text>`
    : ''

  const lambdaLabel = `<text class="value" x="24" y="84">λ = ${escapeXml(formatLambda(lambda))}</text>`

  const transitionDescriptor =
    primitive.name.includes('(') && primitive.name.includes(')')
      ? primitive.name.slice(primitive.name.indexOf('(') + 1, primitive.name.lastIndexOf(')'))
      : (primitive.symbol ?? '')

  const transitionLine = transitionDescriptor
    ? `<text class="unit" x="24" y="178">${escapeXml(transitionDescriptor)}</text>`
    : ''

  const seriesLine = attrs.seriesId
    ? `<text class="deriv" x="24" y="200">${escapeXml(attrs.seriesId)}</text>`
    : ''

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${DEFAULT_CARD.width - 1.5}" height="${DEFAULT_CARD.height - 1.5}" rx="6" />`,
    `<line class="accent-rule" x1="0" y1="42" x2="${DEFAULT_CARD.width}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="badge-exact" x="${DEFAULT_CARD.width - 20}" y="28" text-anchor="end">${badge}</text>`,
    lambdaLabel,
    strip,
    stripFrame,
    tickLine,
    offBandTag,
    transitionLine,
    seriesLine,
    `<text class="source" x="24" y="226">${escapeXml(sourceLabel)}</text>`,
    `<text class="id" x="${DEFAULT_CARD.width - 20}" y="226" text-anchor="end">${escapeXml(primitive.id)}</text>`,
    SVG_CLOSE,
  ].join('')
}

// ---------------------------------------------------------------------------
// Back-card family block (v2 — visual primitive in 440×320).
// ---------------------------------------------------------------------------

const FB_W = 440

const LABEL_STYLE = 'font: 600 9px ui-sans-serif, system-ui, sans-serif; fill: #4a6c70;'
const VALUE_STYLE = `font: 400 11px 'Iosevka', ui-monospace, Menlo, monospace; fill: #0e2a2f;`
const SMALL_STYLE = `font: 400 9px 'Iosevka', ui-monospace, Menlo, monospace; fill: #4a6c70;`
const TICK_STYLE = `font: 400 8px 'Iosevka', ui-monospace, Menlo, monospace; fill: #8a9c9f;`
const MUTED_STYLE = 'font: italic 10px ui-serif, Georgia, serif; fill: #8a9c9f;'
const BADGE_STYLE_EXACT =
  'font: 600 10px ui-sans-serif, system-ui, sans-serif; fill: #5b8c5a; letter-spacing: 1.2px;'
const BADGE_STYLE_DERIVED =
  'font: 600 10px ui-sans-serif, system-ui, sans-serif; fill: #7c6e3a; letter-spacing: 1.2px;'

/**
 * EM-spectrum band table. Boundaries are conventional (IUPAC / ISO 21348
 * for UV; ITU bands for radio). Each band stretches from minNm to maxNm
 * (vacuum). Achromatic fills only — chroma is reserved for the visible
 * bead (Bruton) when the line falls inside [380, 740] nm.
 *
 * The tonal range mirrors the dark-theme audit pattern from
 * `explorations/2026-05-04-structural-color-gallery.html`
 * (rgba(245,245,247, 0.025-0.035)) translated to dark-on-light: low-alpha
 * grayscale fills against the back's #fdfdfd canvas. The visible band
 * uses a faint blue-gray to mark the eye's window.
 */
type Band = { id: string; label: string; minNm: number; maxNm: number; fill: string }

const BANDS: Band[] = [
  { id: 'gamma', label: 'γ', minNm: 1e-3, maxNm: 1e-2, fill: 'rgba(14, 42, 47, 0.05)' },
  { id: 'xray', label: 'X-ray', minNm: 1e-2, maxNm: 10, fill: 'rgba(14, 42, 47, 0.035)' },
  { id: 'euv', label: 'EUV', minNm: 10, maxNm: 121, fill: 'rgba(14, 42, 47, 0.025)' },
  { id: 'uv', label: 'UV', minNm: 121, maxNm: 380, fill: 'rgba(14, 42, 47, 0.04)' },
  { id: 'vis', label: 'vis', minNm: 380, maxNm: 740, fill: 'rgba(74, 108, 130, 0.10)' },
  { id: 'nir', label: 'NIR', minNm: 740, maxNm: 2500, fill: 'rgba(14, 42, 47, 0.025)' },
  { id: 'mir', label: 'MIR', minNm: 2500, maxNm: 25000, fill: 'rgba(14, 42, 47, 0.04)' },
  { id: 'fir', label: 'FIR', minNm: 25000, maxNm: 1e6, fill: 'rgba(14, 42, 47, 0.025)' },
  { id: 'mwave', label: 'μwave', minNm: 1e6, maxNm: 1e9, fill: 'rgba(14, 42, 47, 0.04)' },
  { id: 'radio', label: 'radio', minNm: 1e9, maxNm: 1e10, fill: 'rgba(14, 42, 47, 0.025)' },
]

const STRIP_BACK_X = 0
const STRIP_BACK_W = FB_W
const STRIP_BACK_Y = 30
const STRIP_BACK_H = 56
const LOG_MIN = -3 // log10(0.001 nm)  = γ floor
const LOG_MAX = 10 // log10(1e10 nm) = 10 m radio ceiling

function logToX(logNm: number): number {
  const t = (logNm - LOG_MIN) / (LOG_MAX - LOG_MIN)
  return STRIP_BACK_X + Math.max(0, Math.min(1, t)) * STRIP_BACK_W
}

function bandLabelForLambda(lambdaNm: number): string {
  for (const b of BANDS) {
    if (lambdaNm >= b.minNm && lambdaNm < b.maxNm) {
      if (b.id === 'vis') return 'visible'
      return b.label
    }
  }
  return '—'
}

/** Build the 1D log-λ EM spectrum strip (top half of family block). */
function renderEMSpectrumStrip(lambdaNm: number): string {
  const out: string[] = []
  out.push(`<text style="${LABEL_STYLE}" x="0" y="14" letter-spacing="1.4">EM SPECTRUM</text>`)

  // Band shading.
  for (const band of BANDS) {
    const x1 = logToX(Math.log10(band.minNm))
    const x2 = logToX(Math.log10(band.maxNm))
    out.push(
      `<rect x="${x1.toFixed(2)}" y="${STRIP_BACK_Y}" width="${(x2 - x1).toFixed(2)}" height="${STRIP_BACK_H}" fill="${band.fill}" />`,
    )
    // Band label centered, only if there's room (>22px).
    if (x2 - x1 > 22) {
      out.push(
        `<text style="${SMALL_STYLE}" x="${((x1 + x2) / 2).toFixed(2)}" y="${STRIP_BACK_Y + STRIP_BACK_H / 2 + 3}" text-anchor="middle" opacity="0.55">${escapeXml(band.label)}</text>`,
      )
    }
  }

  // Strip frame.
  out.push(
    `<rect x="${STRIP_BACK_X}" y="${STRIP_BACK_Y}" width="${STRIP_BACK_W}" height="${STRIP_BACK_H}" fill="none" stroke="#1a3a3f" stroke-opacity="0.35" stroke-width="0.6" />`,
  )

  // Decade tick marks along the bottom edge.
  for (let p = LOG_MIN; p <= LOG_MAX; p++) {
    const x = logToX(p)
    out.push(
      `<line x1="${x.toFixed(2)}" y1="${STRIP_BACK_Y + STRIP_BACK_H}" x2="${x.toFixed(2)}" y2="${STRIP_BACK_Y + STRIP_BACK_H + 3}" stroke="#1a3a3f" stroke-opacity="0.5" stroke-width="0.6" />`,
    )
    // Label every 2nd decade for legibility: 10⁻²ⁿᵐ etc.
    if (p % 2 === 0 || p === LOG_MIN || p === LOG_MAX) {
      const lbl = decadeLabel(p)
      out.push(
        `<text style="${TICK_STYLE}" x="${x.toFixed(2)}" y="${STRIP_BACK_Y + STRIP_BACK_H + 12}" text-anchor="middle">${escapeXml(lbl)}</text>`,
      )
    }
  }

  // Tick + bead at λ.
  const lineX = logToX(Math.log10(lambdaNm))
  const inVisible = lambdaNm >= 380 && lambdaNm <= 740
  // Bruton color ONLY in the visible band; otherwise achromatic ink.
  const beadColor = inVisible ? wavelengthToHex(lambdaNm, 'bruton1996') : '#0e2a2f'
  // Tick line spans the strip vertically, with a small overshoot.
  out.push(
    `<line x1="${lineX.toFixed(2)}" y1="${STRIP_BACK_Y - 4}" x2="${lineX.toFixed(2)}" y2="${STRIP_BACK_Y + STRIP_BACK_H + 4}" stroke="${beadColor}" stroke-width="1.6" />`,
  )
  // Bead just above the strip.
  out.push(
    `<circle cx="${lineX.toFixed(2)}" cy="${STRIP_BACK_Y - 6}" r="3.5" fill="${beadColor}" stroke="#fdfdfd" stroke-width="0.8" />`,
  )

  // Annotation: λ value · band name (anchored to the bead, but clamped to
  // the strip width so it doesn't overflow the family block).
  const bandName = bandLabelForLambda(lambdaNm)
  const annotation = `${formatLambda(lambdaNm)} · ${bandName}`
  // Anchor the text at the bead; pick start/middle/end based on x position.
  let anchor: 'start' | 'middle' | 'end' = 'middle'
  let textX = lineX
  if (lineX < 50) {
    anchor = 'start'
    textX = lineX + 6
  } else if (lineX > FB_W - 50) {
    anchor = 'end'
    textX = lineX - 6
  }
  out.push(
    `<text style="${VALUE_STYLE}" x="${textX.toFixed(2)}" y="${STRIP_BACK_Y - 14}" text-anchor="${anchor}">${escapeXml(annotation)}</text>`,
  )

  return out.join('')
}

function decadeLabel(p: number): string {
  // p = log10(λ in nm). Convert to a friendlier unit per decade.
  if (p <= 0) return `10${superscript(p)} nm`
  if (p <= 3) return `10${superscript(p)} nm`
  if (p <= 6) return `10${superscript(p - 3)} μm`
  if (p <= 9) return `10${superscript(p - 6)} mm`
  return `10${superscript(p - 9)} m`
}

function superscript(n: number): string {
  const map: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
    '-': '⁻',
    '+': '⁺',
  }
  return [...String(n)].map((c) => map[c] ?? c).join('')
}

// --- Bottom half: 2D level-pair diagram with photon arrow -------------------

const PAIR_TOP = 130
const PAIR_BOTTOM = 290
const PAIR_X1 = 70
const PAIR_X2 = 230

function badgeForType(type: SpectralLineAttrs['transitionType']): {
  label: string
  style: string
} {
  if (type === 'forbidden') return { label: 'FORBIDDEN', style: BADGE_STYLE_DERIVED }
  if (type === 'M1' || type === 'E2') return { label: type, style: BADGE_STYLE_DERIVED }
  return { label: type ?? 'E1', style: BADGE_STYLE_EXACT }
}

function resolveLevelEnergyEV(ctx: BackRenderContext, levelId: string | undefined): number | null {
  if (!levelId) return null
  const level = ctx.primitives.get(levelId)
  if (!level) return null
  const a = level.attrs as EnergyLevelAttrs
  return typeof a.energyEV === 'number' ? a.energyEV : null
}

function shortenLevelId(id: string): string {
  return id.replace(/^energy-level\./, '')
}

function renderLevelPair(
  attrs: SpectralLineAttrs,
  ctx: BackRenderContext,
  badge: { label: string; style: string },
): string {
  const out: string[] = []
  out.push(
    `<text style="${LABEL_STYLE}" x="0" y="${PAIR_TOP - 10}" letter-spacing="1.4">LEVEL PAIR</text>`,
  )
  // Multipole badge in the top-right of the bottom half.
  out.push(
    `<text style="${badge.style}" x="${FB_W}" y="${PAIR_TOP - 10}" text-anchor="end">${escapeXml(badge.label)}</text>`,
  )

  const eUpper = resolveLevelEnergyEV(ctx, attrs.upperLevelId)
  const eLower = resolveLevelEnergyEV(ctx, attrs.lowerLevelId)

  let upperY: number
  let lowerY: number
  let isSchematic: boolean
  let energyAxisLabel = ''

  const innerTop = PAIR_TOP + 18
  const innerBottom = PAIR_BOTTOM - 24

  if (eUpper !== null && eLower !== null && Math.abs(eUpper - eLower) > 1e-9) {
    // Map [E_min, E_max] to [innerBottom, innerTop] (higher energy at top).
    const eMin = Math.min(eUpper, eLower)
    const eMax = Math.max(eUpper, eLower)
    const span = eMax - eMin
    // Pad the displayed energy range slightly so rungs don't sit on edges.
    const padFrac = 0.15
    const eHigh = eMax + span * padFrac
    const eLow = eMin - span * padFrac
    const range = eHigh - eLow
    const yOf = (e: number) => innerBottom - ((e - eLow) / range) * (innerBottom - innerTop)
    upperY = yOf(Math.max(eUpper, eLower))
    lowerY = yOf(Math.min(eUpper, eLower))
    isSchematic = false
    energyAxisLabel = `ΔE = ${(eMax - eMin).toFixed(4)} eV`
  } else {
    upperY = innerTop + 10
    lowerY = innerBottom - 10
    isSchematic = true
  }

  const stroke = isSchematic ? '#b89a3a' : '#1a3a3f'

  // Energy axis (vertical) on the left edge of the diagram, only when known.
  if (!isSchematic) {
    out.push(
      `<line x1="${PAIR_X1 - 16}" y1="${innerTop}" x2="${PAIR_X1 - 16}" y2="${innerBottom}" stroke="#1a3a3f" stroke-opacity="0.35" stroke-width="0.6" />`,
    )
    out.push(
      `<polygon points="${PAIR_X1 - 16},${innerTop - 5} ${PAIR_X1 - 19},${innerTop} ${PAIR_X1 - 13},${innerTop}" fill="#1a3a3f" fill-opacity="0.4" />`,
    )
    out.push(
      `<text style="${TICK_STYLE}" x="${PAIR_X1 - 22}" y="${innerTop + 4}" text-anchor="end">E</text>`,
    )
  }

  // Rungs (upper, lower).
  out.push(
    `<line x1="${PAIR_X1}" y1="${upperY.toFixed(2)}" x2="${PAIR_X2}" y2="${upperY.toFixed(2)}" stroke="${stroke}" stroke-width="2.2" />`,
  )
  out.push(
    `<line x1="${PAIR_X1}" y1="${lowerY.toFixed(2)}" x2="${PAIR_X2}" y2="${lowerY.toFixed(2)}" stroke="${stroke}" stroke-width="2.2" />`,
  )

  // Rung labels: id + energyEV (when known) to the right of each rung.
  const upperLabel = shortenLevelId(attrs.upperLevelId ?? 'upper')
  const lowerLabel = shortenLevelId(attrs.lowerLevelId ?? 'lower')
  const upperText = eUpper !== null ? `${upperLabel}  ${eUpper.toFixed(4)} eV` : `${upperLabel}`
  const lowerText = eLower !== null ? `${lowerLabel}  ${eLower.toFixed(4)} eV` : `${lowerLabel}`
  out.push(
    `<text style="${VALUE_STYLE}" x="${PAIR_X2 + 8}" y="${(upperY + 4).toFixed(2)}">${escapeXml(upperText)}</text>`,
  )
  out.push(
    `<text style="${VALUE_STYLE}" x="${PAIR_X2 + 8}" y="${(lowerY + 4).toFixed(2)}">${escapeXml(lowerText)}</text>`,
  )

  // Photon arrow (downward, emission). Shaft at the midpoint of the rungs.
  const arrowX = (PAIR_X1 + PAIR_X2) / 2
  out.push(
    `<line x1="${arrowX}" y1="${(upperY + 4).toFixed(2)}" x2="${arrowX}" y2="${(lowerY - 7).toFixed(2)}" stroke="${stroke}" stroke-width="1.4" />`,
  )
  out.push(
    `<polygon points="${arrowX},${lowerY.toFixed(2)} ${arrowX - 4},${(lowerY - 7).toFixed(2)} ${arrowX + 4},${(lowerY - 7).toFixed(2)}" fill="${stroke}" />`,
  )
  out.push(
    `<text style="${SMALL_STYLE}" x="${arrowX + 6}" y="${((upperY + lowerY) / 2 + 3).toFixed(2)}">γ (emission)</text>`,
  )

  if (isSchematic) {
    out.push(
      `<text style="${MUTED_STYLE}" x="${FB_W}" y="${PAIR_BOTTOM.toFixed(2)}" text-anchor="end">(schematic — level energies absent)</text>`,
    )
  } else {
    out.push(
      `<text style="${SMALL_STYLE}" x="${FB_W}" y="${PAIR_BOTTOM.toFixed(2)}" text-anchor="end">${escapeXml(energyAxisLabel)}</text>`,
    )
  }

  return out.join('')
}

function renderSpectralLineFamilyBlock(
  primitive: Primitive,
  attrs: SpectralLineAttrs,
  ctx: BackRenderContext,
): string {
  const badge = badgeForType(attrs.transitionType)
  const top = renderEMSpectrumStrip(attrs.wavelengthVacuumNm)
  const bottom = renderLevelPair(attrs, ctx, badge)
  void primitive
  return [top, bottom].join('')
}

export const renderBack: BackRenderer = (primitive, ctx) => {
  if (!isSpectralLineAttrs(primitive.attrs)) {
    throw new Error(
      `renderBack[spectral-line]: primitive ${primitive.id} attrs do not satisfy SpectralLineAttrs`,
    )
  }
  const familyBlock = renderSpectralLineFamilyBlock(primitive, primitive.attrs, ctx)
  return { svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)) }
}
