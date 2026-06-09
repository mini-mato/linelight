/**
 * Render a unit primitive as an SVG card.
 *
 * Card layout (480x240):
 *   - top-left:  human name ("electronvolt")
 *   - top-right: UNIT badge
 *   - center:    unit symbol (large)
 *   - mid-line:  "energy : M L² T⁻²" (dimension string)
 *   - below:     conversion table (1 eV = 1.602176634×10⁻¹⁹ J, etc.)
 *   - bottom:    source citation + primitive id
 *
 * Reads `attrs` per the UnitAttrs shape (`dimensionString`, `siFactor?`,
 * `reciprocal?`) plus the convention:
 *   - `quantity?: string` ("energy", "length")  — pretty quantity name
 *   - `conversions?: { expression: string; note?: string }[]`
 *
 * `quantity` and `conversions` are stored alongside UnitAttrs in the JSON;
 * since UnitAttrs allows the catch-all `Record<string, unknown>` form via
 * `AnyAttrs`, we read them defensively without widening the shared type.
 */

import type { Primitive, UnitAttrs } from '../types.js'
import type { BackRenderer, Renderer } from './types.js'
import {
  DEFAULT_CARD,
  SVG_CLOSE,
  TIMES,
  escapeXml,
  formatValueGrouped,
  prettifyUnit,
  svgOpen,
  toSuperscript,
} from './svg.js'
import { buildBackParts } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'

type UnitDisplayAttrs = UnitAttrs & {
  quantity?: string
  conversions?: Array<{ expression: string; note?: string }>
}

function readAttrs(p: Primitive): UnitDisplayAttrs {
  const a = p.attrs
  if (typeof a !== 'object' || a === null) return { dimensionString: '' }
  const r = a as Record<string, unknown>
  const conversions = Array.isArray(r.conversions)
    ? (r.conversions as unknown[])
        .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
        .map((c) => ({
          expression: typeof c.expression === 'string' ? c.expression : '',
          note: typeof c.note === 'string' ? c.note : undefined,
        }))
        .filter((c) => c.expression.length > 0)
    : undefined
  return {
    dimensionString: typeof r.dimensionString === 'string' ? r.dimensionString : '',
    siFactor: typeof r.siFactor === 'number' ? r.siFactor : undefined,
    reciprocal: typeof r.reciprocal === 'boolean' ? r.reciprocal : undefined,
    quantity: typeof r.quantity === 'string' ? r.quantity : undefined,
    conversions,
  }
}

export const renderUnit: Renderer = (primitive, ctx) => {
  const a = readAttrs(primitive)
  const source = ctx.sources.get(primitive.sourceId)
  const sourceLabel = sourceShortLabel(source?.id ?? primitive.sourceId)
  const symbol = primitive.symbol ?? primitive.id.split('.').pop() ?? ''
  const dimLine = a.quantity
    ? `${a.quantity} : ${prettifyUnit(a.dimensionString)}`
    : prettifyUnit(a.dimensionString)

  const conversions = (a.conversions ?? []).slice(0, 3)
  const convLines: string[] = []
  const baseY = 160
  const lineH = 18
  for (let i = 0; i < conversions.length; i++) {
    const text = conversions[i].expression
    convLines.push(
      `<text class="value" x="24" y="${baseY + i * lineH}" font-size="13">${escapeXml(text)}</text>`,
    )
  }

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${DEFAULT_CARD.width - 1.5}" height="${DEFAULT_CARD.height - 1.5}" rx="6" />`,
    `<line class="accent-rule" x1="0" y1="42" x2="${DEFAULT_CARD.width}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="badge-exact" x="${DEFAULT_CARD.width - 20}" y="28" text-anchor="end">UNIT</text>`,
    `<text class="symbol" x="24" y="100">${escapeXml(prettifyUnit(symbol))}</text>`,
    `<text class="unit" x="24" y="128">${escapeXml(dimLine)}</text>`,
    convLines.join(''),
    `<text class="source" x="24" y="226">${escapeXml(sourceLabel)}</text>`,
    `<text class="id" x="${DEFAULT_CARD.width - 20}" y="226" text-anchor="end">${escapeXml(primitive.id)}</text>`,
    SVG_CLOSE,
  ].join('')
}

function sourceShortLabel(sourceId: string): string {
  const map: Record<string, string> = {
    'codata-2022': 'CODATA 2022',
    'nist-dlmf': 'NIST DLMF',
    'bransden-joachain-2003': 'Bransden-Joachain 2003',
  }
  return map[sourceId] ?? sourceId.toUpperCase()
}

// ============================================================================
// BACK RENDERER — 7-AXIS DIMENSION FINGERPRINT
// ============================================================================
//
// The back's visual primitive is the unit's 7-axis dimension exponent
// vector, rendered as a horizontal strip of cells labelled with the SI
// base-dimension symbols:
//
//   M  (mass), L  (length), T  (time), Θ  (temperature),
//   I  (current), N  (amount), J  (luminous-intensity)
//
// Each cell shows the integer/fraction exponent. Achromatic chrome:
//   - positive exponents render dark (filled background)
//   - zero exponents render dimmed (empty cell)
//   - negative exponents render dashed (hatched / outlined)
//
// Below the dimension vector: a single row showing the SI factor and a
// one-line decomposition (e.g. `kg·m²·s⁻²`).

type DimensionVector = {
  M: number
  L: number
  T: number
  Theta: number
  I: number
  N: number
  J: number
}

const ZERO_VECTOR: DimensionVector = { M: 0, L: 0, T: 0, Theta: 0, I: 0, N: 0, J: 0 }

/**
 * Parse a dimension string like "M L^2 T^-2" or "L^-1" into a 7-axis vector.
 * Returns null when parsing fails (caller falls back to verbatim rendering).
 *
 * Recognised tokens (case-sensitive):
 *   M, L, T, Θ (or Theta), I, N, J
 *   Each may be followed by `^<int>` or `^-<int>`. Bare token = exponent 1.
 *   Tokens are whitespace-separated (or middle-dot–separated).
 */
function parseDimensionString(s: string): DimensionVector | null {
  if (typeof s !== 'string' || s.trim().length === 0) return { ...ZERO_VECTOR }
  const v: DimensionVector = { ...ZERO_VECTOR }
  // Normalise separators: "·" → " ", multiple spaces → single
  const normalised = s.replace(/·/g, ' ').replace(/\s+/g, ' ').trim()
  const tokens = normalised.split(' ')
  const tokenRe = /^(M|L|T|Θ|Theta|I|N|J)(?:\^(-?\d+))?$/

  for (const tok of tokens) {
    if (tok === '') continue
    const m = tok.match(tokenRe)
    if (!m) return null
    const sym = m[1] === 'Theta' ? 'Θ' : m[1]
    const exp = m[2] !== undefined ? parseInt(m[2], 10) : 1
    if (!Number.isFinite(exp)) return null
    switch (sym) {
      case 'M':
        v.M += exp
        break
      case 'L':
        v.L += exp
        break
      case 'T':
        v.T += exp
        break
      case 'Θ':
        v.Theta += exp
        break
      case 'I':
        v.I += exp
        break
      case 'N':
        v.N += exp
        break
      case 'J':
        v.J += exp
        break
      default:
        return null
    }
  }
  return v
}

/**
 * Render the 7-cell dimension fingerprint. Each cell is `cellW` wide, with
 * the symbol caption above and the exponent value inside.
 */
function drawDimensionFingerprint(opts: {
  x: number
  y: number
  width: number
  vector: DimensionVector
}): string {
  const { x, y, width, vector } = opts
  const ink = '#0e2a2f'
  const inkSoft = '#4a6c70'
  const rule = '#d8d3c1'
  const cellW = width / 7
  const cellH = 56

  type Axis = { key: keyof DimensionVector; label: string; longLabel: string }
  const axes: Axis[] = [
    { key: 'M', label: 'M', longLabel: 'mass' },
    { key: 'L', label: 'L', longLabel: 'length' },
    { key: 'T', label: 'T', longLabel: 'time' },
    { key: 'Theta', label: 'Θ', longLabel: 'temp.' },
    { key: 'I', label: 'I', longLabel: 'current' },
    { key: 'N', label: 'N', longLabel: 'amount' },
    { key: 'J', label: 'J', longLabel: 'lumin.' },
  ]

  const parts: string[] = []
  for (let i = 0; i < axes.length; i++) {
    const a = axes[i]
    const exp = vector[a.key]
    const cx = x + i * cellW
    const cy = y

    // Cell rendering: positive→dark fill, zero→empty (dimmed), negative→
    // dashed outline.
    if (exp > 0) {
      parts.push(
        `<rect x="${cx.toFixed(2)}" y="${cy}" width="${cellW.toFixed(2)}" height="${cellH}" fill="${ink}" stroke="${ink}" stroke-width="0.5" />`,
      )
    } else if (exp < 0) {
      parts.push(
        `<rect x="${cx.toFixed(2)}" y="${cy}" width="${cellW.toFixed(2)}" height="${cellH}" fill="none" stroke="${ink}" stroke-width="1" stroke-dasharray="3 2" />`,
      )
    } else {
      parts.push(
        `<rect x="${cx.toFixed(2)}" y="${cy}" width="${cellW.toFixed(2)}" height="${cellH}" fill="none" stroke="${rule}" stroke-width="0.5" />`,
      )
    }

    // Axis symbol caption above the cell
    parts.push(
      `<text x="${(cx + cellW / 2).toFixed(2)}" y="${cy - 14}" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="700" fill="${ink}">${escapeXml(a.label)}</text>`,
    )
    parts.push(
      `<text x="${(cx + cellW / 2).toFixed(2)}" y="${cy - 4}" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="8" fill="${inkSoft}">${escapeXml(a.longLabel)}</text>`,
    )

    // Exponent value inside the cell (or "0" dimmed when zero)
    let expText: string
    if (exp === 0) expText = '0'
    else if (exp > 0) expText = `+${exp}`
    else expText = `${exp}`
    const expColor = exp > 0 ? '#fdfdfd' : exp < 0 ? ink : inkSoft
    parts.push(
      `<text x="${(cx + cellW / 2).toFixed(2)}" y="${cy + cellH / 2 + 7}" text-anchor="middle" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="18" font-weight="600" fill="${expColor}">${escapeXml(expText)}</text>`,
    )
  }
  return parts.join('')
}

/**
 * Format the SI factor as a single line: "× M × 10^E" or "× 1 (SI base)".
 */
function formatSiFactorLine(siFactor: number | undefined): string {
  if (typeof siFactor !== 'number') return ''
  if (siFactor === 1) return `${TIMES} 1   (SI-canonical)`
  const { mantissa, exponent } = formatValueGrouped(siFactor)
  if (exponent === null) return `${TIMES} ${mantissa}`
  const expStr =
    exponent < 0 ? `⁻${toSuperscript(String(-exponent))}` : toSuperscript(String(exponent))
  return `${TIMES} ${mantissa} ${TIMES} 10${expStr}`
}

/**
 * Decompose the dimension vector into a SI-base-unit one-liner, e.g.
 *   M¹ L² T⁻² → "kg·m²·s⁻²"
 *   L⁻¹      → "m⁻¹"
 *   T⁻¹      → "s⁻¹"
 *   Θ        → "K"
 *
 * Empty vector → "1 (dimensionless)".
 */
function decomposeToSiBase(v: DimensionVector): string {
  type Mapping = { axis: keyof DimensionVector; symbol: string }
  const mappings: Mapping[] = [
    { axis: 'M', symbol: 'kg' },
    { axis: 'L', symbol: 'm' },
    { axis: 'T', symbol: 's' },
    { axis: 'Theta', symbol: 'K' },
    { axis: 'I', symbol: 'A' },
    { axis: 'N', symbol: 'mol' },
    { axis: 'J', symbol: 'cd' },
  ]
  const parts: string[] = []
  for (const m of mappings) {
    const e = v[m.axis]
    if (e === 0) continue
    if (e === 1) parts.push(m.symbol)
    else parts.push(m.symbol + (e < 0 ? '⁻' : '') + toSuperscript(String(Math.abs(e))))
  }
  return parts.length === 0 ? '1 (dimensionless)' : parts.join('·')
}

/**
 * Render the family-specific block on the back of a unit card.
 *
 * Layout (origin top-left of the 440x320 family region):
 *   - row 1 (y≈10):   class chip on top-right, quantity tag on top-left
 *   - row 2 (y≈60):   7-cell dimension fingerprint with axis captions
 *   - row 3 (y≈170):  SI factor line
 *   - row 4 (y≈195):  SI-base decomposition line
 *   - row 5 (y≈230):  reciprocal flag (when set)
 */
function renderUnitFamilyBlock(primitive: Primitive): string {
  const a = readAttrs(primitive)
  const familyW = 440
  const ink = '#0e2a2f'
  const inkSoft = '#4a6c70'

  const fragments: string[] = []

  // Top-left: quantity tag (italic), top-right: class chip
  if (a.quantity) {
    fragments.push(
      `<text x="0" y="14" font-family="ui-serif, Georgia, serif" font-style="italic" font-size="12" fill="${inkSoft}">${escapeXml(a.quantity)}</text>`,
    )
  }
  fragments.push(
    `<text x="${familyW}" y="14" text-anchor="end" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" letter-spacing="1.4" fill="${inkSoft}">DIMENSION FINGERPRINT</text>`,
  )

  // Try to parse the dimension string into a 7-axis vector.
  const vector = parseDimensionString(a.dimensionString)
  if (vector !== null) {
    // Fingerprint strip
    const stripX = 10
    const stripY = 60
    const stripW = familyW - 20
    fragments.push(drawDimensionFingerprint({ x: stripX, y: stripY, width: stripW, vector }))

    // SI-base decomposition (under the strip)
    const decomp = decomposeToSiBase(vector)
    fragments.push(
      `<text x="0" y="170" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" letter-spacing="1.2" fill="${inkSoft}">DECOMPOSITION</text>`,
      `<text x="0" y="190" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="16" fill="${ink}">${escapeXml(decomp)}</text>`,
    )

    // SI factor line (when present)
    if (typeof a.siFactor === 'number') {
      const factorLine = formatSiFactorLine(a.siFactor)
      fragments.push(
        `<text x="0" y="225" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" letter-spacing="1.2" fill="${inkSoft}">SI FACTOR</text>`,
        `<text x="0" y="245" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="14" fill="${ink}">${escapeXml(factorLine)}</text>`,
      )
    }

    // Reciprocal flag (when set)
    if (a.reciprocal) {
      fragments.push(
        `<text x="0" y="280" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" letter-spacing="1.2" font-weight="600" fill="${inkSoft}">RECIPROCAL UNIT (energy proxy via E = h c ν̃)</text>`,
      )
    }
  } else {
    // Parse failed — fall back to verbatim dimensionString rendering with
    // an explicit "(parse pending)" caption.
    fragments.push(
      `<text x="0" y="80" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" letter-spacing="1.2" fill="${inkSoft}">DIMENSION STRING (parse pending)</text>`,
      `<text x="0" y="110" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="20" fill="${ink}">${escapeXml(prettifyUnit(a.dimensionString) || '(empty)')}</text>`,
    )
    if (typeof a.siFactor === 'number') {
      const factorLine = formatSiFactorLine(a.siFactor)
      fragments.push(
        `<text x="0" y="160" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" letter-spacing="1.2" fill="${inkSoft}">SI FACTOR</text>`,
        `<text x="0" y="180" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="14" fill="${ink}">${escapeXml(factorLine)}</text>`,
      )
    }
  }

  return fragments.join('')
}

/**
 * Back-card renderer for the unit family.
 */
export const renderBack: BackRenderer = (primitive, ctx) => {
  const familyBlock = renderUnitFamilyBlock(primitive)
  return { svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)) }
}
