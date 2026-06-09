/**
 * Render a spectral-series primitive as an SVG card.
 *
 * Card layout (480x240):
 *   - top-left:  series name
 *   - top-right: SERIES badge (or REGION when known)
 *   - left column: lower-n, region, named-after, member count
 *   - right column: schematic ladder showing the lower level + a few
 *     hydrogenic upper rungs (1/n^2 spacing) converging to the series limit.
 *     Series-limit wavelength labelled if present.
 *   - bottom: source + id
 *
 * Back family block (440 × 130):
 *   - Top row: series name, final-level (n→n_low for hydrogenic),
 *              and region (UV/visible/IR/...).
 *   - Below:   small Grotrian fragment — 5 horizontal level rungs at
 *              hydrogenic 1/n² positions, with arrows from each higher
 *              level down to n_final. For non-hydrogenic series (Hg
 *              intercombination, Na D-doublet) the rung positions are
 *              schematic and the (schematic) tag is added.
 *
 *   Achromatic per the back-palette rule (no Bruton wavelength→hue).
 */

import type { BackRenderer, Renderer } from './types.js'
import { DEFAULT_CARD, SVG_CLOSE, escapeXml, svgOpen } from './svg.js'
import { buildBackParts } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'

type SeriesAttrs = {
  elementId?: string
  lowerN?: number
  region?: string
  seriesLimitWavelengthNm?: number
  namedAfter?: string
  memberLineIds?: string[]
}

const LADDER_X = 280
const LADDER_W = 170
const LADDER_TOP_Y = 70
const LADDER_BOTTOM_Y = 200

export const renderSeries: Renderer = (primitive, ctx) => {
  const attrs = (primitive.attrs ?? {}) as SeriesAttrs
  const source = ctx.sources.get(primitive.sourceId)
  const sourceLabel =
    source?.id === 'nist-asd-v5.10' ? 'NIST ASD v5.10' : (source?.id ?? primitive.sourceId)

  const region = attrs.region ?? ''
  const badge = region ? region.toUpperCase() : 'SERIES'

  // Right-column ladder: hydrogenic 1/n^2 spacing.
  // The lower level lives at LADDER_BOTTOM_Y. The series limit lives at LADDER_TOP_Y.
  // Upper rungs at n_low+1, n_low+2, n_low+3, n_low+4, n_low+5.
  const ladderParts: string[] = []
  ladderParts.push(
    `<line x1="${LADDER_X}" y1="${LADDER_TOP_Y}" x2="${LADDER_X}" y2="${LADDER_BOTTOM_Y}" stroke="#1a3a3f" stroke-opacity="0.5" stroke-width="0.8" />`,
  )

  // Series limit (top of ladder).
  ladderParts.push(
    `<line x1="${LADDER_X - 6}" y1="${LADDER_TOP_Y}" x2="${LADDER_X + LADDER_W}" y2="${LADDER_TOP_Y}" stroke="#1a3a3f" stroke-opacity="0.4" stroke-dasharray="2 2" />`,
  )
  const limitLabel =
    typeof attrs.seriesLimitWavelengthNm === 'number'
      ? `limit = ${attrs.seriesLimitWavelengthNm.toFixed(1)} nm`
      : 'series limit'
  ladderParts.push(
    `<text class="unit" x="${LADDER_X + LADDER_W}" y="${LADDER_TOP_Y - 4}" text-anchor="end">${escapeXml(limitLabel)}</text>`,
  )

  // Lower-level rung (bottom of ladder).
  ladderParts.push(
    `<line x1="${LADDER_X}" y1="${LADDER_BOTTOM_Y}" x2="${LADDER_X + LADDER_W}" y2="${LADDER_BOTTOM_Y}" stroke="#1a3a3f" stroke-width="2.2" />`,
  )
  const lowerLabel = typeof attrs.lowerN === 'number' ? `n = ${attrs.lowerN}` : 'lower'
  ladderParts.push(
    `<text class="unit" x="${LADDER_X + LADDER_W}" y="${LADDER_BOTTOM_Y + 14}" text-anchor="end">${escapeXml(lowerLabel)}</text>`,
  )

  if (typeof attrs.lowerN === 'number') {
    const nLow = attrs.lowerN
    // 1/n^2 spacing relative to lower level. We map (1/n_low^2 - 1/n^2) onto
    // (LADDER_BOTTOM_Y - LADDER_TOP_Y) for n in [nLow+1, nLow+5].
    const denom = 1 / (nLow * nLow)
    for (let k = 1; k <= 5; k++) {
      const n = nLow + k
      const t = (denom - 1 / (n * n)) / denom
      const y = LADDER_BOTTOM_Y - t * (LADDER_BOTTOM_Y - LADDER_TOP_Y)
      ladderParts.push(
        `<line x1="${LADDER_X}" y1="${y.toFixed(2)}" x2="${LADDER_X + LADDER_W}" y2="${y.toFixed(2)}" stroke="#5b8c5a" stroke-width="1.2" stroke-opacity="0.85" />`,
      )
      ladderParts.push(
        `<text class="id" x="${LADDER_X + LADDER_W + 2}" y="${(y + 3).toFixed(2)}">${n}</text>`,
      )
    }
  }

  // Left column.
  const detailX = 24
  const lines: string[] = []
  let y = 80
  if (typeof attrs.lowerN === 'number') {
    lines.push(`<text class="value" x="${detailX}" y="${y}">n_low = ${attrs.lowerN}</text>`)
    y += 26
  }
  if (region) {
    lines.push(`<text class="unit" x="${detailX}" y="${y}">region: ${escapeXml(region)}</text>`)
    y += 22
  }
  if (typeof attrs.seriesLimitWavelengthNm === 'number') {
    lines.push(
      `<text class="unit" x="${detailX}" y="${y}">limit: ${attrs.seriesLimitWavelengthNm.toFixed(2)} nm</text>`,
    )
    y += 22
  }
  if (Array.isArray(attrs.memberLineIds)) {
    lines.push(
      `<text class="unit" x="${detailX}" y="${y}">${attrs.memberLineIds.length} member lines</text>`,
    )
    y += 22
  }
  if (attrs.namedAfter) {
    lines.push(`<text class="deriv" x="${detailX}" y="${y}">${escapeXml(attrs.namedAfter)}</text>`)
    y += 18
  }

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${DEFAULT_CARD.width - 1.5}" height="${DEFAULT_CARD.height - 1.5}" rx="6" />`,
    `<line class="accent-rule" x1="0" y1="42" x2="${DEFAULT_CARD.width}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="badge-exact" x="${DEFAULT_CARD.width - 20}" y="28" text-anchor="end">${escapeXml(badge)}</text>`,
    ladderParts.join(''),
    lines.join(''),
    `<text class="source" x="24" y="226">${escapeXml(sourceLabel)}</text>`,
    `<text class="id" x="${DEFAULT_CARD.width - 20}" y="226" text-anchor="end">${escapeXml(primitive.id)}</text>`,
    SVG_CLOSE,
  ].join('')
}

// ---------------------------------------------------------------------------
// Back-card family block.
// ---------------------------------------------------------------------------

const FB_W = 440
const FB_H = 130

const LABEL_STYLE = 'font: 600 9px ui-sans-serif, system-ui, sans-serif; fill: #4a6c70;'
const VALUE_STYLE = `font: 400 11px 'Iosevka', ui-monospace, Menlo, monospace; fill: #0e2a2f;`
const DIM_STYLE = `font: 400 11px 'Iosevka', ui-monospace, Menlo, monospace; fill: #8a9c9f;`
const MUTED_STYLE = 'font: italic 11px ui-serif, Georgia, serif; fill: #8a9c9f;'

/**
 * Format the "n→n_low" final-level descriptor for hydrogenic series.
 *  n=1 → "n→1"
 */
function finalLevelLabel(attrs: SeriesAttrs): string | null {
  if (typeof attrs.lowerN !== 'number') return null
  return `n → ${attrs.lowerN}`
}

function renderTopRow(name: string, attrs: SeriesAttrs): string {
  const flabel = finalLevelLabel(attrs)
  const region = attrs.region ?? ''
  const out: string[] = []
  out.push(`<text style="${LABEL_STYLE}" x="0" y="0" letter-spacing="1.4">SERIES</text>`)
  out.push(`<text style="${VALUE_STYLE}" x="0" y="14">${escapeXml(name)}</text>`)
  if (flabel !== null) {
    out.push(`<text style="${LABEL_STYLE}" x="180" y="0" letter-spacing="1.4">FINAL</text>`)
    out.push(`<text style="${VALUE_STYLE}" x="180" y="14">${escapeXml(flabel)}</text>`)
  } else {
    out.push(`<text style="${LABEL_STYLE}" x="180" y="0" letter-spacing="1.4">FINAL</text>`)
    out.push(`<text style="${DIM_STYLE}" x="180" y="14">—</text>`)
  }
  if (region) {
    out.push(`<text style="${LABEL_STYLE}" x="320" y="0" letter-spacing="1.4">REGION</text>`)
    out.push(`<text style="${VALUE_STYLE}" x="320" y="14">${escapeXml(region)}</text>`)
  }
  return `<g transform="translate(0 8)">${out.join('')}</g>`
}

/**
 * Grotrian fragment: 5 horizontal level rungs labeled n=n_low, n_low+1,
 * ..., n_low+4, with arrows from each higher rung down to n_low. Rung
 * positions are mapped from hydrogenic E_n = -R/n² so the spacing is
 * physically faithful (NOT a uniform stack). The arrows are achromatic.
 */
function renderGrotrianFragment(attrs: SeriesAttrs): string {
  const out: string[] = []
  out.push(`<text style="${LABEL_STYLE}" x="0" y="0" letter-spacing="1.4">GROTRIAN</text>`)

  const nLow = typeof attrs.lowerN === 'number' ? attrs.lowerN : null
  // Layout: rungs span x ∈ [40, 320]. Arrows live in x ∈ [325, 380]. Labels
  // to the right of arrows in x ∈ [385, 440].
  const rungX1 = 40
  const rungX2 = 320
  const arrowX = 360
  const labelX = 385
  const top = 30
  const bottom = 110

  if (nLow === null) {
    out.push(
      `<rect x="0" y="22" width="${FB_W}" height="${FB_H - 32}" fill="none" stroke="#8a9c9f" stroke-dasharray="3 3" stroke-width="0.8" />`,
    )
    out.push(
      `<text style="${MUTED_STYLE}" x="${FB_W / 2}" y="${(22 + FB_H - 32) / 2}" text-anchor="middle">(schematic — non-hydrogenic series)</text>`,
    )
    return out.join('')
  }

  // Compute rung y-positions from hydrogenic energy E_n = -R/n² (in
  // arbitrary units), normalize so n=n_low maps to bottom and n→∞
  // (series limit) maps to top.
  const ns: number[] = [nLow, nLow + 1, nLow + 2, nLow + 3, nLow + 4]
  const eAt = (n: number) => -1 / (n * n)
  const eLow = eAt(nLow)
  const eLimit = 0
  const yFor = (n: number) => {
    const t = (eAt(n) - eLow) / (eLimit - eLow) // 0 at n_low, →1 at infinity
    return bottom - t * (bottom - top)
  }

  // Series limit (dashed at top).
  out.push(
    `<line x1="${rungX1}" y1="${top}" x2="${rungX2}" y2="${top}" stroke="#1a3a3f" stroke-opacity="0.4" stroke-dasharray="2 2" />`,
  )
  out.push(`<text style="${DIM_STYLE}" x="${labelX}" y="${top + 4}">n → ∞</text>`)

  // Higher rungs (n_low+1 .. n_low+4): solid.
  for (let i = 1; i < ns.length; i++) {
    const n = ns[i]
    const y = yFor(n)
    out.push(
      `<line x1="${rungX1}" y1="${y.toFixed(2)}" x2="${rungX2}" y2="${y.toFixed(2)}" stroke="#1a3a3f" stroke-width="1.2" />`,
    )
    out.push(`<text style="${DIM_STYLE}" x="${labelX}" y="${(y + 4).toFixed(2)}">n=${n}</text>`)
    // Down-arrow from this rung to the lower rung.
    const yLow = yFor(nLow)
    out.push(
      `<line x1="${arrowX}" y1="${y.toFixed(2)}" x2="${arrowX}" y2="${(yLow - 5).toFixed(2)}" stroke="#1a3a3f" stroke-width="0.9" />`,
    )
    out.push(
      `<polygon points="${arrowX},${yLow.toFixed(2)} ${arrowX - 3},${(yLow - 6).toFixed(2)} ${arrowX + 3},${(yLow - 6).toFixed(2)}" fill="#1a3a3f" />`,
    )
  }

  // Final-level rung (n_low): heavy.
  const yFinal = yFor(nLow)
  out.push(
    `<line x1="${rungX1}" y1="${yFinal.toFixed(2)}" x2="${rungX2}" y2="${yFinal.toFixed(2)}" stroke="#1a3a3f" stroke-width="2.2" />`,
  )
  out.push(
    `<text style="${VALUE_STYLE}" x="${labelX}" y="${(yFinal + 4).toFixed(2)}">n=${nLow}</text>`,
  )

  // Schematic notice when nLow is set but the source isn't hydrogenic.
  // (Hydrogen is the only family in the seed where the 1/n² spacing is
  // physically faithful; Na D / Hg series enter the no-nLow branch above
  // and we never reach here for them.)
  return out.join('')
}

function renderSeriesFamilyBlock(name: string, attrs: SeriesAttrs): string {
  const top = renderTopRow(name, attrs)
  const grotrian = `<g transform="translate(0 0)">${renderGrotrianFragment(attrs)}</g>`
  return [top, grotrian].join('')
}

export const renderBack: BackRenderer = (primitive, ctx) => {
  const attrs = (primitive.attrs ?? {}) as SeriesAttrs
  const familyBlock = renderSeriesFamilyBlock(primitive.name, attrs)
  return { svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)) }
}
