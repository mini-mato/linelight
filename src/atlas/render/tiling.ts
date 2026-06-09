/**
 * Render a regular-tiling primitive as an SVG card.
 *
 * Visual strategy:
 *   - 2D Euclidean: draw a finite patch of the tiling (10-30 cells).
 *     - {3,6} triangular: rows of upward + downward triangles.
 *     - {4,4} square: a square grid.
 *     - {6,3} hexagonal: honeycomb grid.
 *   - 2D hyperbolic: draw the Poincare disk boundary and a recursive
 *     fundamental triangle / polygon tessellation. Quality is
 *     approximate — fragments are drawn as Euclidean polygons inside the
 *     disk, which is the standard pictorial convention for these card
 *     thumbnails (the rigorous geodesic-arc rendering is heavier).
 *   - 3D Euclidean (cubic honeycomb): isometric projection of a 2x2x2 stack
 *     of cubes.
 *
 * Card layout matches src/atlas/render/constant.ts.
 */

import type { Primitive } from '../types.js'
import type { BackRenderer, Renderer } from './types.js'
import { DEFAULT_CARD, SVG_CLOSE, escapeXml, svgOpen } from './svg.js'
import { buildBackParts, makeTbdBackRenderer } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'

type TilingAttrs = {
  dimension?: number
  geometry?: 'euclidean' | 'hyperbolic'
  schlafli?: (number | 'n')[]
  vertexFigure?: string
  cellType?: string
  dual?: string
}

const CARD_W = DEFAULT_CARD.width
const CARD_H = DEFAULT_CARD.height
const VIZ_CX = CARD_W * 0.35
const VIZ_CY = 138
const VIZ_R = 78

function asTilingAttrs(a: unknown): TilingAttrs {
  if (typeof a !== 'object' || a === null) return {}
  return a as TilingAttrs
}

export const renderTiling: Renderer = (primitive, ctx) => {
  const attrs = asTilingAttrs(primitive.attrs)
  const source = ctx.sources.get(primitive.sourceId)
  const sourceLabel = sourceShortLabel(source?.id ?? primitive.sourceId)

  let visual = ''
  if (attrs.geometry === 'hyperbolic') {
    visual = renderHyperbolic(attrs)
  } else if (attrs.dimension === 2) {
    visual = renderEuclidean2D(primitive, attrs)
  } else if (attrs.dimension === 3) {
    visual = renderCubicHoneycomb()
  }

  const symbol = primitive.symbol ?? ''
  const info = buildInfoText(attrs)

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${CARD_W - 1.5}" height="${CARD_H - 1.5}" rx="6" />`,
    `<line class="accent-rule" x1="0" y1="42" x2="${CARD_W}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="badge-exact" x="${CARD_W - 20}" y="28" text-anchor="end">TILING</text>`,
    visual,
    symbol
      ? `<text class="symbol" x="${CARD_W - 20}" y="100" text-anchor="end">${escapeXml(symbol)}</text>`
      : '',
    info,
    `<text class="source" x="24" y="226">${escapeXml(sourceLabel)}</text>`,
    `<text class="id" x="${CARD_W - 20}" y="226" text-anchor="end">${escapeXml(primitive.id)}</text>`,
    SVG_CLOSE,
  ].join('')
}

/* ------------------------- Euclidean 2D tilings ------------------------- */

function renderEuclidean2D(primitive: Primitive, attrs: TilingAttrs): string {
  const schlafli = attrs.schlafli
  if (!schlafli || schlafli.length < 2) return ''
  const p = schlafli[0]
  if (primitive.id.endsWith('triangular')) return renderTriangularTiling()
  if (primitive.id.endsWith('square')) return renderSquareTiling()
  if (primitive.id.endsWith('hexagonal')) return renderHexagonalTiling()
  // Fallback by symbol.
  if (p === 3) return renderTriangularTiling()
  if (p === 4) return renderSquareTiling()
  if (p === 6) return renderHexagonalTiling()
  return ''
}

function renderTriangularTiling(): string {
  const out: string[] = []
  const s = 22 // edge length in pixels
  const h = (s * Math.sqrt(3)) / 2
  const cols = 8
  const rows = 6
  const ox = VIZ_CX - (cols * s) / 2
  const oy = VIZ_CY - (rows * h) / 2
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = ox + col * (s / 2)
      const y0 = oy + row * h
      // Up-pointing triangle on even (col+row), down-pointing on odd.
      const isUp = (col + row) % 2 === 0
      const pts: [number, number][] = isUp
        ? [
            [x0, y0 + h],
            [x0 + s, y0 + h],
            [x0 + s / 2, y0],
          ]
        : [
            [x0, y0],
            [x0 + s, y0],
            [x0 + s / 2, y0 + h],
          ]
      const pathPts = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
      const inDisk = pts.every(([x, y]) => Math.hypot(x - VIZ_CX, y - VIZ_CY) < VIZ_R + 8)
      if (!inDisk) continue
      out.push(`<polygon points="${pathPts}" fill="none" stroke="#1a3a3f" stroke-width="1" />`)
    }
  }
  return out.join('')
}

function renderSquareTiling(): string {
  const out: string[] = []
  const s = 20
  const cols = 7
  const rows = 7
  const ox = VIZ_CX - (cols * s) / 2
  const oy = VIZ_CY - (rows * s) / 2
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = ox + c * s
      const y = oy + r * s
      const cx = x + s / 2
      const cy = y + s / 2
      if (Math.hypot(cx - VIZ_CX, cy - VIZ_CY) > VIZ_R) continue
      out.push(
        `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${s}" height="${s}" fill="none" stroke="#1a3a3f" stroke-width="1" />`,
      )
    }
  }
  return out.join('')
}

function renderHexagonalTiling(): string {
  const out: string[] = []
  const s = 16 // hex side length
  const w = Math.sqrt(3) * s
  const h = 2 * s
  const cols = 6
  const rows = 6
  const ox = VIZ_CX - (cols * w) / 2
  const oy = VIZ_CY - (rows * (h * 0.75)) / 2
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = ox + c * w + (r % 2 === 0 ? 0 : w / 2)
      const cy = oy + r * h * 0.75
      if (Math.hypot(cx - VIZ_CX, cy - VIZ_CY) > VIZ_R) continue
      const pts: string[] = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6
        const px = cx + s * Math.cos(a)
        const py = cy + s * Math.sin(a)
        pts.push(`${px.toFixed(2)},${py.toFixed(2)}`)
      }
      out.push(
        `<polygon points="${pts.join(' ')}" fill="none" stroke="#1a3a3f" stroke-width="1" />`,
      )
    }
  }
  return out.join('')
}

/* --------------------------- Hyperbolic tiling --------------------------- */

/**
 * Approximate Poincare-disk rendering of a regular tiling {p, q}. We draw
 * the bounding disk and emit straight-edged polygons for the visible cells.
 * This is a stylized indicator — sufficient for a 480x240 thumbnail card
 * but not a substitute for a true geodesic-arc tessellation.
 *
 * Strategy: place a central p-gon, then replicate it by reflection through
 * mid-edges (hyperbolic equivalent) approximated as Euclidean reflections
 * with an inward-shrinking factor.
 */
function renderHyperbolic(attrs: TilingAttrs): string {
  const sch = attrs.schlafli
  if (!sch || sch.length < 2) return ''
  const p = typeof sch[0] === 'number' ? (sch[0] as number) : 5
  const q = typeof sch[1] === 'number' ? (sch[1] as number) : 4

  const out: string[] = []
  // Bounding Poincare disk.
  out.push(
    `<circle cx="${VIZ_CX}" cy="${VIZ_CY}" r="${VIZ_R}" fill="#fdfdfd" stroke="#1a3a3f" stroke-width="1.25" />`,
  )

  // Hyperbolic radius of central p-gon vertex on Poincare disk:
  // r0 = sqrt((cos(pi/p + pi/q)) / (cos(pi/p - pi/q))) — only valid when
  //      1/p + 1/q < 1/2 (hyperbolic case). Standard formula.
  // tan(theta_p) tan(theta_q) > 1 for hyperbolic case.
  const angleSum = Math.PI / p + Math.PI / q
  const angleDiff = Math.PI / p - Math.PI / q
  const cs = Math.cos(angleSum)
  const cd = Math.cos(angleDiff)
  let r0 = 0.5
  if (cs > 0 && cd > 0) {
    r0 = Math.sqrt(cs / cd)
  } else {
    // Fallback for non-hyperbolic params; keep something visible.
    r0 = 0.5
  }
  // Normalize to disk pixel radius.
  const pixelR0 = r0 * VIZ_R

  // Central p-gon vertices.
  const central: [number, number][] = []
  for (let i = 0; i < p; i++) {
    const a = (2 * Math.PI * i) / p - Math.PI / 2
    central.push([VIZ_CX + pixelR0 * Math.cos(a), VIZ_CY + pixelR0 * Math.sin(a)])
  }
  out.push(polyTag(central, '#1a3a3f', 'rgba(91,140,90,0.05)'))

  // Reflect central polygon through each of its edges to get neighbor cells.
  // Approximate: place neighbor polygon vertices by inversion-like reflection
  // of the central polygon's vertices through the edge midpoint, then shrink
  // toward the disk boundary using a tanh-like contraction so subsequent
  // generations stay inside the disk.
  const generations = 2
  const polygons: [number, number][][] = [central]
  let frontier = [central]
  for (let g = 0; g < generations; g++) {
    const nextFrontier: [number, number][][] = []
    for (const poly of frontier) {
      for (let e = 0; e < poly.length; e++) {
        const a = poly[e]
        const b = poly[(e + 1) % poly.length]
        const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        // Reflect each vertex through the line through midpoint perpendicular
        // to the edge midpoint vector from disk center; then contract.
        const reflected = poly.map((v) => reflectAcrossEdge(v, a, b))
        // Contract toward disk boundary so neighbor doesn't overlap central.
        const contracted = reflected.map(([x, y]) => contractTowardDisk(x, y, mid, 0.78))
        // Skip if any vertex lies outside disk significantly.
        const inside = contracted.every(([x, y]) => Math.hypot(x - VIZ_CX, y - VIZ_CY) < VIZ_R - 1)
        if (!inside) continue
        nextFrontier.push(contracted)
        polygons.push(contracted)
      }
    }
    frontier = nextFrontier
  }

  for (const poly of polygons.slice(1)) {
    out.push(polyTag(poly, '#1a3a3f', 'none'))
  }

  return out.join('')
}

function polyTag(pts: [number, number][], stroke: string, fill: string): string {
  const s = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  return `<polygon points="${s}" fill="${fill}" stroke="${stroke}" stroke-width="1" />`
}

function reflectAcrossEdge(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): [number, number] {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-9) return p
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
  const projX = a[0] + t * dx
  const projY = a[1] + t * dy
  return [2 * projX - p[0], 2 * projY - p[1]]
}

function contractTowardDisk(
  x: number,
  y: number,
  anchor: [number, number],
  factor: number,
): [number, number] {
  // Pull point toward the anchor (edge midpoint) by `factor`.
  return [anchor[0] + (x - anchor[0]) * factor, anchor[1] + (y - anchor[1]) * factor]
}

/* --------------------------- 3D cubic honeycomb --------------------------- */

function renderCubicHoneycomb(): string {
  // Draw a 2x2x2 stack of cubes in isometric projection.
  const out: string[] = []
  const n = 2
  const s = 1
  const isoProject = (x: number, y: number, z: number): [number, number] => {
    const ay = (30 * Math.PI) / 180
    const ax = (25 * Math.PI) / 180
    const x1 = x * Math.cos(ay) + z * Math.sin(ay)
    const z1 = -x * Math.sin(ay) + z * Math.cos(ay)
    const y2 = y * Math.cos(ax) - z1 * Math.sin(ax)
    return [x1, y2]
  }
  // Collect all unit-cube edges (deduplicated).
  type EdgeKey = string
  const edges = new Map<EdgeKey, [Vec3, Vec3]>()
  for (let ix = 0; ix < n; ix++) {
    for (let iy = 0; iy < n; iy++) {
      for (let iz = 0; iz < n; iz++) {
        const corners: Vec3[] = []
        for (const dx of [0, 1])
          for (const dy of [0, 1])
            for (const dz of [0, 1]) corners.push([ix + dx, iy + dy, iz + dz])
        // 12 edges of the cube.
        const cubeEdges: [number, number][] = [
          [0, 1],
          [0, 2],
          [0, 4],
          [1, 3],
          [1, 5],
          [2, 3],
          [2, 6],
          [3, 7],
          [4, 5],
          [4, 6],
          [5, 7],
          [6, 7],
        ]
        for (const [i, j] of cubeEdges) {
          const a = corners[i]
          const b = corners[j]
          const k1 = `${a[0]},${a[1]},${a[2]}`
          const k2 = `${b[0]},${b[1]},${b[2]}`
          const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`
          edges.set(key, [a, b])
        }
      }
    }
  }
  // Project and compute extents.
  const projectedEdges: [[number, number], [number, number], number][] = []
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  for (const [a, b] of edges.values()) {
    const pa = isoProject(a[0] * s, a[1] * s, a[2] * s)
    const pb = isoProject(b[0] * s, b[1] * s, b[2] * s)
    const depth = (a[2] + b[2]) / 2
    projectedEdges.push([pa, pb, depth])
    for (const [x, y] of [pa, pb]) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const w = maxX - minX
  const h = maxY - minY
  const scaleS = (VIZ_R * 1.6) / Math.max(w, h, 1e-6)
  const cxOff = (minX + maxX) / 2
  const cyOff = (minY + maxY) / 2

  // Sort by depth so back edges drawn first.
  projectedEdges.sort((a2, b2) => a2[2] - b2[2])
  const depths = projectedEdges.map((e) => e[2]).sort((a2, b2) => a2 - b2)
  const median = depths[Math.floor(depths.length / 2)]
  for (const [pa, pb, depth] of projectedEdges) {
    const [x1raw, y1raw] = pa
    const [x2raw, y2raw] = pb
    const x1 = VIZ_CX + scaleS * (x1raw - cxOff)
    const y1 = VIZ_CY - scaleS * (y1raw - cyOff)
    const x2 = VIZ_CX + scaleS * (x2raw - cxOff)
    const y2 = VIZ_CY - scaleS * (y2raw - cyOff)
    const isBack = depth < median
    const opacity = isBack ? 0.35 : 0.9
    const dash = isBack ? ' stroke-dasharray="3 3"' : ''
    out.push(
      `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#1a3a3f" stroke-width="1" opacity="${opacity}"${dash} />`,
    )
  }
  return out.join('')
}

type Vec3 = readonly [number, number, number]

/* --------------------------- shared helpers --------------------------- */

function buildInfoText(attrs: TilingAttrs): string {
  const parts: string[] = []
  if (attrs.geometry) parts.push(attrs.geometry)
  if (attrs.vertexFigure) parts.push(`vf ${attrs.vertexFigure}`)
  if (parts.length === 0) return ''
  return `<text class="uncertainty" x="${CARD_W - 20}" y="200" text-anchor="end">${escapeXml(parts.join('   '))}</text>`
}

function sourceShortLabel(sourceId: string): string {
  const map: Record<string, string> = {
    'coxeter-1973': 'Coxeter 1973',
    'itc-vol-a': 'ITC Vol A',
  }
  return map[sourceId] ?? sourceId.toUpperCase()
}

/* --------------------------- back-card render --------------------------- */

/**
 * Back-card family block (~440 × 130 px) for tiling primitives.
 *
 * A small repeating-tile pattern fragment showing 4–9 tiles consistent
 * with the wallpaper / Schläfli group. Right column carries the symbol
 * and the vertex figure / cell type. Pattern is schematic — labelled.
 */

const BACK_TILE_W = 220
const BACK_TILE_H = 110
const BACK_TILE_OX = 0
const BACK_TILE_OY = 10

function backTilingFragment(primitive: Primitive, attrs: TilingAttrs): string {
  const ink = '#0e2a2f'
  // Determine pattern type from id or schlafli.
  const id = primitive.id
  const sch = attrs.schlafli ?? []

  if (id.endsWith('triangular') || sch[0] === 3) {
    return tilingTriangles(BACK_TILE_OX, BACK_TILE_OY, ink)
  }
  if (id.endsWith('square') || (sch[0] === 4 && sch[1] === 4)) {
    return tilingSquares(BACK_TILE_OX, BACK_TILE_OY, ink)
  }
  if (id.endsWith('hexagonal') || sch[0] === 6) {
    return tilingHexagons(BACK_TILE_OX, BACK_TILE_OY, ink)
  }
  if (attrs.geometry === 'hyperbolic') {
    return tilingHyperbolicGlimpse(BACK_TILE_OX, BACK_TILE_OY, ink)
  }
  if (id.endsWith('cubic-honeycomb') || (sch[0] === 4 && sch[1] === 3 && sch[2] === 4)) {
    return tilingCubeStack(BACK_TILE_OX, BACK_TILE_OY, ink)
  }
  return tilingSquares(BACK_TILE_OX, BACK_TILE_OY, ink)
}

function tilingTriangles(ox: number, oy: number, ink: string): string {
  const out: string[] = []
  const s = 32
  const h = (s * Math.sqrt(3)) / 2
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 7; col++) {
      const x0 = ox + col * (s / 2)
      const y0 = oy + row * h
      if (x0 + s > ox + BACK_TILE_W || y0 + h > oy + BACK_TILE_H) continue
      const isUp = (col + row) % 2 === 0
      const pts: [number, number][] = isUp
        ? [
            [x0, y0 + h],
            [x0 + s, y0 + h],
            [x0 + s / 2, y0],
          ]
        : [
            [x0, y0],
            [x0 + s, y0],
            [x0 + s / 2, y0 + h],
          ]
      out.push(
        `<polygon points="${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}" fill="none" stroke="${ink}" stroke-width="0.9" />`,
      )
    }
  }
  return out.join('')
}

function tilingSquares(ox: number, oy: number, ink: string): string {
  const out: string[] = []
  const s = 32
  const cols = Math.floor(BACK_TILE_W / s)
  const rows = Math.floor(BACK_TILE_H / s)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = ox + c * s
      const y = oy + r * s
      out.push(
        `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="none" stroke="${ink}" stroke-width="0.9" />`,
      )
    }
  }
  return out.join('')
}

function tilingHexagons(ox: number, oy: number, ink: string): string {
  const out: string[] = []
  const s = 18
  const w = Math.sqrt(3) * s
  const h = 2 * s
  const cols = 4
  const rows = 3
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = ox + 18 + c * w + (r % 2 === 0 ? 0 : w / 2)
      const cy = oy + 18 + r * h * 0.75
      if (cx > ox + BACK_TILE_W - 4 || cy > oy + BACK_TILE_H - 4) continue
      const pts: string[] = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6
        pts.push(`${(cx + s * Math.cos(a)).toFixed(2)},${(cy + s * Math.sin(a)).toFixed(2)}`)
      }
      out.push(
        `<polygon points="${pts.join(' ')}" fill="none" stroke="${ink}" stroke-width="0.9" />`,
      )
    }
  }
  return out.join('')
}

function tilingHyperbolicGlimpse(ox: number, oy: number, ink: string): string {
  const cx = ox + BACK_TILE_W / 2
  const cy = oy + BACK_TILE_H / 2
  const r = 48
  const out: string[] = []
  // Bounding Poincaré disk.
  out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ink}" stroke-width="1" />`)
  // A few representative geodesic-arc segments meeting boundary at right angles.
  const arcSpecs = [
    { d: 1.4, rho: Math.sqrt(1.4 * 1.4 - 1) },
    { d: 1.8, rho: Math.sqrt(1.8 * 1.8 - 1) },
    { d: 2.2, rho: Math.sqrt(2.2 * 2.2 - 1) },
  ]
  const angles = [0.4, Math.PI * 0.7, Math.PI * 1.3]
  for (let i = 0; i < arcSpecs.length; i++) {
    const { d, rho } = arcSpecs[i]
    const a = angles[i]
    const ox2 = cx + Math.cos(a) * d * r
    const oy2 = cy + Math.sin(a) * d * r
    const R = rho * r
    const pts: string[] = []
    for (let t = 0; t < 360; t += 4) {
      const th = (t * Math.PI) / 180
      const px = ox2 + R * Math.cos(th)
      const py = oy2 + R * Math.sin(th)
      const dxp = px - cx
      const dyp = py - cy
      if (dxp * dxp + dyp * dyp <= r * r * 0.99) {
        pts.push(`${px.toFixed(2)},${py.toFixed(2)}`)
      } else if (pts.length) {
        out.push(
          `<polyline points="${pts.join(' ')}" fill="none" stroke="${ink}" stroke-width="0.85" />`,
        )
        pts.length = 0
      }
    }
    if (pts.length) {
      out.push(
        `<polyline points="${pts.join(' ')}" fill="none" stroke="${ink}" stroke-width="0.85" />`,
      )
    }
  }
  out.push(
    `<line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}" stroke="${ink}" stroke-width="0.85" />`,
  )
  return out.join('')
}

function tilingCubeStack(ox: number, oy: number, ink: string): string {
  const out: string[] = []
  const cx = ox + BACK_TILE_W / 2
  const cy = oy + BACK_TILE_H / 2
  const s = 22
  // 2x2x2 stack, isometric.
  const iso = (x: number, y: number, z: number): [number, number] => {
    const ay = (30 * Math.PI) / 180
    const ax = (25 * Math.PI) / 180
    const x1 = x * Math.cos(ay) + z * Math.sin(ay)
    const z1 = -x * Math.sin(ay) + z * Math.cos(ay)
    const y2 = y * Math.cos(ax) - z1 * Math.sin(ax)
    return [x1, y2]
  }
  const edges = new Map<
    string,
    [readonly [number, number, number], readonly [number, number, number]]
  >()
  for (let ix = 0; ix < 2; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      for (let iz = 0; iz < 2; iz++) {
        const corners: [number, number, number][] = []
        for (const dx of [0, 1])
          for (const dy of [0, 1])
            for (const dz of [0, 1]) corners.push([ix + dx, iy + dy, iz + dz])
        const cubeEdges: [number, number][] = [
          [0, 1],
          [0, 2],
          [0, 4],
          [1, 3],
          [1, 5],
          [2, 3],
          [2, 6],
          [3, 7],
          [4, 5],
          [4, 6],
          [5, 7],
          [6, 7],
        ]
        for (const [i, j] of cubeEdges) {
          const a = corners[i]
          const b = corners[j]
          const k1 = `${a[0]},${a[1]},${a[2]}`
          const k2 = `${b[0]},${b[1]},${b[2]}`
          const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`
          edges.set(key, [a, b])
        }
      }
    }
  }
  // Project & center.
  const proj: { p1: [number, number]; p2: [number, number]; depth: number }[] = []
  for (const [a, b] of edges.values()) {
    const p1 = iso(a[0] * s, a[1] * s, a[2] * s)
    const p2 = iso(b[0] * s, b[1] * s, b[2] * s)
    proj.push({ p1, p2, depth: (a[2] + b[2]) / 2 })
  }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const e of proj) {
    for (const [x, y] of [e.p1, e.p2]) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const w = maxX - minX
  const h = maxY - minY
  const scaleS = Math.min((BACK_TILE_W - 20) / w, (BACK_TILE_H - 20) / h)
  const cxOff = (minX + maxX) / 2
  const cyOff = (minY + maxY) / 2
  proj.sort((a, b) => a.depth - b.depth)
  const depths = proj.map((e) => e.depth).sort((a, b) => a - b)
  const median = depths[Math.floor(depths.length / 2)]
  for (const e of proj) {
    const isBack = e.depth < median
    const opacity = isBack ? 0.35 : 0.95
    const dash = isBack ? ' stroke-dasharray="3 3"' : ''
    const x1 = cx + scaleS * (e.p1[0] - cxOff)
    const y1 = cy - scaleS * (e.p1[1] - cyOff)
    const x2 = cx + scaleS * (e.p2[0] - cxOff)
    const y2 = cy - scaleS * (e.p2[1] - cyOff)
    out.push(
      `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${ink}" stroke-width="0.85" opacity="${opacity}"${dash} />`,
    )
  }
  return out.join('')
}

function backTilingStats(primitive: Primitive, attrs: TilingAttrs): string {
  type Row = { label: string; value: string }
  const rows: Row[] = []
  if (primitive.symbol) rows.push({ label: 'group', value: primitive.symbol })
  if (attrs.geometry) rows.push({ label: 'geometry', value: attrs.geometry })
  if (attrs.vertexFigure) rows.push({ label: 'v-figure', value: attrs.vertexFigure })
  if (attrs.cellType) rows.push({ label: 'cell', value: attrs.cellType })
  if (attrs.dual) rows.push({ label: 'dual', value: attrs.dual.split('.').pop() ?? attrs.dual })
  const out: string[] = []
  const startY = 14
  const lineH = 14
  const labelX = BACK_TILE_W + 20
  rows.forEach((row, i) => {
    const y = startY + i * lineH
    out.push(
      `<text x="${labelX}" y="${y}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" font-weight="600" fill="#4a6c70" letter-spacing="1.0">${escapeXml(row.label.toUpperCase())}</text>`,
    )
    out.push(
      `<text x="${labelX + 60}" y="${y}" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="10" fill="#0e2a2f">${escapeXml(row.value)}</text>`,
    )
  })
  return out.join('')
}

function buildTilingFamilyBlock(primitive: Primitive, attrs: TilingAttrs): string {
  const out: string[] = []
  out.push(
    `<rect x="${BACK_TILE_OX}" y="${BACK_TILE_OY}" width="${BACK_TILE_W}" height="${BACK_TILE_H}" rx="3" fill="none" stroke="#cdd6d8" stroke-width="0.6" stroke-dasharray="3 3" />`,
  )
  out.push(backTilingFragment(primitive, attrs))
  out.push(
    `<text x="6" y="${BACK_TILE_OY + BACK_TILE_H + 6}" font-family="ui-serif, Georgia, serif" font-size="9" font-style="italic" fill="#8a9c9f">(schematic — fragment, not a true tiling section)</text>`,
  )
  out.push(backTilingStats(primitive, attrs))
  return out.join('')
}

export const renderBack: BackRenderer = (primitive, ctx) => {
  const attrs = asTilingAttrs(primitive.attrs)
  // No strict invariant beyond shape; reuse stub if attrs are empty.
  if (!attrs.dimension && !attrs.schlafli) {
    return { svg: makeTbdBackRenderer('tiling')(primitive, ctx).svg }
  }
  const familyBlock = buildTilingFamilyBlock(primitive, attrs)
  return {
    svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)),
  }
}
