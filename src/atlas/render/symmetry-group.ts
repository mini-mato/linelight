/**
 * Render a symmetry group primitive as an SVG card.
 *
 * Two visual modes dispatched on `attrs.groupType`:
 *   - 'point' : a small polyhedral hint (tetrahedron / octahedron / generic
 *               polygon) with rotation-axis schematics.
 *   - 'lie'   : a Dynkin diagram drawn from `attrs.lieAlgebraType` —
 *               A_n, B_n, C_n, D_n, E_6/7/8, F_4, G_2.
 */

import type { Primitive, SymmetryGroupAttrs } from '../types.js'
import type { BackRenderer, Renderer } from './types.js'
import { DEFAULT_CARD, SVG_CLOSE, escapeXml, svgOpen } from './svg.js'
import { buildBackParts, makeTbdBackRenderer } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'

function isSymmetryGroupAttrs(a: unknown): a is SymmetryGroupAttrs {
  return (
    typeof a === 'object' &&
    a !== null &&
    'groupType' in a &&
    typeof (a as SymmetryGroupAttrs).groupType === 'string'
  )
}

const STROKE = '#1a3a3f'
const STROKE_ALT = '#5b8c5a'

export const renderSymmetryGroup: Renderer = (primitive) => {
  if (!isSymmetryGroupAttrs(primitive.attrs)) {
    throw new Error(`renderSymmetryGroup: ${primitive.id} attrs not SymmetryGroupAttrs`)
  }
  const attrs = primitive.attrs
  const symbol = primitive.symbol ?? ''

  const orderText =
    attrs.order === 'inf'
      ? '|G| = ∞'
      : typeof attrs.order === 'number'
        ? `|G| = ${attrs.order}`
        : ''
  const typeBadge = attrs.groupType.toUpperCase()

  let visual = ''
  if (attrs.groupType === 'lie') {
    visual = drawDynkin(attrs.lieAlgebraType ?? '', attrs.dynkin)
  } else if (attrs.groupType === 'point') {
    visual = drawPointGroup(primitive.id)
  } else {
    visual = drawGenericPolygon()
  }

  const sourceLabel = attrs.groupType === 'lie' ? 'Coxeter 1973' : 'ITC Vol A'
  const detailLine = attrs.lieAlgebraType
    ? `<text class="uncertainty" x="24" y="172">algebra: ${escapeXml(attrs.lieAlgebraType)}</text>`
    : ''

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${DEFAULT_CARD.width - 1.5}" height="${DEFAULT_CARD.height - 1.5}" rx="6" />`,
    `<line class="accent-rule" x1="0" y1="42" x2="${DEFAULT_CARD.width}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="badge-exact" x="${DEFAULT_CARD.width - 20}" y="28" text-anchor="end">${escapeXml(typeBadge)}</text>`,
    symbol ? `<text class="symbol" x="24" y="92">${escapeXml(symbol)}</text>` : '',
    orderText ? `<text class="uncertainty" x="24" y="132">${escapeXml(orderText)}</text>` : '',
    detailLine,
    visual,
    `<text class="source" x="24" y="226">${escapeXml(sourceLabel)}</text>`,
    `<text class="id" x="${DEFAULT_CARD.width - 20}" y="226" text-anchor="end">${escapeXml(primitive.id)}</text>`,
    SVG_CLOSE,
  ].join('')
}

/** Dynkin diagram drawing area. */
const DYN_X0 = 200
const DYN_X1 = 460
const DYN_Y = 130
const NODE_R = 5

type DynkinSpec = {
  nodes: number
  /** edges keyed by lower index; type 1=single, 2=double, 3=triple. arrow direction +1 means shorter root is at the higher index, -1 shorter at the lower. */
  edges: { from: number; to: number; mult: 1 | 2 | 3; arrow?: -1 | 0 | 1 }[]
  /** Optional branches: keyed by node index; vertical offset (in node spacings) */
  branches?: { from: number; offset: number }[]
}

function dynkinSpec(name: string): DynkinSpec | null {
  // Normalize: A_n / An / a_n.
  const m = name
    .replace(/_/g, '')
    .toLowerCase()
    .match(/^([abcdefg])(\d+)$/)
  if (!m) return null
  const family = m[1]
  const n = parseInt(m[2], 10)
  if (n < 1) return null
  const chain = (count: number): { from: number; to: number; mult: 1 | 2 | 3 }[] =>
    Array.from({ length: Math.max(0, count - 1) }, (_, i) => ({
      from: i,
      to: i + 1,
      mult: 1 as const,
    }))
  switch (family) {
    case 'a':
      return { nodes: n, edges: chain(n) }
    case 'b': {
      // o-o-...-o => o (double bond from node n-2 to n-1, arrow toward n-1)
      if (n === 1) return { nodes: 1, edges: [] }
      const edges = chain(n - 1).concat([{ from: n - 2, to: n - 1, mult: 2 as const }])
      // Replace last edge with arrowed double bond from n-2 to n-1.
      const fixed = edges.slice(0, -2).concat([{ from: n - 2, to: n - 1, mult: 2 as const }])
      // Reconstruct: chain(n-1) is edges 0..n-3; then we add the arrowed double bond.
      const out = chain(n - 1).concat([{ from: n - 2, to: n - 1, mult: 2 as const }])
      out[out.length - 1] = { from: n - 2, to: n - 1, mult: 2 as const }
      return {
        nodes: n,
        edges: chain(n - 1).concat([
          {
            from: n - 2,
            to: n - 1,
            mult: 2,
          },
        ]),
      }
      void fixed
    }
    case 'c': {
      if (n === 1) return { nodes: 1, edges: [] }
      return {
        nodes: n,
        edges: chain(n - 1).concat([
          {
            from: n - 2,
            to: n - 1,
            mult: 2,
          },
        ]),
      }
    }
    case 'd': {
      if (n < 2) return null
      // o-o-...-o branching at the (n-2)-th node into two leaves.
      // We render n-1 nodes on the main chain (0..n-2), and a branch node at index n-1
      // connected from node n-3.
      // Actually: D_n has nodes 0..n-1. Edges: 0-1, 1-2, ..., (n-3)-(n-2), and (n-3)-(n-1).
      const e: { from: number; to: number; mult: 1 | 2 | 3 }[] = []
      for (let i = 0; i < n - 2; i++) e.push({ from: i, to: i + 1, mult: 1 })
      if (n >= 3) e.push({ from: n - 3, to: n - 1, mult: 1 })
      return {
        nodes: n,
        edges: e,
        branches: [{ from: n - 3, offset: -1 }],
      }
    }
    case 'e': {
      // E_6: chain of 5 nodes (0..4) with a single branch at index 2 going to node 5.
      // E_7: chain of 6 nodes (0..5) with a branch at index 2 going to node 6.
      // E_8: chain of 7 nodes (0..6) with a branch at index 2 going to node 7.
      if (n < 6 || n > 8) return null
      const chainLen = n - 1
      const e: { from: number; to: number; mult: 1 | 2 | 3 }[] = []
      for (let i = 0; i < chainLen - 1; i++) e.push({ from: i, to: i + 1, mult: 1 })
      e.push({ from: 2, to: chainLen, mult: 1 })
      return {
        nodes: n,
        edges: e,
        branches: [{ from: 2, offset: -1 }],
      }
    }
    case 'f': {
      if (n !== 4) return null
      // F_4: o-o=>o-o (double bond between nodes 1 and 2, arrow points right)
      return {
        nodes: 4,
        edges: [
          { from: 0, to: 1, mult: 1 },
          { from: 1, to: 2, mult: 2, arrow: 1 },
          { from: 2, to: 3, mult: 1 },
        ],
      }
    }
    case 'g': {
      if (n !== 2) return null
      return {
        nodes: 2,
        edges: [{ from: 0, to: 1, mult: 3, arrow: 1 }],
      }
    }
    default:
      return null
  }
}

function drawDynkin(name: string, raw?: string): string {
  const spec = dynkinSpec(name)
  if (!spec) {
    return `<text class="deriv" x="200" y="130">${escapeXml(raw ?? name)}</text>`
  }
  const n = spec.nodes
  const usable = DYN_X1 - DYN_X0
  const spacing = n > 1 ? Math.min(40, usable / (n - 1)) : 0
  const startX = DYN_X0 + (usable - spacing * Math.max(0, n - 1)) / 2
  const xs: number[] = []
  for (let i = 0; i < n; i++) xs.push(startX + i * spacing)
  const branchY = (offset: number) => DYN_Y + offset * 22

  const parts: string[] = []
  // Edges first.
  for (const edge of spec.edges) {
    const isBranch = spec.branches?.some((b) => b.from === edge.from && edge.to >= n - 1)
    const x1 = xs[edge.from]
    const y1 = DYN_Y
    let x2 = xs[edge.to]
    let y2 = DYN_Y
    if (isBranch) {
      const branch = spec.branches!.find((b) => b.from === edge.from)!
      x2 = xs[edge.from]
      y2 = branchY(branch.offset)
    }
    parts.push(...drawDynkinEdge(x1, y1, x2, y2, edge.mult, edge.arrow))
  }
  // Nodes.
  for (let i = 0; i < n; i++) {
    let x = xs[i]
    let y = DYN_Y
    const isBranch = spec.branches?.some((b) => i === n - 1 && b.from <= n - 2)
    if (isBranch) {
      const branch = spec.branches!.find((b) => b.from <= n - 2)!
      x = xs[branch.from]
      y = branchY(branch.offset)
    }
    parts.push(
      `<circle cx="${x}" cy="${y}" r="${NODE_R}" fill="#fff" stroke="${STROKE}" stroke-width="1.2" />`,
    )
  }
  return parts.join('')
}

function drawDynkinEdge(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  mult: 1 | 2 | 3,
  arrow?: -1 | 0 | 1,
): string[] {
  const out: string[] = []
  if (mult === 1) {
    out.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="1.1" />`,
    )
    return out
  }
  // Compute perpendicular offset for parallel lines.
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const gap = 2.6
  const offsets = mult === 2 ? [-gap / 2, gap / 2] : mult === 3 ? [-gap, 0, gap] : [0]
  for (const o of offsets) {
    out.push(
      `<line x1="${(x1 + nx * o).toFixed(2)}" y1="${(y1 + ny * o).toFixed(2)}" x2="${(x2 + nx * o).toFixed(2)}" y2="${(y2 + ny * o).toFixed(2)}" stroke="${STROKE}" stroke-width="1.0" />`,
    )
  }
  // Arrow on multi-bond.
  if (mult >= 2 && (arrow === 1 || arrow === -1)) {
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    const tipX = arrow === 1 ? mx + (dx / len) * 5 : mx - (dx / len) * 5
    const tipY = arrow === 1 ? my + (dy / len) * 5 : my - (dy / len) * 5
    const baseX = arrow === 1 ? mx - (dx / len) * 3 : mx + (dx / len) * 3
    const baseY = arrow === 1 ? my - (dy / len) * 3 : my + (dy / len) * 3
    const wing = 4
    const w1x = baseX + nx * wing
    const w1y = baseY + ny * wing
    const w2x = baseX - nx * wing
    const w2y = baseY - ny * wing
    out.push(
      `<polygon points="${tipX.toFixed(2)},${tipY.toFixed(2)} ${w1x.toFixed(2)},${w1y.toFixed(2)} ${w2x.toFixed(2)},${w2y.toFixed(2)}" fill="${STROKE}" />`,
    )
  }
  return out
}

/** Draw a polyhedral hint for a 3D point group. */
function drawPointGroup(id: string): string {
  const cx = 360
  const cy = 130
  const r = 56
  const panel = `<rect x="${cx - r - 6}" y="${cy - r - 6}" width="${r * 2 + 12}" height="${r * 2 + 12}" rx="4" fill="#f5f8f8" stroke="#cdd6d8" stroke-width="0.6" />`
  if (id.includes('.t-d') || id.includes('.t-h') || id.endsWith('.t')) {
    return panel + drawTetrahedron(cx, cy, r)
  }
  if (id.includes('.o-h') || id.endsWith('.o')) {
    return panel + drawOctahedron(cx, cy, r)
  }
  if (id.includes('.c2') || id.includes('.s4')) {
    return panel + drawNgon(cx, cy, r, 2)
  }
  if (id.includes('.c3') || id.includes('.d3') || id.includes('.s6')) {
    return panel + drawNgon(cx, cy, r, 3)
  }
  if (id.includes('.ci')) {
    return panel + drawInversionPair(cx, cy, r)
  }
  if (id.includes('.cs')) {
    return panel + drawMirror(cx, cy, r)
  }
  return panel + drawNgon(cx, cy, r, 1)
}

function drawTetrahedron(cx: number, cy: number, r: number): string {
  // Four vertices on a sphere; use a 2D projection of a regular tetrahedron.
  const v = [
    { x: 0, y: -1 },
    { x: 0.94, y: 0.33 },
    { x: -0.94, y: 0.33 },
    { x: 0, y: 0.55 },
  ]
  const pts = v.map((p) => ({ x: cx + p.x * r * 0.85, y: cy + p.y * r * 0.85 }))
  const lines: { a: number; b: number }[] = [
    { a: 0, b: 1 },
    { a: 0, b: 2 },
    { a: 0, b: 3 },
    { a: 1, b: 2 },
    { a: 1, b: 3 },
    { a: 2, b: 3 },
  ]
  const parts: string[] = []
  for (const e of lines) {
    parts.push(
      `<line x1="${pts[e.a].x.toFixed(2)}" y1="${pts[e.a].y.toFixed(2)}" x2="${pts[e.b].x.toFixed(2)}" y2="${pts[e.b].y.toFixed(2)}" stroke="${STROKE}" stroke-width="1" />`,
    )
  }
  // C_3 axes through each vertex (toward centroid → opposite face).
  for (const p of pts) {
    parts.push(
      `<line x1="${p.x.toFixed(2)}" y1="${p.y.toFixed(2)}" x2="${cx}" y2="${cy}" stroke="${STROKE_ALT}" stroke-width="0.7" stroke-dasharray="3,2" />`,
    )
  }
  return parts.join('')
}

function drawOctahedron(cx: number, cy: number, r: number): string {
  const v = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0.45, y: -0.18 },
    { x: -0.45, y: 0.18 },
  ]
  const pts = v.map((p) => ({ x: cx + p.x * r * 0.85, y: cy + p.y * r * 0.85 }))
  const lines: { a: number; b: number }[] = [
    { a: 0, b: 2 },
    { a: 0, b: 3 },
    { a: 1, b: 2 },
    { a: 1, b: 3 },
    { a: 0, b: 4 },
    { a: 1, b: 4 },
    { a: 2, b: 4 },
    { a: 0, b: 5 },
    { a: 1, b: 5 },
    { a: 3, b: 5 },
    { a: 4, b: 5 },
    { a: 2, b: 3 },
  ]
  const parts: string[] = []
  for (const e of lines) {
    parts.push(
      `<line x1="${pts[e.a].x.toFixed(2)}" y1="${pts[e.a].y.toFixed(2)}" x2="${pts[e.b].x.toFixed(2)}" y2="${pts[e.b].y.toFixed(2)}" stroke="${STROKE}" stroke-width="0.9" />`,
    )
  }
  // C_4 axis vertical, C_3 axis along the 4-5 diagonal.
  parts.push(
    `<line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}" stroke="${STROKE_ALT}" stroke-width="0.7" stroke-dasharray="3,2" />`,
  )
  parts.push(
    `<line x1="${pts[4].x.toFixed(2)}" y1="${pts[4].y.toFixed(2)}" x2="${pts[5].x.toFixed(2)}" y2="${pts[5].y.toFixed(2)}" stroke="${STROKE_ALT}" stroke-width="0.7" stroke-dasharray="3,2" />`,
  )
  return parts.join('')
}

function drawNgon(cx: number, cy: number, r: number, n: number): string {
  if (n < 2) {
    return `<circle cx="${cx}" cy="${cy}" r="3" fill="${STROKE}" />`
  }
  const parts: string[] = []
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < Math.max(n, 3); i++) {
    const a = (i / Math.max(n, 3)) * Math.PI * 2 - Math.PI / 2
    pts.push({ x: cx + Math.cos(a) * r * 0.7, y: cy + Math.sin(a) * r * 0.7 })
  }
  parts.push(
    `<polygon points="${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}" fill="none" stroke="${STROKE}" stroke-width="1" />`,
  )
  // Rotation axis perpendicular to plane (drawn as a vertical dashed line).
  parts.push(
    `<line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}" stroke="${STROKE_ALT}" stroke-width="0.7" stroke-dasharray="3,2" />`,
  )
  // Show n-fold label.
  parts.push(`<text class="badge-exact" x="${cx + r * 0.85}" y="${cy + 4}">${n}-fold</text>`)
  return parts.join('')
}

function drawInversionPair(cx: number, cy: number, r: number): string {
  return [
    `<circle cx="${cx - r * 0.45}" cy="${cy - r * 0.3}" r="4" fill="${STROKE}" />`,
    `<circle cx="${cx + r * 0.45}" cy="${cy + r * 0.3}" r="4" fill="${STROKE}" />`,
    `<line x1="${cx - r * 0.45}" y1="${cy - r * 0.3}" x2="${cx + r * 0.45}" y2="${cy + r * 0.3}" stroke="${STROKE_ALT}" stroke-width="0.7" stroke-dasharray="2,2" />`,
    `<text class="badge-exact" x="${cx}" y="${cy + r * 0.85}" text-anchor="middle">inversion i</text>`,
  ].join('')
}

function drawMirror(cx: number, cy: number, r: number): string {
  return [
    `<line x1="${cx}" y1="${cy - r * 0.85}" x2="${cx}" y2="${cy + r * 0.85}" stroke="${STROKE}" stroke-width="1.1" />`,
    `<circle cx="${cx - r * 0.45}" cy="${cy}" r="4" fill="${STROKE}" />`,
    `<circle cx="${cx + r * 0.45}" cy="${cy}" r="4" fill="${STROKE}" />`,
    `<text class="badge-exact" x="${cx}" y="${cy + r * 0.95}" text-anchor="middle">mirror σ</text>`,
  ].join('')
}

function drawGenericPolygon(): string {
  return drawNgon(360, 130, 56, 5)
}

/* --------------------------- back-card render --------------------------- */

/**
 * Back-card family block (~440 × 130 px) for symmetry-group primitives.
 *
 * Layout:
 *   - Top row: groupType · order · lieAlgebraType (when present).
 *   - Below:
 *     - Finite groups order ≤ 12: schematic Cayley table grid.
 *     - Lie groups, rank 2 (A_2 / B_2 / G_2): root-system arrows.
 *     - Other Lie groups: Dynkin diagram nodes per `attrs.dynkin`.
 *     - Otherwise: textual fall-through "(see source)".
 */

const BACK_VIZ_W = 230
const BACK_VIZ_H = 110
const BACK_VIZ_OY = 14
const BACK_VIZ_CX = BACK_VIZ_W / 2
const BACK_VIZ_CY = BACK_VIZ_OY + BACK_VIZ_H / 2

const BACK_INFO_X = BACK_VIZ_W + 16

function backCayleySketch(order: number): string {
  const out: string[] = []
  const n = order
  const cell = Math.min(18, Math.floor(BACK_VIZ_W / (n + 1)))
  const gridW = cell * n
  const gridH = cell * n
  const gx = BACK_VIZ_CX - gridW / 2 + cell * 0.5
  const gy = BACK_VIZ_CY - gridH / 2 + cell * 0.5
  // Border + grid lines.
  out.push(
    `<rect x="${gx.toFixed(2)}" y="${gy.toFixed(2)}" width="${gridW}" height="${gridH}" fill="none" stroke="#0e2a2f" stroke-width="0.9" />`,
  )
  for (let i = 1; i < n; i++) {
    out.push(
      `<line x1="${gx + i * cell}" y1="${gy}" x2="${gx + i * cell}" y2="${gy + gridH}" stroke="#4a6c70" stroke-width="0.4" opacity="0.6" />`,
    )
    out.push(
      `<line x1="${gx}" y1="${gy + i * cell}" x2="${gx + gridW}" y2="${gy + i * cell}" stroke="#4a6c70" stroke-width="0.4" opacity="0.6" />`,
    )
  }
  // Label cells with their (i+j) mod n index — schematic only.
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const k = (i + j) % n
      const x = gx + j * cell + cell / 2
      const y = gy + i * cell + cell / 2 + 3
      out.push(
        `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="${(cell - 6).toFixed(1)}" fill="#0e2a2f" opacity="0.85">${k}</text>`,
      )
    }
  }
  return out.join('')
}

function backRootSystem(family: 'a2' | 'b2' | 'g2'): string {
  const out: string[] = []
  const cx = BACK_VIZ_CX
  const cy = BACK_VIZ_CY
  const r = 40
  const ink = '#0e2a2f'
  const inkSoft = '#4a6c70'
  // Reference circle.
  out.push(
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${inkSoft}" stroke-width="0.4" stroke-dasharray="2 2" opacity="0.6" />`,
  )
  let roots: { angle: number; len: number }[] = []
  if (family === 'a2') {
    // A_2: 6 roots at multiples of 60°, equal length.
    roots = [0, 60, 120, 180, 240, 300].map((d) => ({ angle: (d * Math.PI) / 180, len: 1 }))
  } else if (family === 'b2') {
    // B_2 / C_2: 4 long roots at 0,90,180,270 (length sqrt(2)) and 4 short at 45,135,225,315 (length 1).
    roots = [
      { angle: 0, len: Math.SQRT2 },
      { angle: Math.PI / 2, len: Math.SQRT2 },
      { angle: Math.PI, len: Math.SQRT2 },
      { angle: (3 * Math.PI) / 2, len: Math.SQRT2 },
      { angle: Math.PI / 4, len: 1 },
      { angle: (3 * Math.PI) / 4, len: 1 },
      { angle: (5 * Math.PI) / 4, len: 1 },
      { angle: (7 * Math.PI) / 4, len: 1 },
    ]
  } else {
    // G_2: 12 roots — 6 long (angles 30,90,150,210,270,330; length sqrt(3)) and 6 short (0,60,120,180,240,300; length 1).
    const longD = [30, 90, 150, 210, 270, 330]
    const shortD = [0, 60, 120, 180, 240, 300]
    roots = [
      ...longD.map((d) => ({ angle: (d * Math.PI) / 180, len: Math.sqrt(3) })),
      ...shortD.map((d) => ({ angle: (d * Math.PI) / 180, len: 1 })),
    ]
  }
  // Normalize lengths.
  const maxLen = Math.max(...roots.map((rt) => rt.len))
  for (const rt of roots) {
    const L = (rt.len / maxLen) * r * 0.9
    const x2 = cx + L * Math.cos(rt.angle)
    const y2 = cy - L * Math.sin(rt.angle)
    out.push(
      `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${ink}" stroke-width="1" />`,
    )
    // Arrowhead.
    const ah = 4
    const a = rt.angle
    const tipX = x2
    const tipY = y2
    const baseX = x2 - ah * Math.cos(a)
    const baseY = y2 + ah * Math.sin(a)
    const w1x = baseX + ah * 0.6 * Math.cos(a + Math.PI / 2)
    const w1y = baseY - ah * 0.6 * Math.sin(a + Math.PI / 2)
    const w2x = baseX + ah * 0.6 * Math.cos(a - Math.PI / 2)
    const w2y = baseY - ah * 0.6 * Math.sin(a - Math.PI / 2)
    out.push(
      `<polygon points="${tipX.toFixed(2)},${tipY.toFixed(2)} ${w1x.toFixed(2)},${w1y.toFixed(2)} ${w2x.toFixed(2)},${w2y.toFixed(2)}" fill="${ink}" />`,
    )
  }
  return out.join('')
}

function backDynkinDiagram(name: string, dynkinRaw: string | undefined): string {
  // Reuse the front-renderer's dynkinSpec.
  const spec = dynkinSpec(name)
  if (!spec) {
    return `<text x="${BACK_VIZ_CX}" y="${BACK_VIZ_CY}" text-anchor="middle" font-family="ui-serif, Georgia, serif" font-size="11" font-style="italic" fill="#4a6c70">${escapeXml(dynkinRaw ?? name)}</text>`
  }
  const n = spec.nodes
  const usable = BACK_VIZ_W - 40
  const spacing = n > 1 ? Math.min(28, usable / (n - 1)) : 0
  const startX = 20 + (usable - spacing * Math.max(0, n - 1)) / 2
  const xs: number[] = []
  for (let i = 0; i < n; i++) xs.push(startX + i * spacing)
  const branchY = (offset: number) => BACK_VIZ_CY + offset * 18

  const parts: string[] = []
  // Edges.
  for (const edge of spec.edges) {
    const isBranch = spec.branches?.some((b) => b.from === edge.from && edge.to >= n - 1)
    const x1 = xs[edge.from]
    const y1 = BACK_VIZ_CY
    let x2 = xs[edge.to]
    let y2 = BACK_VIZ_CY
    if (isBranch) {
      const branch = spec.branches!.find((b) => b.from === edge.from)!
      x2 = xs[edge.from]
      y2 = branchY(branch.offset)
    }
    parts.push(...drawDynkinEdge(x1, y1, x2, y2, edge.mult, edge.arrow))
  }
  // Nodes.
  for (let i = 0; i < n; i++) {
    let x = xs[i]
    let y = BACK_VIZ_CY
    const isBranch = spec.branches?.some((b) => i === n - 1 && b.from <= n - 2)
    if (isBranch) {
      const branch = spec.branches!.find((b) => b.from <= n - 2)!
      x = xs[branch.from]
      y = branchY(branch.offset)
    }
    parts.push(
      `<circle cx="${x}" cy="${y}" r="4" fill="#fff" stroke="#0e2a2f" stroke-width="1.1" />`,
    )
  }
  return parts.join('')
}

function backInfoColumn(primitive: Primitive, attrs: SymmetryGroupAttrs): string {
  type Row = { label: string; value: string }
  const rows: Row[] = []
  rows.push({ label: 'type', value: attrs.groupType })
  if (attrs.order !== undefined) {
    rows.push({ label: 'order', value: attrs.order === 'inf' ? '∞' : String(attrs.order) })
  }
  if (attrs.lieAlgebraType) rows.push({ label: 'algebra', value: attrs.lieAlgebraType })
  if (attrs.dynkin) rows.push({ label: 'dynkin', value: attrs.dynkin })
  if (primitive.symbol) rows.push({ label: 'symbol', value: primitive.symbol })
  const out: string[] = []
  let y = 14
  const lineH = 13
  for (const row of rows) {
    out.push(
      `<text x="${BACK_INFO_X}" y="${y}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" font-weight="600" fill="#4a6c70" letter-spacing="1.0">${escapeXml(row.label.toUpperCase())}</text>`,
    )
    out.push(
      `<text x="${BACK_INFO_X + 56}" y="${y}" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="10" fill="#0e2a2f">${escapeXml(row.value)}</text>`,
    )
    y += lineH
  }
  return out.join('')
}

function buildSymmetryGroupFamilyBlock(primitive: Primitive, attrs: SymmetryGroupAttrs): string {
  const out: string[] = []

  // Schematic visualization area.
  let viz = ''
  let isSchematic = false
  if (
    (attrs.groupType === 'point' || attrs.groupType === 'finite') &&
    typeof attrs.order === 'number' &&
    attrs.order <= 12 &&
    attrs.order >= 2
  ) {
    viz = backCayleySketch(attrs.order)
    isSchematic = true
  } else if (attrs.groupType === 'lie') {
    const algebra = (attrs.lieAlgebraType ?? '').replace(/_/g, '').toLowerCase()
    if (algebra === 'a2') viz = backRootSystem('a2')
    else if (algebra === 'b2' || algebra === 'c2') viz = backRootSystem('b2')
    else if (algebra === 'g2') viz = backRootSystem('g2')
    else viz = backDynkinDiagram(attrs.lieAlgebraType ?? '', attrs.dynkin)
  } else {
    // Too large or unsupported.
    viz = `<text x="${BACK_VIZ_CX}" y="${BACK_VIZ_CY}" text-anchor="middle" font-family="ui-serif, Georgia, serif" font-size="11" font-style="italic" fill="#4a6c70">(see source)</text>`
  }

  // Schematic panel (only for Cayley sketches; Dynkin / root systems are exact).
  if (isSchematic) {
    out.push(
      `<rect x="0" y="${BACK_VIZ_OY}" width="${BACK_VIZ_W}" height="${BACK_VIZ_H}" rx="3" fill="none" stroke="#cdd6d8" stroke-width="0.6" stroke-dasharray="3 3" />`,
    )
  }
  out.push(viz)
  if (isSchematic) {
    out.push(
      `<text x="6" y="${BACK_VIZ_OY + BACK_VIZ_H - 4}" font-family="ui-serif, Georgia, serif" font-size="9" font-style="italic" fill="#8a9c9f">(schematic Cayley table)</text>`,
    )
  }

  out.push(backInfoColumn(primitive, attrs))
  return out.join('')
}

export const renderBack: BackRenderer = (primitive, ctx) => {
  if (!isSymmetryGroupAttrs(primitive.attrs)) {
    return { svg: makeTbdBackRenderer('symmetry-group')(primitive, ctx).svg }
  }
  const familyBlock = buildSymmetryGroupFamilyBlock(primitive, primitive.attrs)
  return {
    svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)),
  }
}
