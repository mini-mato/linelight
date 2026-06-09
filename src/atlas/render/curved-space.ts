/**
 * Render a constant-curvature model space (E^n, S^n, H^n) as an SVG card.
 *
 * Card layout matches constant.ts. The symbol (E²/S²/H³ etc.) is rendered
 * large in the symbol slot. A small icon at the right shows the model:
 *   - flat plane         for Euclidean
 *   - sphere with arcs   for spherical
 *   - Poincaré disk      for hyperbolic
 * The line element ds² is typeset in the deriv slot.
 */

import type { Primitive } from '../types.js'
import type { BackRenderer, Renderer } from './types.js'
import { DEFAULT_CARD, SVG_CLOSE, escapeXml, svgOpen } from './svg.js'
import { buildBackParts, makeTbdBackRenderer } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'

type CurvedSpaceAttrs = {
  curvatureK: number
  dimension: number
  isotropy?: string
  lineElement?: string
  model?: string
  isometryGroupOrder?: number | 'inf'
}

function isCurvedSpaceAttrs(a: unknown): a is CurvedSpaceAttrs {
  return (
    typeof a === 'object' &&
    a !== null &&
    'curvatureK' in a &&
    typeof (a as CurvedSpaceAttrs).curvatureK === 'number' &&
    'dimension' in a &&
    typeof (a as CurvedSpaceAttrs).dimension === 'number'
  )
}

const ICON_CX = 380
const ICON_CY = 130
const ICON_R = 60

export const renderCurvedSpace: Renderer = (primitive) => {
  if (!isCurvedSpaceAttrs(primitive.attrs)) {
    throw new Error(`renderCurvedSpace: ${primitive.id} attrs not CurvedSpaceAttrs`)
  }
  const attrs = primitive.attrs
  const symbol = primitive.symbol ?? ''
  const K = attrs.curvatureK
  const kind: 'euclidean' | 'spherical' | 'hyperbolic' =
    K === 0 ? 'euclidean' : K > 0 ? 'spherical' : 'hyperbolic'

  const badgeText = K === 0 ? 'K = 0' : K > 0 ? 'K = +1' : 'K = −1'
  const ruleClass = K === 0 ? 'accent-rule-derived' : 'accent-rule'

  const icon = drawIcon(kind)
  const lineElement = attrs.lineElement
    ? `<text class="deriv" x="24" y="200">${escapeXml('ds² = ' + stripDsPrefix(attrs.lineElement))}</text>`
    : ''
  const modelLine = attrs.model
    ? `<text class="uncertainty" x="24" y="172">model: ${escapeXml(attrs.model)}</text>`
    : ''
  const dimLine = `<text class="uncertainty" x="24" y="132">dimension ${attrs.dimension}${attrs.isotropy ? ' · ' + escapeXml(attrs.isotropy) : ''}</text>`

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${DEFAULT_CARD.width - 1.5}" height="${DEFAULT_CARD.height - 1.5}" rx="6" />`,
    `<line class="${ruleClass}" x1="0" y1="42" x2="${DEFAULT_CARD.width}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="badge-exact" x="${DEFAULT_CARD.width - 20}" y="28" text-anchor="end">${escapeXml(badgeText)}</text>`,
    symbol ? `<text class="symbol" x="24" y="92">${escapeXml(symbol)}</text>` : '',
    dimLine,
    modelLine,
    lineElement,
    icon,
    `<text class="source" x="24" y="226">${escapeXml('NIST DLMF')}</text>`,
    `<text class="id" x="${DEFAULT_CARD.width - 20}" y="226" text-anchor="end">${escapeXml(primitive.id)}</text>`,
    SVG_CLOSE,
  ].join('')
}

function stripDsPrefix(s: string): string {
  // Allow seed entries that include the "ds² = " prefix; also accept ds^2.
  return s
    .replace(/^\s*ds\^?2\s*=\s*/, '')
    .replace(/^\s*ds²\s*=\s*/, '')
    .trim()
}

function drawIcon(kind: 'euclidean' | 'spherical' | 'hyperbolic'): string {
  const cx = ICON_CX
  const cy = ICON_CY
  const r = ICON_R
  const STROKE = '#1a3a3f'
  const STROKE_ALT = '#5b8c5a'
  const panel = `<rect x="${cx - r - 6}" y="${cy - r - 6}" width="${r * 2 + 12}" height="${r * 2 + 12}" rx="4" fill="#f5f8f8" stroke="#cdd6d8" stroke-width="0.6" />`
  if (kind === 'euclidean') {
    // Flat tilted plane parallelogram with grid.
    const dx = r * 0.85
    const dy = r * 0.4
    const xs = cx - dx
    const ys = cy + dy
    const path = `M ${xs} ${ys} l ${dx * 2} 0 l ${-dx * 0.5} ${-dy * 2} l ${-dx * 2} 0 z`
    const grid: string[] = []
    for (let i = 1; i <= 4; i++) {
      const t = i / 5
      const ax = xs + t * dx * 2
      const ay = ys
      const bx = ax - dx * 0.5
      const by = ys - dy * 2
      grid.push(
        `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${STROKE_ALT}" stroke-width="0.6" />`,
      )
      const cxA = xs + -dx * 0.5 * t
      const cyA = ys - dy * 2 * t
      const cxB = cxA + dx * 2
      const cyB = cyA
      grid.push(
        `<line x1="${cxA}" y1="${cyA}" x2="${cxB}" y2="${cyB}" stroke="${STROKE_ALT}" stroke-width="0.6" />`,
      )
    }
    return (
      panel + `<path d="${path}" fill="none" stroke="${STROKE}" stroke-width="1" />` + grid.join('')
    )
  }
  if (kind === 'spherical') {
    // Outer circle + latitude (squashed ellipse) + longitude (vertical ellipse).
    return (
      panel +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${STROKE}" stroke-width="1" />` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.32}" fill="none" stroke="${STROKE}" stroke-width="0.7" />` +
      `<ellipse cx="${cx}" cy="${cy - r * 0.45}" rx="${(r * 0.85).toFixed(2)}" ry="${(r * 0.18).toFixed(2)}" fill="none" stroke="${STROKE}" stroke-width="0.6" />` +
      `<ellipse cx="${cx}" cy="${cy + r * 0.45}" rx="${(r * 0.85).toFixed(2)}" ry="${(r * 0.18).toFixed(2)}" fill="none" stroke="${STROKE}" stroke-width="0.6" />` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${r * 0.45}" ry="${r}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.7" />` +
      `<ellipse cx="${cx}" cy="${cy}" rx="${r * 0.8}" ry="${r}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.7" />`
    )
  }
  // hyperbolic — Poincaré disk: outer circle + arcs meeting boundary at right angles.
  // For an arc with center (cx0, cy0) outside the disk and radius rho, perpendicularity to
  // the unit boundary requires |center|² = ρ² + 1 (with the disk centered at the origin).
  // We pick three arcs at varying offsets.
  const arcs: string[] = []
  const arcSpecs: { d: number; rho: number }[] = [
    { d: 1.4, rho: Math.sqrt(1.4 * 1.4 - 1) },
    { d: 1.8, rho: Math.sqrt(1.8 * 1.8 - 1) },
    { d: 2.4, rho: Math.sqrt(2.4 * 2.4 - 1) },
  ]
  // Place arcs in different angular sectors.
  const angles = [Math.PI * 0.15, Math.PI * 0.85, Math.PI * 1.55]
  for (let i = 0; i < arcSpecs.length; i++) {
    const { d, rho } = arcSpecs[i]
    const a = angles[i]
    const ox = cx + Math.cos(a) * d * r
    const oy = cy + Math.sin(a) * d * r
    const R = rho * r
    // Approximate arc by sampling many points; clip to the disk.
    const pts: string[] = []
    for (let t = 0; t < 360; t += 3) {
      const th = (t * Math.PI) / 180
      const px = ox + R * Math.cos(th)
      const py = oy + R * Math.sin(th)
      const dxp = px - cx
      const dyp = py - cy
      if (dxp * dxp + dyp * dyp <= r * r * 0.99) {
        pts.push(`${px.toFixed(2)},${py.toFixed(2)}`)
      } else if (pts.length) {
        arcs.push(
          `<polyline points="${pts.join(' ')}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.85" />`,
        )
        pts.length = 0
      }
    }
    if (pts.length) {
      arcs.push(
        `<polyline points="${pts.join(' ')}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.85" />`,
      )
    }
  }
  // A diameter (also a geodesic).
  const diam = `<line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="${STROKE_ALT}" stroke-width="0.85" />`
  return (
    panel +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${STROKE}" stroke-width="1" />` +
    arcs.join('') +
    diam
  )
}

/* --------------------------- back-card render --------------------------- */

/**
 * Back-card family block (~440 × 130 px) for curved-space primitives.
 *
 * Layout:
 *   - Top row: name + dimension banner.
 *   - Below:   embedding sketch — sphere ellipse + great circle for
 *              spherical, saddle for hyperbolic, flat plane for Euclidean.
 *   - Right:   metric (verbatim from `attrs.metric`), curvature K sign,
 *              isometry-group order if present.
 */

const BACK_EMBED_W = 200
const BACK_EMBED_H = 100
const BACK_EMBED_OY = 16
const BACK_EMBED_CX = BACK_EMBED_W / 2
const BACK_EMBED_CY = BACK_EMBED_OY + BACK_EMBED_H / 2

const BACK_LIST_X = BACK_EMBED_W + 20

function backEmbeddingSketch(kind: 'euclidean' | 'spherical' | 'hyperbolic'): string {
  const ink = '#0e2a2f'
  const inkSoft = '#4a6c70'
  const cx = BACK_EMBED_CX
  const cy = BACK_EMBED_CY
  if (kind === 'euclidean') {
    // Tilted plane parallelogram with grid.
    const dx = 70
    const dy = 22
    const xs = cx - dx
    const ys = cy + dy
    const grid: string[] = []
    grid.push(
      `<path d="M ${xs} ${ys} l ${dx * 2} 0 l ${-dx * 0.4} ${-dy * 2} l ${-dx * 2} 0 z" fill="none" stroke="${ink}" stroke-width="0.9" />`,
    )
    for (let i = 1; i <= 4; i++) {
      const t = i / 5
      const ax = xs + t * dx * 2
      const ay = ys
      const bx = ax - dx * 0.4
      const by = ys - dy * 2
      grid.push(
        `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${inkSoft}" stroke-width="0.5" opacity="0.7" />`,
      )
      const cxA = xs + -dx * 0.4 * t
      const cyA = ys - dy * 2 * t
      grid.push(
        `<line x1="${cxA}" y1="${cyA}" x2="${cxA + dx * 2}" y2="${cyA}" stroke="${inkSoft}" stroke-width="0.5" opacity="0.7" />`,
      )
    }
    return grid.join('')
  }
  if (kind === 'spherical') {
    const r = 36
    return [
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ink}" stroke-width="1" />`,
      `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.32}" fill="none" stroke="${ink}" stroke-width="0.8" />`,
      `<ellipse cx="${cx}" cy="${cy}" rx="${r * 0.5}" ry="${r}" fill="none" stroke="${inkSoft}" stroke-width="0.7" />`,
      `<ellipse cx="${cx}" cy="${cy - r * 0.45}" rx="${(r * 0.85).toFixed(2)}" ry="${(r * 0.18).toFixed(2)}" fill="none" stroke="${ink}" stroke-width="0.5" opacity="0.7" />`,
      `<ellipse cx="${cx}" cy="${cy + r * 0.45}" rx="${(r * 0.85).toFixed(2)}" ry="${(r * 0.18).toFixed(2)}" fill="none" stroke="${ink}" stroke-width="0.5" opacity="0.7" />`,
    ].join('')
  }
  // hyperbolic — saddle (z = x^2 - y^2 grid) projected obliquely.
  const out: string[] = []
  const w = 70
  const h = 36
  const lines = 7
  for (let i = 0; i <= lines; i++) {
    const t = i / lines
    const u = -1 + 2 * t
    // u-line: y in [-1,1], x = u
    const pts: string[] = []
    for (let j = 0; j <= 20; j++) {
      const v = -1 + (2 * j) / 20
      const X = u * w
      const Y = v * h
      const Z = (u * u - v * v) * 14
      const px = cx + X * 0.85 + Y * 0.4
      const py = cy + Y * 0.4 - Z
      pts.push(`${px.toFixed(2)},${py.toFixed(2)}`)
    }
    out.push(
      `<polyline points="${pts.join(' ')}" fill="none" stroke="${ink}" stroke-width="0.6" opacity="0.7" />`,
    )
  }
  for (let j = 0; j <= lines; j++) {
    const t = j / lines
    const v = -1 + 2 * t
    const pts: string[] = []
    for (let i = 0; i <= 20; i++) {
      const u = -1 + (2 * i) / 20
      const X = u * w
      const Y = v * h
      const Z = (u * u - v * v) * 14
      const px = cx + X * 0.85 + Y * 0.4
      const py = cy + Y * 0.4 - Z
      pts.push(`${px.toFixed(2)},${py.toFixed(2)}`)
    }
    out.push(
      `<polyline points="${pts.join(' ')}" fill="none" stroke="${inkSoft}" stroke-width="0.5" opacity="0.7" />`,
    )
  }
  return out.join('')
}

function buildCurvedSpaceFamilyBlock(primitive: Primitive, attrs: CurvedSpaceAttrs): string {
  const K = attrs.curvatureK
  const kind: 'euclidean' | 'spherical' | 'hyperbolic' =
    K === 0 ? 'euclidean' : K > 0 ? 'spherical' : 'hyperbolic'

  const out: string[] = []

  // Title row.
  out.push(
    `<text x="0" y="10" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" font-weight="600" fill="#0e2a2f">${escapeXml(primitive.name)}  ·  ${attrs.dimension}D</text>`,
  )

  // Schematic embedding panel.
  out.push(
    `<rect x="0" y="${BACK_EMBED_OY}" width="${BACK_EMBED_W}" height="${BACK_EMBED_H}" rx="3" fill="none" stroke="#cdd6d8" stroke-width="0.6" stroke-dasharray="3 3" />`,
  )
  out.push(backEmbeddingSketch(kind))
  out.push(
    `<text x="6" y="${BACK_EMBED_OY + BACK_EMBED_H - 4}" font-family="ui-serif, Georgia, serif" font-size="9" font-style="italic" fill="#8a9c9f">(schematic embedding)</text>`,
  )

  // Right column: K, metric, isometry, model, isotropy.
  type Row = { label: string; value: string; mono?: boolean }
  const rows: Row[] = []
  rows.push({ label: 'K', value: K === 0 ? '0' : K > 0 ? '+1' : '−1' })
  if (attrs.lineElement) {
    rows.push({ label: 'metric', value: stripDsPrefix(attrs.lineElement), mono: true })
  }
  if (attrs.isometryGroupOrder !== undefined) {
    const v = attrs.isometryGroupOrder === 'inf' ? '∞' : String(attrs.isometryGroupOrder)
    rows.push({ label: '|isom|', value: v })
  }
  if (attrs.model) rows.push({ label: 'model', value: attrs.model })

  let listY = 14
  const lineH = 14
  for (const row of rows) {
    out.push(
      `<text x="${BACK_LIST_X}" y="${listY}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" font-weight="600" fill="#4a6c70" letter-spacing="1.0">${escapeXml(row.label.toUpperCase())}</text>`,
    )
    const valueX = BACK_LIST_X + 50
    // Metric / model can be long: wrap visually by truncating to ~38 chars.
    const truncated = row.value.length > 36 ? row.value.slice(0, 35) + '…' : row.value
    const family = row.mono
      ? "'Iosevka', ui-monospace, Menlo, monospace"
      : "'Iosevka', ui-monospace, Menlo, monospace"
    out.push(
      `<text x="${valueX}" y="${listY}" font-family="${family}" font-size="10" fill="#0e2a2f">${escapeXml(truncated)}</text>`,
    )
    listY += lineH
  }

  return out.join('')
}

export const renderBack: BackRenderer = (primitive, ctx) => {
  if (!isCurvedSpaceAttrs(primitive.attrs)) {
    return { svg: makeTbdBackRenderer('curved-space')(primitive, ctx).svg }
  }
  const familyBlock = buildCurvedSpaceFamilyBlock(primitive, primitive.attrs)
  return {
    svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)),
  }
}
