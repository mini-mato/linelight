/**
 * Render a separable orthogonal coordinate system as an SVG card.
 *
 * Visual: a square plot in the right half of the card showing one or two
 * iso-surface families (a 2D slice through the 3D system). Pure geometry —
 * paths are computed in TS at build time.
 *
 * Layout matches constant.ts: 480x240, frame, name+badge, info, source+id.
 *
 * The renderer dispatches on the primitive id suffix to pick a schematic.
 * All schematics are honest read-the-shape sketches, not high-resolution
 * iso-surface plots — the 2D slice is enough to recognize the system.
 */

import type { CoordSystemAttrs, Primitive } from '../types.js'
import type { BackRenderer, Renderer } from './types.js'
import { DEFAULT_CARD, SVG_CLOSE, escapeXml, svgOpen } from './svg.js'
import { buildBackParts, makeTbdBackRenderer } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'

function isCoordSystemAttrs(a: unknown): a is CoordSystemAttrs {
  return (
    typeof a === 'object' &&
    a !== null &&
    'dimension' in a &&
    typeof (a as CoordSystemAttrs).dimension === 'number'
  )
}

type Plot = { cx: number; cy: number; r: number }

const PLOT: Plot = { cx: 360, cy: 130, r: 78 }

export const renderCoordSystem: Renderer = (primitive) => {
  if (!isCoordSystemAttrs(primitive.attrs)) {
    throw new Error(`renderCoordSystem: ${primitive.id} attrs not CoordSystemAttrs`)
  }
  const attrs = primitive.attrs
  const symbol = primitive.symbol ?? ''

  const plot = drawPlotForId(primitive.id)
  const dimensionLabel = `${attrs.dimension}D`

  const metricLine = attrs.metric
    ? `<text class="deriv" x="24" y="200">${escapeXml(attrs.metric)}</text>`
    : ''

  const basisLine =
    attrs.basisFunctions && attrs.basisFunctions.length
      ? `<text class="uncertainty" x="24" y="172">basis: ${escapeXml(attrs.basisFunctions[0])}</text>`
      : ''

  const symbolLine = symbol ? `<text class="symbol" x="24" y="92">${escapeXml(symbol)}</text>` : ''
  const dimBadge = `<text class="badge-exact" x="${DEFAULT_CARD.width - 20}" y="28" text-anchor="end">${escapeXml(dimensionLabel)}</text>`

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${DEFAULT_CARD.width - 1.5}" height="${DEFAULT_CARD.height - 1.5}" rx="6" />`,
    `<line class="accent-rule" x1="0" y1="42" x2="${DEFAULT_CARD.width}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    dimBadge,
    symbolLine,
    `<text class="uncertainty" x="24" y="132">separable in: ${escapeXml((attrs.separablePdes ?? []).join(', ') || '—')}</text>`,
    basisLine,
    metricLine,
    plot,
    `<text class="source" x="24" y="226">${escapeXml('Morse-Feshbach 1953')}</text>`,
    `<text class="id" x="${DEFAULT_CARD.width - 20}" y="226" text-anchor="end">${escapeXml(primitive.id)}</text>`,
    SVG_CLOSE,
  ].join('')
}

/** Pick a schematic plotter based on the id. */
function drawPlotForId(id: string): string {
  const tail = id.split('.').slice(-1)[0]
  // Background panel for the schematic.
  const panel = `<rect x="${PLOT.cx - PLOT.r - 4}" y="${PLOT.cy - PLOT.r - 4}" width="${PLOT.r * 2 + 8}" height="${PLOT.r * 2 + 8}" rx="4" fill="#f5f8f8" stroke="#cdd6d8" stroke-width="0.6" />`
  let body: string
  switch (tail) {
    case 'cartesian':
      body = drawCartesian()
      break
    case 'polar':
      body = drawPolar()
      break
    case 'spherical':
      body = drawSpherical()
      break
    case 'circular-cylindrical':
      body = drawCylindrical()
      break
    case 'parabolic':
      // 2D and 3D parabolic share the same xy-slice schematic.
      body = drawParabolic()
      break
    case 'parabolic-cylindrical':
      body = drawParabolic()
      break
    case 'elliptic':
      body = drawElliptic()
      break
    case 'elliptic-cylindrical':
      body = drawElliptic()
      break
    case 'prolate-spheroidal':
      body = drawProlate()
      break
    case 'oblate-spheroidal':
      body = drawOblate()
      break
    case 'conical':
      body = drawConical()
      break
    case 'ellipsoidal':
      body = drawEllipsoidal()
      break
    case 'paraboloidal':
      body = drawParaboloidal()
      break
    default:
      body = drawCartesian()
  }
  return panel + body
}

const STROKE = '#1a3a3f'
const STROKE_ALT = '#5b8c5a'

/** Cartesian: orthogonal grid. */
function drawCartesian(): string {
  const lines: string[] = []
  const step = PLOT.r / 3
  for (let i = -3; i <= 3; i++) {
    const x = PLOT.cx + i * step
    const y = PLOT.cy + i * step
    lines.push(
      `<line x1="${x}" y1="${PLOT.cy - PLOT.r}" x2="${x}" y2="${PLOT.cy + PLOT.r}" stroke="${STROKE}" stroke-width="0.7" />`,
    )
    lines.push(
      `<line x1="${PLOT.cx - PLOT.r}" y1="${y}" x2="${PLOT.cx + PLOT.r}" y2="${y}" stroke="${STROKE_ALT}" stroke-width="0.7" />`,
    )
  }
  return lines.join('')
}

/** Polar: concentric circles + radial spokes. */
function drawPolar(): string {
  const parts: string[] = []
  for (let k = 1; k <= 4; k++) {
    const r = (PLOT.r * k) / 4
    parts.push(
      `<circle cx="${PLOT.cx}" cy="${PLOT.cy}" r="${r}" fill="none" stroke="${STROKE}" stroke-width="0.7" />`,
    )
  }
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4
    const x2 = PLOT.cx + PLOT.r * Math.cos(a)
    const y2 = PLOT.cy + PLOT.r * Math.sin(a)
    parts.push(
      `<line x1="${PLOT.cx}" y1="${PLOT.cy}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${STROKE_ALT}" stroke-width="0.7" />`,
    )
  }
  return parts.join('')
}

/** Spherical: outer circle (sphere outline), latitude arcs, longitude arc. */
function drawSpherical(): string {
  const { cx, cy, r } = PLOT
  const parts: string[] = []
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${STROKE}" stroke-width="0.9" />`,
  )
  // Latitude (horizontal ellipses to suggest 3D).
  for (let k = -2; k <= 2; k++) {
    if (k === 0) continue
    const yy = (k * r) / 3
    const ry = Math.sqrt(Math.max(0, r * r - yy * yy)) * 0.32
    parts.push(
      `<ellipse cx="${cx}" cy="${cy + yy}" rx="${Math.sqrt(Math.max(0, r * r - yy * yy)).toFixed(2)}" ry="${ry.toFixed(2)}" fill="none" stroke="${STROKE}" stroke-width="0.6" />`,
    )
  }
  // Longitude (vertical ellipses).
  for (let k = 1; k <= 3; k++) {
    const rx = (r * k) / 4
    parts.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx.toFixed(2)}" ry="${r}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.6" />`,
    )
  }
  return parts.join('')
}

/** Cylindrical: circles in slice plus a vertical axis hint. */
function drawCylindrical(): string {
  const { cx, cy, r } = PLOT
  const parts: string[] = []
  for (let k = 1; k <= 4; k++) {
    const rr = (r * k) / 4
    parts.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${rr}" ry="${rr * 0.45}" fill="none" stroke="${STROKE}" stroke-width="0.7" />`,
    )
  }
  // Vertical extrusion lines on the sides.
  parts.push(
    `<line x1="${cx - r}" y1="${cy - r}" x2="${cx - r}" y2="${cy + r}" stroke="${STROKE_ALT}" stroke-width="0.8" />`,
  )
  parts.push(
    `<line x1="${cx + r}" y1="${cy - r}" x2="${cx + r}" y2="${cy + r}" stroke="${STROKE_ALT}" stroke-width="0.8" />`,
  )
  return parts.join('')
}

/**
 * Parabolic: two confocal families of parabolas with common focus at origin.
 * y^2 = 2 ξ^2 (ξ^2 + 2x) for one family, y^2 = 2 η^2 (η^2 - 2x) for the other.
 * Simpler: y = ±sqrt(2c)*sqrt(c/2 + x) opens right, y = ±sqrt(2c)*sqrt(c/2 - x) opens left.
 */
function drawParabolic(): string {
  const { cx, cy, r } = PLOT
  const parts: string[] = []
  // Map parabola coordinates to plot.
  const scale = r / 1.6
  // c values for opens-right parabolas: y^2 = 4c(x + c). Use four c's.
  const cs = [0.15, 0.4, 0.7, 1.05]
  for (const c of cs) {
    // Opens to the right (vertex at x = -c).
    const ptsR: string[] = []
    for (let t = -1.4; t <= 1.4; t += 0.07) {
      const x = -c + (t * t) / (4 * c)
      const y = t
      ptsR.push(`${(cx + x * scale).toFixed(2)},${(cy - y * scale).toFixed(2)}`)
    }
    parts.push(
      `<polyline points="${ptsR.join(' ')}" fill="none" stroke="${STROKE}" stroke-width="0.7" />`,
    )
    // Opens to the left (vertex at x = +c).
    const ptsL: string[] = []
    for (let t = -1.4; t <= 1.4; t += 0.07) {
      const x = c - (t * t) / (4 * c)
      const y = t
      ptsL.push(`${(cx + x * scale).toFixed(2)},${(cy - y * scale).toFixed(2)}`)
    }
    parts.push(
      `<polyline points="${ptsL.join(' ')}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.7" />`,
    )
  }
  // Common focus at origin.
  parts.push(`<circle cx="${cx}" cy="${cy}" r="1.6" fill="${STROKE}" />`)
  return parts.join('')
}

/**
 * Elliptic / confocal: confocal ellipses + hyperbolae sharing foci at ±a.
 * Ellipses x^2/A^2 + y^2/B^2 = 1 with B^2 = A^2 - a^2; A varies.
 * Hyperbolae x^2/p^2 - y^2/q^2 = 1 with p^2 + q^2 = a^2; p varies.
 */
function drawElliptic(): string {
  const { cx, cy, r } = PLOT
  const parts: string[] = []
  const a = r * 0.55 // focal half-distance
  const scale = 1
  // Ellipses with semi-major Aval > a.
  const aValues = [a * 1.1, a * 1.35, a * 1.7, a * 2.1].map((v) => Math.min(v, r * 0.95))
  for (const Aval of aValues) {
    const Bval = Math.sqrt(Math.max(0, Aval * Aval - a * a))
    parts.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${(Aval * scale).toFixed(2)}" ry="${(Bval * scale).toFixed(2)}" fill="none" stroke="${STROKE}" stroke-width="0.7" />`,
    )
  }
  // Hyperbolae: parametric x = ±a/cos t, y = ±a tan t · (q/p). Use simple polylines.
  const ps = [a * 0.3, a * 0.55, a * 0.8]
  for (const p of ps) {
    const q = Math.sqrt(Math.max(0.0001, a * a - p * p))
    const pts1: string[] = []
    const pts2: string[] = []
    for (let t = -1.0; t <= 1.0; t += 0.05) {
      const x = p / Math.cos(t)
      const y = q * Math.tan(t)
      if (Math.abs(x) < r * 0.95 && Math.abs(y) < r * 0.95) {
        pts1.push(`${(cx + x).toFixed(2)},${(cy - y).toFixed(2)}`)
        pts2.push(`${(cx - x).toFixed(2)},${(cy - y).toFixed(2)}`)
      }
    }
    if (pts1.length) {
      parts.push(
        `<polyline points="${pts1.join(' ')}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.7" />`,
      )
    }
    if (pts2.length) {
      parts.push(
        `<polyline points="${pts2.join(' ')}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.7" />`,
      )
    }
  }
  // Foci.
  parts.push(`<circle cx="${cx + a}" cy="${cy}" r="1.6" fill="${STROKE}" />`)
  parts.push(`<circle cx="${cx - a}" cy="${cy}" r="1.6" fill="${STROKE}" />`)
  return parts.join('')
}

/** Prolate spheroidal: family of prolate ellipses (long axis horizontal) + hyperboloid hint. */
function drawProlate(): string {
  const { cx, cy, r } = PLOT
  const parts: string[] = []
  const a = r * 0.45
  const elongations = [1.05, 1.25, 1.5, 1.85]
  for (const e of elongations) {
    const A = Math.min(a * e, r * 0.95)
    const B = Math.sqrt(Math.max(0, A * A - a * a))
    parts.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${A.toFixed(2)}" ry="${B.toFixed(2)}" fill="none" stroke="${STROKE}" stroke-width="0.7" />`,
    )
  }
  // Foci on horizontal axis.
  parts.push(`<circle cx="${cx + a}" cy="${cy}" r="1.6" fill="${STROKE}" />`)
  parts.push(`<circle cx="${cx - a}" cy="${cy}" r="1.6" fill="${STROKE}" />`)
  // Two-sheet hyperbola hint.
  for (const p of [a * 0.4, a * 0.7]) {
    const q = Math.sqrt(Math.max(0.0001, a * a - p * p))
    const pts1: string[] = []
    const pts2: string[] = []
    for (let t = -1.0; t <= 1.0; t += 0.06) {
      const x = p / Math.cos(t)
      const y = q * Math.tan(t)
      if (Math.abs(x) < r * 0.95 && Math.abs(y) < r * 0.95) {
        pts1.push(`${(cx + x).toFixed(2)},${(cy - y).toFixed(2)}`)
        pts2.push(`${(cx - x).toFixed(2)},${(cy - y).toFixed(2)}`)
      }
    }
    if (pts1.length)
      parts.push(
        `<polyline points="${pts1.join(' ')}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.6" />`,
      )
    if (pts2.length)
      parts.push(
        `<polyline points="${pts2.join(' ')}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.6" />`,
      )
  }
  return parts.join('')
}

/** Oblate spheroidal: family of squashed (oblate) ellipses. */
function drawOblate(): string {
  const { cx, cy, r } = PLOT
  const parts: string[] = []
  // Oblate: long axis horizontal, but for foci on x to avoid confusion we draw squashed-vertical ellipses.
  const a = r * 0.5
  const flatness = [1.05, 1.2, 1.45, 1.8]
  for (const f of flatness) {
    const A = Math.min(a * f, r * 0.95)
    // For an oblate with foci ON the horizontal axis at ±a, semi-minor (vertical) > sqrt(A^2 - a^2)? Actually for oblate confocal, foci are on rotation axis; here we just suggest oblate by drawing wide-but-short ellipses.
    const B = A / f / 1.2
    parts.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${A.toFixed(2)}" ry="${B.toFixed(2)}" fill="none" stroke="${STROKE}" stroke-width="0.7" />`,
    )
  }
  // Focal ring shown as two dots on horizontal axis.
  parts.push(`<circle cx="${cx + a}" cy="${cy}" r="1.6" fill="${STROKE}" />`)
  parts.push(`<circle cx="${cx - a}" cy="${cy}" r="1.6" fill="${STROKE}" />`)
  // One-sheet hyperboloid hint: vertical hyperbolae.
  for (const p of [a * 0.45, a * 0.75]) {
    const q = Math.sqrt(Math.max(0.0001, a * a - p * p))
    const pts1: string[] = []
    const pts2: string[] = []
    for (let t = -0.9; t <= 0.9; t += 0.06) {
      const y = p / Math.cos(t)
      const x = q * Math.tan(t)
      if (Math.abs(x) < r * 0.95 && Math.abs(y) < r * 0.95) {
        pts1.push(`${(cx + x).toFixed(2)},${(cy + y).toFixed(2)}`)
        pts2.push(`${(cx + x).toFixed(2)},${(cy - y).toFixed(2)}`)
      }
    }
    if (pts1.length)
      parts.push(
        `<polyline points="${pts1.join(' ')}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.6" />`,
      )
    if (pts2.length)
      parts.push(
        `<polyline points="${pts2.join(' ')}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.6" />`,
      )
  }
  return parts.join('')
}

/** Conical: rays from origin (cones) + a single sphere. */
function drawConical(): string {
  const { cx, cy, r } = PLOT
  const parts: string[] = []
  parts.push(
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.7}" fill="none" stroke="${STROKE}" stroke-width="0.7" />`,
  )
  // Cone rays at various angles.
  const n = 8
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = cx + r * Math.cos(a)
    const y = cy + r * Math.sin(a)
    parts.push(
      `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${STROKE_ALT}" stroke-width="0.6" />`,
    )
  }
  // A pair of generating cones (drawn as crossed Vs).
  parts.push(
    `<path d="M ${cx} ${cy} L ${cx + r * 0.9} ${cy - r * 0.55} M ${cx} ${cy} L ${cx + r * 0.9} ${cy + r * 0.55} M ${cx} ${cy} L ${cx - r * 0.9} ${cy - r * 0.55} M ${cx} ${cy} L ${cx - r * 0.9} ${cy + r * 0.55}" fill="none" stroke="${STROKE}" stroke-width="0.9" />`,
  )
  return parts.join('')
}

/** Ellipsoidal: three nested ellipses with different aspect ratios. */
function drawEllipsoidal(): string {
  const { cx, cy, r } = PLOT
  const parts: string[] = []
  // Family 1: ellipses (rx > ry).
  for (const k of [0.4, 0.65, 0.9]) {
    parts.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${(r * k).toFixed(2)}" ry="${(r * k * 0.55).toFixed(2)}" fill="none" stroke="${STROKE}" stroke-width="0.6" />`,
    )
  }
  // Family 2: hyperbolae (one-sheet).
  for (const p of [r * 0.2, r * 0.35]) {
    const q = r * 0.4
    const pts: string[] = []
    for (let t = -0.9; t <= 0.9; t += 0.06) {
      const x = p / Math.cos(t)
      const y = q * Math.tan(t)
      if (Math.abs(x) < r * 0.95 && Math.abs(y) < r * 0.95)
        pts.push(`${(cx + x).toFixed(2)},${(cy - y).toFixed(2)}`)
    }
    if (pts.length)
      parts.push(
        `<polyline points="${pts.join(' ')}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.6" />`,
      )
    const pts2: string[] = []
    for (let t = -0.9; t <= 0.9; t += 0.06) {
      const x = p / Math.cos(t)
      const y = q * Math.tan(t)
      if (Math.abs(x) < r * 0.95 && Math.abs(y) < r * 0.95)
        pts2.push(`${(cx - x).toFixed(2)},${(cy - y).toFixed(2)}`)
    }
    if (pts2.length)
      parts.push(
        `<polyline points="${pts2.join(' ')}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.6" />`,
      )
  }
  // Family 3: vertical hyperbolae.
  for (const p of [r * 0.25]) {
    const q = r * 0.35
    const pts: string[] = []
    for (let t = -0.9; t <= 0.9; t += 0.06) {
      const y = p / Math.cos(t)
      const x = q * Math.tan(t)
      if (Math.abs(x) < r * 0.95 && Math.abs(y) < r * 0.95)
        pts.push(`${(cx + x).toFixed(2)},${(cy - y).toFixed(2)}`)
    }
    if (pts.length)
      parts.push(
        `<polyline points="${pts.join(' ')}" fill="none" stroke="#7c6e3a" stroke-width="0.6" />`,
      )
  }
  return parts.join('')
}

/** Paraboloidal: three confocal paraboloid families — schematic with two parabola sets + axis hint. */
function drawParaboloidal(): string {
  const { cx, cy, r } = PLOT
  const parts: string[] = []
  const scale = r / 1.6
  for (const c of [0.2, 0.5, 0.85]) {
    const ptsR: string[] = []
    for (let t = -1.2; t <= 1.2; t += 0.07) {
      const x = -c + (t * t) / (4 * c)
      const y = t
      ptsR.push(`${(cx + x * scale).toFixed(2)},${(cy - y * scale).toFixed(2)}`)
    }
    parts.push(
      `<polyline points="${ptsR.join(' ')}" fill="none" stroke="${STROKE}" stroke-width="0.7" />`,
    )
    const ptsL: string[] = []
    for (let t = -1.2; t <= 1.2; t += 0.07) {
      const x = c - (t * t) / (4 * c)
      const y = t
      ptsL.push(`${(cx + x * scale).toFixed(2)},${(cy - y * scale).toFixed(2)}`)
    }
    parts.push(
      `<polyline points="${ptsL.join(' ')}" fill="none" stroke="${STROKE_ALT}" stroke-width="0.7" />`,
    )
  }
  // Vertical parabolas (third family schematic).
  for (const c of [0.35, 0.7]) {
    const pts: string[] = []
    for (let t = -1.2; t <= 1.2; t += 0.08) {
      const y = -c + (t * t) / (4 * c)
      const x = t
      pts.push(`${(cx + x * scale).toFixed(2)},${(cy - y * scale).toFixed(2)}`)
    }
    parts.push(
      `<polyline points="${pts.join(' ')}" fill="none" stroke="#7c6e3a" stroke-width="0.5" />`,
    )
  }
  return parts.join('')
}

/* --------------------------- back-card render --------------------------- */

/**
 * Back-card family block (~440 × 130 px) for coord-system primitives.
 *
 * Layout:
 *   - Top-left: dimension + name banner.
 *   - Below:    schematic basis-vector / coordinate-line sketch
 *               (origin + axes / spokes / parabolic curves) inside a
 *               dashed schematic panel.
 *   - Right column: separable PDEs and basis functions from `attrs`.
 *   - Bottom-left: metric (when present) in monospace.
 */

const BACK_SKETCH_W = 200
const BACK_SKETCH_H = 90
const BACK_SKETCH_CX = BACK_SKETCH_W / 2
const BACK_SKETCH_CY = 16 + BACK_SKETCH_H / 2

const BACK_LIST_X = BACK_SKETCH_W + 20

function backSketchForId(id: string): string {
  const tail = id.split('.').slice(-1)[0]
  const cx = BACK_SKETCH_CX
  const cy = BACK_SKETCH_CY
  const r = 32
  const ink = '#0e2a2f'
  const inkSoft = '#4a6c70'
  // Achromatic — back palette restricts to ink shades.
  switch (tail) {
    case 'cartesian': {
      const lines: string[] = []
      for (let i = -2; i <= 2; i++) {
        lines.push(
          `<line x1="${cx + i * 12}" y1="${cy - r}" x2="${cx + i * 12}" y2="${cy + r}" stroke="${ink}" stroke-width="0.5" opacity="0.6" />`,
        )
        lines.push(
          `<line x1="${cx - r}" y1="${cy + i * 12}" x2="${cx + r}" y2="${cy + i * 12}" stroke="${inkSoft}" stroke-width="0.5" opacity="0.6" />`,
        )
      }
      return lines.join('')
    }
    case 'polar': {
      const parts: string[] = []
      for (let k = 1; k <= 3; k++) {
        parts.push(
          `<circle cx="${cx}" cy="${cy}" r="${(r * k) / 3}" fill="none" stroke="${ink}" stroke-width="0.6" opacity="0.6" />`,
        )
      }
      // Single highlighted spoke + arc.
      const a = (-Math.PI / 6) as number
      parts.push(
        `<line x1="${cx}" y1="${cy}" x2="${(cx + r * Math.cos(a)).toFixed(2)}" y2="${(cy + r * Math.sin(a)).toFixed(2)}" stroke="${ink}" stroke-width="1.2" />`,
      )
      parts.push(
        `<path d="M ${cx + 16} ${cy} A 16 16 0 0 0 ${(cx + 16 * Math.cos(a)).toFixed(2)} ${(cy + 16 * Math.sin(a)).toFixed(2)}" fill="none" stroke="${inkSoft}" stroke-width="0.8" />`,
      )
      return parts.join('')
    }
    case 'spherical':
    case 'circular-cylindrical': {
      // Three axes from origin (3D spherical / cylindrical).
      const parts: string[] = []
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ink}" stroke-width="0.7" opacity="0.5" />`,
      )
      parts.push(
        `<line x1="${cx}" y1="${cy}" x2="${cx + r * 0.95}" y2="${cy}" stroke="${ink}" stroke-width="1.1" />`,
      )
      parts.push(
        `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r * 0.95}" stroke="${ink}" stroke-width="1.1" />`,
      )
      parts.push(
        `<line x1="${cx}" y1="${cy}" x2="${(cx - r * 0.7).toFixed(2)}" y2="${(cy + r * 0.55).toFixed(2)}" stroke="${ink}" stroke-width="1.1" />`,
      )
      parts.push(`<circle cx="${cx}" cy="${cy}" r="2" fill="${ink}" />`)
      return parts.join('')
    }
    case 'parabolic':
    case 'parabolic-cylindrical':
    case 'paraboloidal': {
      const parts: string[] = []
      const scale = r / 1.5
      for (const c of [0.25, 0.55, 0.9]) {
        const ptsR: string[] = []
        for (let t = -1.2; t <= 1.2; t += 0.08) {
          const x = -c + (t * t) / (4 * c)
          const y = t
          ptsR.push(`${(cx + x * scale).toFixed(2)},${(cy - y * scale).toFixed(2)}`)
        }
        parts.push(
          `<polyline points="${ptsR.join(' ')}" fill="none" stroke="${ink}" stroke-width="0.6" opacity="0.7" />`,
        )
        const ptsL: string[] = []
        for (let t = -1.2; t <= 1.2; t += 0.08) {
          const x = c - (t * t) / (4 * c)
          const y = t
          ptsL.push(`${(cx + x * scale).toFixed(2)},${(cy - y * scale).toFixed(2)}`)
        }
        parts.push(
          `<polyline points="${ptsL.join(' ')}" fill="none" stroke="${inkSoft}" stroke-width="0.6" opacity="0.7" />`,
        )
      }
      parts.push(`<circle cx="${cx}" cy="${cy}" r="1.5" fill="${ink}" />`)
      return parts.join('')
    }
    case 'elliptic':
    case 'elliptic-cylindrical':
    case 'prolate-spheroidal':
    case 'oblate-spheroidal':
    case 'ellipsoidal': {
      const parts: string[] = []
      const a = r * 0.55
      for (const Aval of [a * 1.15, a * 1.45, a * 1.8]) {
        const Bval = Math.sqrt(Math.max(0, Aval * Aval - a * a))
        parts.push(
          `<ellipse cx="${cx}" cy="${cy}" rx="${Aval.toFixed(2)}" ry="${Bval.toFixed(2)}" fill="none" stroke="${ink}" stroke-width="0.6" opacity="0.7" />`,
        )
      }
      parts.push(`<circle cx="${cx + a}" cy="${cy}" r="1.4" fill="${ink}" />`)
      parts.push(`<circle cx="${cx - a}" cy="${cy}" r="1.4" fill="${ink}" />`)
      return parts.join('')
    }
    case 'conical': {
      const parts: string[] = []
      parts.push(
        `<path d="M ${cx} ${cy} L ${cx + r * 0.85} ${cy - r * 0.5} M ${cx} ${cy} L ${cx + r * 0.85} ${cy + r * 0.5} M ${cx} ${cy} L ${cx - r * 0.85} ${cy - r * 0.5} M ${cx} ${cy} L ${cx - r * 0.85} ${cy + r * 0.5}" fill="none" stroke="${ink}" stroke-width="0.9" />`,
      )
      parts.push(`<circle cx="${cx}" cy="${cy}" r="2" fill="${ink}" />`)
      return parts.join('')
    }
    default:
      return `<line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="${ink}" stroke-width="0.8" /><line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}" stroke="${ink}" stroke-width="0.8" />`
  }
}

function buildCoordSystemFamilyBlock(primitive: Primitive, attrs: CoordSystemAttrs): string {
  const out: string[] = []

  // Title row: dimension + name.
  out.push(
    `<text x="0" y="10" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" font-weight="600" fill="#0e2a2f">${escapeXml(primitive.name)}  ·  ${attrs.dimension}D</text>`,
  )

  // Schematic panel + sketch.
  out.push(
    `<rect x="0" y="16" width="${BACK_SKETCH_W}" height="${BACK_SKETCH_H}" rx="3" fill="none" stroke="#cdd6d8" stroke-width="0.6" stroke-dasharray="3 3" />`,
  )
  out.push(backSketchForId(primitive.id))
  out.push(
    `<text x="6" y="${16 + BACK_SKETCH_H - 4}" font-family="ui-serif, Georgia, serif" font-size="9" font-style="italic" fill="#8a9c9f">(schematic)</text>`,
  )

  // Right list: separable PDEs + basis functions.
  let listY = 16
  const lineH = 12
  if (attrs.separablePdes && attrs.separablePdes.length > 0) {
    out.push(
      `<text x="${BACK_LIST_X}" y="${listY}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" font-weight="600" fill="#4a6c70" letter-spacing="1.2">SEPARABLE</text>`,
    )
    listY += lineH
    for (const pde of attrs.separablePdes.slice(0, 3)) {
      out.push(
        `<text x="${BACK_LIST_X}" y="${listY}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" fill="#0e2a2f">${escapeXml(pde)}</text>`,
      )
      listY += lineH
    }
    listY += 4
  }
  if (attrs.basisFunctions && attrs.basisFunctions.length > 0) {
    out.push(
      `<text x="${BACK_LIST_X}" y="${listY}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" font-weight="600" fill="#4a6c70" letter-spacing="1.2">BASIS</text>`,
    )
    listY += lineH
    for (const bf of attrs.basisFunctions.slice(0, 2)) {
      out.push(
        `<text x="${BACK_LIST_X}" y="${listY}" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="10" fill="#0e2a2f">${escapeXml(bf)}</text>`,
      )
      listY += lineH
    }
  }

  // Metric (bottom).
  if (attrs.metric) {
    out.push(
      `<text x="0" y="124" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="9" fill="#4a6c70">${escapeXml(attrs.metric)}</text>`,
    )
  }

  return out.join('')
}

export const renderBack: BackRenderer = (primitive, ctx) => {
  if (!isCoordSystemAttrs(primitive.attrs)) {
    return { svg: makeTbdBackRenderer('coord-system')(primitive, ctx).svg }
  }
  const familyBlock = buildCoordSystemFamilyBlock(primitive, primitive.attrs)
  return {
    svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)),
  }
}
