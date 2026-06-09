/**
 * Render a multipole-transition-type primitive as an SVG card.
 *
 * Card layout (480x240, FRONT — unchanged):
 *   - top-left:  primitive.name
 *   - top-right: MULTIPOLE badge
 *   - left column: large symbol + lifetime order-of-magnitude
 *   - right column: schematic multipole-geometry icon
 *       E1 → solid arrow (one charge oscillating)
 *       M1 → circular current loop
 *       E2 → two opposing dipoles (quadrupole)
 *       forbidden → dashed arrow with a strike
 *   - bottom:   selection rules typeset (ΔL, ΔS, ΔJ, parity) + source
 *
 * Back family block (440 × 320 — v2):
 *   The front already shows the symbol + multipole geometry icon. The
 *   back lifts the selection rules into a 2D J-pair grid: rows = upper
 *   J, cols = lower J, cells = (J_u, J_l) transitions. Allowed cells
 *   are filled dots; forbidden cells are open; cells that would be
 *   allowed under a relaxed ΔJ rule but barred by a special exception
 *   (J=0 → J=0, ½↔½ for E2) get an `×` glyph.
 *
 *   Below the grid: a parity-glyph (changes / preserved / depends) and
 *   a single compressed line summarizing ΔL, ΔS, parity.
 *
 *   Source of truth: `attrs.selectionRules` from the seed. For
 *   `forbidden` (no canonical rule), the grid is rendered with all
 *   cells open and a "depends on coupling" notice — no allowed cells
 *   are invented.
 */

import type { BackRenderer, Renderer } from './types.js'
import { DEFAULT_CARD, SVG_CLOSE, escapeXml, svgOpen } from './svg.js'
import { buildBackParts } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'

type TransitionTypeAttrs = {
  multipoleOrder?: number | null
  parity?: string
  lifetimeOrderOfMagnitudeS?: number
  selectionRules?: Record<string, string>
  schematic?: boolean
}

function multipoleIcon(id: string): string {
  // Drawn into a 130x110 rect centered around (375, 130).
  const cx = 375
  const cy = 125

  if (id.endsWith('e1')) {
    // Single oscillating charge — arrow.
    return [
      `<line x1="${cx - 40}" y1="${cy}" x2="${cx + 40}" y2="${cy}" stroke="#1a3a3f" stroke-width="2.2" />`,
      `<polygon points="${cx + 40},${cy} ${cx + 28},${cy - 6} ${cx + 28},${cy + 6}" fill="#1a3a3f" />`,
      `<circle cx="${cx - 40}" cy="${cy}" r="5" fill="#1a3a3f" />`,
      `<text class="unit" x="${cx}" y="${cy + 32}" text-anchor="middle">electric dipole</text>`,
    ].join('')
  }

  if (id.endsWith('m1')) {
    // Circular current loop with arrow, plus B-field arrow at center.
    return [
      `<circle cx="${cx}" cy="${cy}" r="32" fill="none" stroke="#1a3a3f" stroke-width="2" />`,
      `<polygon points="${cx + 32},${cy} ${cx + 26},${cy - 6} ${cx + 26},${cy + 6}" fill="#1a3a3f" />`,
      `<line x1="${cx}" y1="${cy + 18}" x2="${cx}" y2="${cy - 18}" stroke="#5b8c5a" stroke-width="2" />`,
      `<polygon points="${cx},${cy - 18} ${cx - 4},${cy - 12} ${cx + 4},${cy - 12}" fill="#5b8c5a" />`,
      `<text class="unit" x="${cx}" y="${cy + 56}" text-anchor="middle">magnetic dipole</text>`,
    ].join('')
  }

  if (id.endsWith('e2')) {
    // Two opposing dipoles — quadrupole.
    return [
      `<line x1="${cx - 36}" y1="${cy - 14}" x2="${cx + 4}" y2="${cy - 14}" stroke="#1a3a3f" stroke-width="2" />`,
      `<polygon points="${cx + 4},${cy - 14} ${cx - 4},${cy - 18} ${cx - 4},${cy - 10}" fill="#1a3a3f" />`,
      `<line x1="${cx + 36}" y1="${cy + 14}" x2="${cx - 4}" y2="${cy + 14}" stroke="#1a3a3f" stroke-width="2" />`,
      `<polygon points="${cx - 4},${cy + 14} ${cx + 4},${cy + 10} ${cx + 4},${cy + 18}" fill="#1a3a3f" />`,
      `<circle cx="${cx - 36}" cy="${cy - 14}" r="3" fill="#1a3a3f" />`,
      `<circle cx="${cx + 36}" cy="${cy + 14}" r="3" fill="#1a3a3f" />`,
      `<text class="unit" x="${cx}" y="${cy + 38}" text-anchor="middle">electric quadrupole</text>`,
    ].join('')
  }

  // Forbidden — dashed arrow with strikethrough.
  return [
    `<line x1="${cx - 40}" y1="${cy}" x2="${cx + 40}" y2="${cy}" stroke="#7c6e3a" stroke-width="2.2" stroke-dasharray="4 3" />`,
    `<polygon points="${cx + 40},${cy} ${cx + 28},${cy - 6} ${cx + 28},${cy + 6}" fill="#7c6e3a" />`,
    `<line x1="${cx - 18}" y1="${cy - 14}" x2="${cx + 18}" y2="${cy + 14}" stroke="#a04a3a" stroke-width="2.2" />`,
    `<text class="unit" x="${cx}" y="${cy + 32}" text-anchor="middle">no first-order multipole</text>`,
  ].join('')
}

function formatRules(rules?: Record<string, string>): string[] {
  if (!rules) return []
  const order = ['deltaJ', 'deltaMJ', 'deltaL', 'deltaS', 'parity', 'deltaN']
  const lines: string[] = []
  for (const key of order) {
    if (rules[key]) {
      lines.push(`${prettyRuleKey(key)}: ${rules[key]}`)
    }
  }
  // Catch any extra rules not in the canonical order.
  for (const k of Object.keys(rules)) {
    if (!order.includes(k)) {
      lines.push(`${prettyRuleKey(k)}: ${rules[k]}`)
    }
  }
  return lines
}

function prettyRuleKey(k: string): string {
  switch (k) {
    case 'deltaJ':
      return 'ΔJ'
    case 'deltaMJ':
      return 'ΔM_J'
    case 'deltaL':
      return 'ΔL'
    case 'deltaS':
      return 'ΔS'
    case 'deltaN':
      return 'Δn'
    case 'parity':
      return 'parity'
    default:
      return k
  }
}

export const renderTransitionType: Renderer = (primitive, ctx) => {
  const attrs = (primitive.attrs ?? {}) as TransitionTypeAttrs
  const source = ctx.sources.get(primitive.sourceId)
  const sourceLabel =
    source?.id === 'bransden-joachain-2003'
      ? 'Bransden–Joachain 2003'
      : (source?.id ?? primitive.sourceId)

  const symbol = primitive.symbol ?? ''
  const badge = symbol.toUpperCase() || 'MULTIPOLE'

  // Selection rules (up to 4 lines so the card stays legible).
  const rules = formatRules(attrs.selectionRules).slice(0, 4)
  const rulesSvg = rules
    .map((line, i) => `<text class="unit" x="24" y="${165 + i * 18}">${escapeXml(line)}</text>`)
    .join('')

  // Lifetime row.
  const lifetime =
    typeof attrs.lifetimeOrderOfMagnitudeS === 'number'
      ? `τ ~ ${formatLifetime(attrs.lifetimeOrderOfMagnitudeS)}`
      : ''
  const lifetimeSvg = lifetime
    ? `<text class="deriv" x="24" y="142">${escapeXml(lifetime)}</text>`
    : ''

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${DEFAULT_CARD.width - 1.5}" height="${DEFAULT_CARD.height - 1.5}" rx="6" />`,
    `<line class="accent-rule-derived" x1="0" y1="42" x2="${DEFAULT_CARD.width}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="badge-derived" x="${DEFAULT_CARD.width - 20}" y="28" text-anchor="end">${escapeXml(badge)}</text>`,
    `<text class="symbol" x="24" y="100">${escapeXml(symbol)}</text>`,
    lifetimeSvg,
    multipoleIcon(primitive.id),
    rulesSvg,
    `<text class="source" x="24" y="226">${escapeXml(sourceLabel)}</text>`,
    `<text class="id" x="${DEFAULT_CARD.width - 20}" y="226" text-anchor="end">${escapeXml(primitive.id)}</text>`,
    SVG_CLOSE,
  ].join('')
}

function formatLifetime(s: number): string {
  if (s >= 1) return `${s.toExponential(0)} s`
  if (s >= 1e-3) return `${(s * 1e3).toFixed(0)} ms`
  if (s >= 1e-6) return `${(s * 1e6).toFixed(0)} μs`
  if (s >= 1e-9) return `${(s * 1e9).toFixed(0)} ns`
  return `${s.toExponential(0)} s`
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

// J values plotted on each axis (rationalized as half-integers × 2 for cell
// indexing). J ∈ {0, 1/2, 1, 3/2, 2, 5/2, 3} → 7 cells per axis.
const J_VALUES = [0, 0.5, 1, 1.5, 2, 2.5, 3]
const J_LABELS = ['0', '½', '1', '³⁄₂', '2', '⁵⁄₂', '3']

// Grid geometry — top half of the family block.
const GRID_LEFT = 70
const GRID_TOP = 30
const GRID_CELL = 28
const GRID_W = GRID_CELL * J_VALUES.length
const GRID_H = GRID_CELL * J_VALUES.length

type CellState = 'allowed' | 'forbidden' | 'special-zero' // open ×

/** Selection-rule classifier per multipole id. */
function classifyCell(id: string, jU: number, jL: number): CellState {
  const dJ = Math.abs(jU - jL)
  const isHalf = (x: number) => Math.abs(x - Math.round(x)) > 0.1

  if (id.endsWith('e1')) {
    // ΔJ = 0, ±1; J=0 → J=0 forbidden.
    if (jU === 0 && jL === 0) return 'special-zero'
    if (dJ === 0 || dJ === 1) return 'allowed'
    return 'forbidden'
  }
  if (id.endsWith('m1')) {
    // ΔJ = 0, ±1; J=0 → J=0 forbidden (same as E1 in J space).
    if (jU === 0 && jL === 0) return 'special-zero'
    if (dJ === 0 || dJ === 1) return 'allowed'
    return 'forbidden'
  }
  if (id.endsWith('e2')) {
    // ΔJ = 0, ±1, ±2; J=0 → J=0 forbidden; J=0 → J=1 forbidden;
    // ½ → ½ forbidden when ΔJ=0.
    if (jU === 0 && jL === 0) return 'special-zero'
    if ((jU === 0 && jL === 1) || (jU === 1 && jL === 0)) return 'special-zero'
    if (isHalf(jU) && jU === 0.5 && isHalf(jL) && jL === 0.5 && dJ === 0) return 'special-zero'
    if (dJ === 0 || dJ === 1 || dJ === 2) return 'allowed'
    return 'forbidden'
  }
  // Forbidden multipole — no canonical first-order rule applies.
  // Render the entire grid as open/forbidden; the legend below explains.
  return 'forbidden'
}

function parityGlyphFor(id: string): { sign: string; label: string } {
  if (id.endsWith('e1')) return { sign: '+ → −', label: 'parity changes' }
  if (id.endsWith('m1')) return { sign: '+ ↔ +', label: 'parity preserved' }
  if (id.endsWith('e2')) return { sign: '+ ↔ +', label: 'parity preserved' }
  return { sign: '?', label: 'depends on coupling' }
}

function compressedRulesLine(rules: Record<string, string> | undefined): string {
  if (!rules) return ''
  const parts: string[] = []
  if (rules.deltaL) parts.push(`ΔL=${rules.deltaL}`)
  if (rules.deltaS) parts.push(`ΔS=${rules.deltaS}`)
  if (rules.parity) parts.push(`parity=${rules.parity}`)
  return parts.join('  ·  ')
}

function renderJPairGrid(id: string): string {
  const out: string[] = []
  out.push(`<text style="${LABEL_STYLE}" x="0" y="20" letter-spacing="1.4">J-PAIR GRID</text>`)

  // Axis labels.
  out.push(
    `<text style="${SMALL_STYLE}" x="${(GRID_LEFT + GRID_W / 2).toFixed(2)}" y="${(GRID_TOP - 10).toFixed(2)}" text-anchor="middle">J_lower</text>`,
  )
  out.push(
    `<text style="${SMALL_STYLE}" transform="translate(${(GRID_LEFT - 38).toFixed(2)} ${(GRID_TOP + GRID_H / 2).toFixed(2)}) rotate(-90)" text-anchor="middle">J_upper</text>`,
  )

  // Column header (J_lower).
  for (let i = 0; i < J_VALUES.length; i++) {
    const cx = GRID_LEFT + i * GRID_CELL + GRID_CELL / 2
    out.push(
      `<text style="${TICK_STYLE}" x="${cx.toFixed(2)}" y="${(GRID_TOP - 2).toFixed(2)}" text-anchor="middle">${escapeXml(J_LABELS[i])}</text>`,
    )
  }
  // Row header (J_upper).
  for (let j = 0; j < J_VALUES.length; j++) {
    const cy = GRID_TOP + j * GRID_CELL + GRID_CELL / 2 + 3
    out.push(
      `<text style="${TICK_STYLE}" x="${(GRID_LEFT - 6).toFixed(2)}" y="${cy.toFixed(2)}" text-anchor="end">${escapeXml(J_LABELS[j])}</text>`,
    )
  }

  // Grid cells.
  for (let j = 0; j < J_VALUES.length; j++) {
    for (let i = 0; i < J_VALUES.length; i++) {
      const x = GRID_LEFT + i * GRID_CELL
      const y = GRID_TOP + j * GRID_CELL
      const jU = J_VALUES[j]
      const jL = J_VALUES[i]
      const state = classifyCell(id, jU, jL)
      // Cell background with a faint hairline.
      out.push(
        `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${GRID_CELL}" height="${GRID_CELL}" fill="none" stroke="#d8d3c1" stroke-width="0.4" />`,
      )
      const cx = x + GRID_CELL / 2
      const cy = y + GRID_CELL / 2
      if (state === 'allowed') {
        out.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="4.2" fill="#1a3a3f" />`)
      } else if (state === 'forbidden') {
        out.push(
          `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="4.2" fill="none" stroke="#8a9c9f" stroke-width="0.7" />`,
        )
      } else {
        // special-zero — open circle with × overlay.
        out.push(
          `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="4.2" fill="none" stroke="#a04a3a" stroke-width="0.7" />`,
        )
        const r = 3.4
        out.push(
          `<line x1="${(cx - r).toFixed(2)}" y1="${(cy - r).toFixed(2)}" x2="${(cx + r).toFixed(2)}" y2="${(cy + r).toFixed(2)}" stroke="#a04a3a" stroke-width="1.1" />`,
        )
        out.push(
          `<line x1="${(cx - r).toFixed(2)}" y1="${(cy + r).toFixed(2)}" x2="${(cx + r).toFixed(2)}" y2="${(cy - r).toFixed(2)}" stroke="#a04a3a" stroke-width="1.1" />`,
        )
      }
    }
  }

  // Legend (right of the grid).
  const legendX = GRID_LEFT + GRID_W + 16
  const legendY0 = GRID_TOP + 6
  const lh = 16
  const lyAllowed = legendY0
  const lyForbidden = legendY0 + lh
  const lySpecial = legendY0 + 2 * lh
  out.push(
    `<circle cx="${legendX.toFixed(2)}" cy="${lyAllowed.toFixed(2)}" r="4.2" fill="#1a3a3f" />`,
  )
  out.push(
    `<text style="${SMALL_STYLE}" x="${(legendX + 10).toFixed(2)}" y="${(lyAllowed + 3).toFixed(2)}">allowed</text>`,
  )
  out.push(
    `<circle cx="${legendX.toFixed(2)}" cy="${lyForbidden.toFixed(2)}" r="4.2" fill="none" stroke="#8a9c9f" stroke-width="0.7" />`,
  )
  out.push(
    `<text style="${SMALL_STYLE}" x="${(legendX + 10).toFixed(2)}" y="${(lyForbidden + 3).toFixed(2)}">forbidden</text>`,
  )
  out.push(
    `<circle cx="${legendX.toFixed(2)}" cy="${lySpecial.toFixed(2)}" r="4.2" fill="none" stroke="#a04a3a" stroke-width="0.7" />`,
  )
  const r = 3.4
  out.push(
    `<line x1="${(legendX - r).toFixed(2)}" y1="${(lySpecial - r).toFixed(2)}" x2="${(legendX + r).toFixed(2)}" y2="${(lySpecial + r).toFixed(2)}" stroke="#a04a3a" stroke-width="1.1" />`,
  )
  out.push(
    `<line x1="${(legendX - r).toFixed(2)}" y1="${(lySpecial + r).toFixed(2)}" x2="${(legendX + r).toFixed(2)}" y2="${(lySpecial - r).toFixed(2)}" stroke="#a04a3a" stroke-width="1.1" />`,
  )
  out.push(
    `<text style="${SMALL_STYLE}" x="${(legendX + 10).toFixed(2)}" y="${(lySpecial + 3).toFixed(2)}">0→0 / ½→½ exception</text>`,
  )

  return out.join('')
}

function renderParityAndCompressedRules(id: string, attrs: TransitionTypeAttrs): string {
  const out: string[] = []
  const parityY = 252
  const rulesY = 282

  const glyph = parityGlyphFor(id)
  out.push(
    `<text style="${LABEL_STYLE}" x="0" y="${(parityY - 14).toFixed(2)}" letter-spacing="1.4">PARITY</text>`,
  )
  out.push(
    `<text style="${VALUE_STYLE}" x="0" y="${parityY.toFixed(2)}">${escapeXml(glyph.sign)}  ${escapeXml(glyph.label)}</text>`,
  )

  const compressed = compressedRulesLine(attrs.selectionRules)
  out.push(
    `<text style="${LABEL_STYLE}" x="0" y="${(rulesY - 14).toFixed(2)}" letter-spacing="1.4">RULES</text>`,
  )
  if (compressed.length > 0) {
    out.push(
      `<text style="${VALUE_STYLE}" x="0" y="${rulesY.toFixed(2)}">${escapeXml(compressed)}</text>`,
    )
  } else {
    out.push(
      `<text style="${MUTED_STYLE}" x="0" y="${rulesY.toFixed(2)}">no canonical first-order rule (depends on coupling)</text>`,
    )
  }

  // Schematic notice (bottom-right) when the seed flags it.
  if (attrs.schematic) {
    out.push(
      `<text style="${MUTED_STYLE}" x="${FB_W}" y="${rulesY.toFixed(2)}" text-anchor="end">(schematic — see source)</text>`,
    )
  }

  return out.join('')
}

function renderTransitionTypeFamilyBlock(id: string, attrs: TransitionTypeAttrs): string {
  const grid = renderJPairGrid(id)
  const tail = renderParityAndCompressedRules(id, attrs)
  return [grid, tail].join('')
}

export const renderBack: BackRenderer = (primitive, ctx) => {
  const attrs = (primitive.attrs ?? {}) as TransitionTypeAttrs
  const familyBlock = renderTransitionTypeFamilyBlock(primitive.id, attrs)
  return { svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)) }
}
