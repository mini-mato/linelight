/**
 * Render a Bravais-lattice primitive as an SVG card.
 *
 * Visual strategy:
 *   - 2D lattices: draw the conventional 2D unit cell (parallelogram) with
 *     lattice points at the corners and, when centered, at face/body
 *     positions. Repeat the cell once in each direction to show neighbors.
 *   - 3D lattices: isometric projection of the conventional 3D unit cell;
 *     lattice points drawn at corners + body/face/base positions per the
 *     Bravais centering letter (P/I/F/C/R).
 *
 * Card layout matches src/atlas/render/constant.ts.
 */

import type { LatticeAttrs } from '../types.js'
import type { BackRenderer, Renderer } from './types.js'
import { DEFAULT_CARD, SVG_CLOSE, escapeXml, svgOpen } from './svg.js'
import { buildBackParts, makeTbdBackRenderer } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'

type Vec3 = readonly [number, number, number]

const CARD_W = DEFAULT_CARD.width
const CARD_H = DEFAULT_CARD.height
const VIZ_CX = CARD_W * 0.35
const VIZ_CY = 138
const VIZ_R = 78

function isLatticeAttrs(a: unknown): a is LatticeAttrs {
  return (
    typeof a === 'object' &&
    a !== null &&
    'dimension' in (a as Record<string, unknown>) &&
    typeof (a as LatticeAttrs).dimension === 'number'
  )
}

export const renderLattice: Renderer = (primitive, ctx) => {
  if (!isLatticeAttrs(primitive.attrs)) {
    throw new Error(`renderLattice: primitive ${primitive.id} attrs do not satisfy LatticeAttrs`)
  }
  const attrs = primitive.attrs
  const source = ctx.sources.get(primitive.sourceId)
  const sourceLabel = sourceShortLabel(source?.id ?? primitive.sourceId)

  const visual =
    attrs.dimension === 2
      ? render2DLattice(attrs)
      : attrs.dimension === 3
        ? render3DLattice(attrs)
        : ''
  const symbol = primitive.symbol ?? ''
  const info = buildInfoText(attrs)

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${CARD_W - 1.5}" height="${CARD_H - 1.5}" rx="6" />`,
    `<line class="accent-rule" x1="0" y1="42" x2="${CARD_W}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="badge-exact" x="${CARD_W - 20}" y="28" text-anchor="end">LATTICE</text>`,
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

/* ----------------------------- 2D lattices ----------------------------- */

function render2DLattice(attrs: LatticeAttrs): string {
  const cell = attrs.conventionalCell ?? { a: 1, b: 1, c: 1, gamma: 90 }
  const a = cell.a
  const b = cell.b
  const gamma = ((cell.gamma ?? 90) * Math.PI) / 180

  // Basis vectors (conventional cell).
  const ax = a
  const ay = 0
  const bx = b * Math.cos(gamma)
  const by = b * Math.sin(gamma)

  // Scale so the 2x2 patch fits in the viz square.
  const maxX = Math.abs(2 * ax) + Math.abs(2 * bx)
  const maxY = Math.abs(2 * by)
  const scale = (VIZ_R * 1.6) / Math.max(maxX, maxY, 1e-6)

  // Center the patch.
  const cellCenterX = ax + bx
  const cellCenterY = by

  const toScreen = (x: number, y: number): [number, number] => {
    const sx = VIZ_CX + scale * (x - cellCenterX)
    const sy = VIZ_CY - scale * (y - cellCenterY)
    return [sx, sy]
  }

  const out: string[] = []

  // Draw 4-cell tile patch (so neighbors are visible). Lattice points at all
  // ix*A + iy*B for ix, iy in {-1, 0, 1, 2}.
  const iMin = -1
  const iMax = 2
  // Background (faint) lattice points.
  for (let ix = iMin; ix <= iMax; ix++) {
    for (let iy = iMin; iy <= iMax; iy++) {
      const x = ix * ax + iy * bx
      const y = ix * ay + iy * by
      const [sx, sy] = toScreen(x, y)
      const isInside = ix >= 0 && ix <= 1 && iy >= 0 && iy <= 1
      const opacity = isInside ? 1 : 0.4
      out.push(
        `<circle cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="3" fill="#0e2a2f" opacity="${opacity}" />`,
      )
    }
  }

  // Centering atoms inside the cells.
  const centering = parseCenteringLetter(attrs.bravaisClass ?? '')
  if (centering === 'C' || centering === 'centered-rect') {
    for (let ix = iMin; ix <= iMax; ix++) {
      for (let iy = iMin; iy <= iMax; iy++) {
        const x = (ix + 0.5) * ax + (iy + 0.5) * bx
        const y = (ix + 0.5) * ay + (iy + 0.5) * by
        const [sx, sy] = toScreen(x, y)
        const isInside = ix >= 0 && ix <= 0 && iy >= 0 && iy <= 0
        const opacity = isInside ? 1 : 0.4
        out.push(
          `<circle cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="3" fill="#5b8c5a" opacity="${opacity}" />`,
        )
      }
    }
  }

  // Draw the conventional cell parallelogram (highlighted).
  const corners: [number, number][] = [
    [0, 0],
    [ax, ay],
    [ax + bx, ay + by],
    [bx, by],
  ]
  const screenCorners = corners.map(([x, y]) => toScreen(x, y))
  const polyPoints = screenCorners.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  out.push(
    `<polygon points="${polyPoints}" fill="rgba(91,140,90,0.08)" stroke="#1a3a3f" stroke-width="1.25" />`,
  )

  return out.join('')
}

/* ----------------------------- 3D lattices ----------------------------- */

function render3DLattice(attrs: LatticeAttrs): string {
  const cell = attrs.conventionalCell ?? { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 }
  const a = cell.a
  const b = cell.b
  const c = cell.c
  const alpha = ((cell.alpha ?? 90) * Math.PI) / 180
  const beta = ((cell.beta ?? 90) * Math.PI) / 180
  const gamma = ((cell.gamma ?? 90) * Math.PI) / 180

  // Build the three crystallographic basis vectors a, b, c.
  // Standard convention: a along x; b in xy plane; c with components
  // determined by alpha, beta, gamma.
  const av: Vec3 = [a, 0, 0]
  const bv: Vec3 = [b * Math.cos(gamma), b * Math.sin(gamma), 0]
  const cx = c * Math.cos(beta)
  const cy =
    (c * (Math.cos(alpha) - Math.cos(beta) * Math.cos(gamma))) / Math.max(Math.sin(gamma), 1e-9)
  const cz2 = c * c - cx * cx - cy * cy
  const cz = Math.sqrt(Math.max(cz2, 0))
  const cv: Vec3 = [cx, cy, cz]

  const corners: Vec3[] = [
    [0, 0, 0],
    add(av, [0, 0, 0]),
    add(bv, [0, 0, 0]),
    add(cv, [0, 0, 0]),
    add(av, bv),
    add(av, cv),
    add(bv, cv),
    add(av, add(bv, cv)),
  ]
  // Edges of the unit cell parallelepiped (12 edges).
  const edges: [number, number][] = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 4],
    [1, 5],
    [2, 4],
    [2, 6],
    [3, 5],
    [3, 6],
    [4, 7],
    [5, 7],
    [6, 7],
  ]

  const centering = parseCenteringLetter(attrs.bravaisClass ?? '')
  const extraPoints: Vec3[] = []
  if (centering === 'I') {
    extraPoints.push(scale(add(av, add(bv, cv)), 0.5))
  } else if (centering === 'F') {
    extraPoints.push(scale(add(av, bv), 0.5))
    extraPoints.push(scale(add(av, cv), 0.5))
    extraPoints.push(scale(add(bv, cv), 0.5))
    // Far faces: v + halfway across opposite face — using midpoints of opposite faces:
    extraPoints.push(add(scale(av, 0.5), add(bv, scale(cv, 0.5))))
    extraPoints.push(add(scale(av, 0.5), add(cv, scale(bv, 0.5))))
    extraPoints.push(add(scale(bv, 0.5), add(cv, scale(av, 0.5))))
  } else if (centering === 'C') {
    extraPoints.push(scale(add(av, bv), 0.5))
    extraPoints.push(add(cv, scale(add(av, bv), 0.5)))
  }

  // Project all points isometrically.
  const allPoints: Vec3[] = [...corners, ...extraPoints]
  const projected = allPoints.map(isoProject)

  // Center & scale.
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity
  for (const [x, y] of projected) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const w = maxX - minX
  const h = maxY - minY
  const scaleS = (VIZ_R * 1.6) / Math.max(w, h, 1e-6)
  const cxOff = (minX + maxX) / 2
  const cyOff = (minY + maxY) / 2
  const toScreen = ([x, y]: readonly [number, number]): [number, number] => [
    VIZ_CX + scaleS * (x - cxOff),
    VIZ_CY - scaleS * (y - cyOff),
  ]

  const screenCorners = projected.slice(0, 8).map(toScreen)
  const screenExtras = projected.slice(8).map(toScreen)

  const out: string[] = []
  // Edges with a depth-based dash for back edges.
  const cornerZ = corners.map(([, , z]) => z)
  const medianZ = [...cornerZ].sort((a2, b2) => a2 - b2)[Math.floor(cornerZ.length / 2)]
  for (const [i, j] of edges) {
    const isBack = (cornerZ[i] + cornerZ[j]) / 2 < medianZ
    const dash = isBack ? ' stroke-dasharray="3 3"' : ''
    const opacity = isBack ? 0.35 : 1
    const [x1, y1] = screenCorners[i]
    const [x2, y2] = screenCorners[j]
    out.push(
      `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#1a3a3f" stroke-width="1.25" opacity="${opacity}"${dash} />`,
    )
  }

  // Corner lattice points.
  for (const [x, y] of screenCorners) {
    out.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3" fill="#0e2a2f" />`)
  }
  // Centering atoms.
  for (const [x, y] of screenExtras) {
    out.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.2" fill="#5b8c5a" />`)
  }

  return out.join('')
}

function add(p: Vec3, q: Vec3): Vec3 {
  return [p[0] + q[0], p[1] + q[1], p[2] + q[2]]
}

function scale(p: Vec3, s: number): Vec3 {
  return [p[0] * s, p[1] * s, p[2] * s]
}

function isoProject(p: Vec3): [number, number] {
  // Standard isometric: rotate around y by 30deg, around x by ~25deg.
  const ay = (30 * Math.PI) / 180
  const ax = (25 * Math.PI) / 180
  const [x, y, z] = p
  const x1 = x * Math.cos(ay) + z * Math.sin(ay)
  const z1 = -x * Math.sin(ay) + z * Math.cos(ay)
  const y2 = y * Math.cos(ax) - z1 * Math.sin(ax)
  return [x1, y2]
}

/* --------------------------- shared helpers --------------------------- */

function parseCenteringLetter(
  bravaisClass: string,
): 'P' | 'I' | 'F' | 'C' | 'R' | 'centered-rect' | '' {
  // Forms like "cubic-P", "cubic-F", "rectangular-C" (2D centered rect), etc.
  const m = bravaisClass.match(/-([PIFCR])$/)
  if (m) return m[1] as 'P' | 'I' | 'F' | 'C' | 'R'
  if (bravaisClass.startsWith('rectangular-C')) return 'centered-rect'
  return ''
}

function buildInfoText(attrs: LatticeAttrs): string {
  const parts: string[] = []
  if (attrs.pointGroup) parts.push(`pg ${attrs.pointGroup}`)
  if (attrs.bravaisClass) parts.push(attrs.bravaisClass)
  if (parts.length === 0) return ''
  return `<text class="uncertainty" x="${CARD_W - 20}" y="200" text-anchor="end">${escapeXml(parts.join('   '))}</text>`
}

function sourceShortLabel(sourceId: string): string {
  const map: Record<string, string> = {
    'itc-vol-a': 'ITC Vol A',
    'coxeter-1973': 'Coxeter 1973',
  }
  return map[sourceId] ?? sourceId.toUpperCase()
}

/* --------------------------- back-card render --------------------------- */

/**
 * Back-card family block (~440 × 130 px) for lattice primitives.
 *
 * Layout:
 *   - Left: small unit-cell sketch.
 *     - 2D: parallelogram of conventional cell + centering point if any.
 *     - 3D: isometric projection of the conventional cell parallelepiped.
 *   - Right: stats column (dim, Bravais class, point group, space group,
 *     conventional cell parameters).
 */

const BACK_VIZ_W = 200
const BACK_VIZ_H = 130
const BACK_VIZ_CX = BACK_VIZ_W / 2
const BACK_VIZ_CY = BACK_VIZ_H / 2

function backLatticeSketch2D(attrs: LatticeAttrs): string {
  const cell = attrs.conventionalCell ?? { a: 1, b: 1, c: 1, gamma: 90 }
  const a = cell.a
  const b = cell.b
  const gamma = ((cell.gamma ?? 90) * Math.PI) / 180
  const ax = a
  const ay = 0
  const bx = b * Math.cos(gamma)
  const by = b * Math.sin(gamma)
  const maxX = Math.max(Math.abs(ax + bx), Math.abs(ax), Math.abs(bx))
  const maxY = Math.max(Math.abs(by), Math.abs(ay))
  const scale = 38 / Math.max(maxX, maxY, 1e-6)
  const cellCenterX = (ax + bx) / 2
  const cellCenterY = by / 2
  const toScreen = (x: number, y: number): [number, number] => {
    return [BACK_VIZ_CX + scale * (x - cellCenterX), BACK_VIZ_CY - scale * (y - cellCenterY)]
  }
  const corners: [number, number][] = [
    [0, 0],
    [ax, ay],
    [ax + bx, ay + by],
    [bx, by],
  ]
  const screen = corners.map(([x, y]) => toScreen(x, y))
  const out: string[] = []
  // Cell parallelogram.
  out.push(
    `<polygon points="${screen.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}" fill="none" stroke="#0e2a2f" stroke-width="1.1" />`,
  )
  // Corner lattice points.
  for (const [x, y] of screen) {
    out.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.5" fill="#0e2a2f" />`)
  }
  // Centering atom for centered rectangular.
  if (parseCenteringLetter(attrs.bravaisClass ?? '') === 'centered-rect') {
    const [cx, cy] = toScreen(ax / 2 + bx / 2, ay / 2 + by / 2)
    out.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="2.5" fill="#4a6c70" />`)
  }
  return out.join('')
}

function backLatticeSketch3D(attrs: LatticeAttrs): string {
  const cell = attrs.conventionalCell ?? { a: 1, b: 1, c: 1, alpha: 90, beta: 90, gamma: 90 }
  const a = cell.a
  const b = cell.b
  const c = cell.c
  const alpha = ((cell.alpha ?? 90) * Math.PI) / 180
  const beta = ((cell.beta ?? 90) * Math.PI) / 180
  const gamma = ((cell.gamma ?? 90) * Math.PI) / 180

  const av: Vec3 = [a, 0, 0]
  const bv: Vec3 = [b * Math.cos(gamma), b * Math.sin(gamma), 0]
  const cxv = c * Math.cos(beta)
  const cyv =
    (c * (Math.cos(alpha) - Math.cos(beta) * Math.cos(gamma))) / Math.max(Math.sin(gamma), 1e-9)
  const cz2 = c * c - cxv * cxv - cyv * cyv
  const cz = Math.sqrt(Math.max(cz2, 0))
  const cv: Vec3 = [cxv, cyv, cz]

  const corners: Vec3[] = [
    [0, 0, 0],
    add(av, [0, 0, 0]),
    add(bv, [0, 0, 0]),
    add(cv, [0, 0, 0]),
    add(av, bv),
    add(av, cv),
    add(bv, cv),
    add(av, add(bv, cv)),
  ]
  const edges: [number, number][] = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 4],
    [1, 5],
    [2, 4],
    [2, 6],
    [3, 5],
    [3, 6],
    [4, 7],
    [5, 7],
    [6, 7],
  ]

  const centering = parseCenteringLetter(attrs.bravaisClass ?? '')
  const extraPoints: Vec3[] = []
  if (centering === 'I') {
    extraPoints.push(scale(add(av, add(bv, cv)), 0.5))
  } else if (centering === 'F') {
    extraPoints.push(scale(add(av, bv), 0.5))
    extraPoints.push(scale(add(av, cv), 0.5))
    extraPoints.push(scale(add(bv, cv), 0.5))
    extraPoints.push(add(scale(av, 0.5), add(bv, scale(cv, 0.5))))
    extraPoints.push(add(scale(av, 0.5), add(cv, scale(bv, 0.5))))
    extraPoints.push(add(scale(bv, 0.5), add(cv, scale(av, 0.5))))
  } else if (centering === 'C') {
    extraPoints.push(scale(add(av, bv), 0.5))
    extraPoints.push(add(cv, scale(add(av, bv), 0.5)))
  }

  const allPoints: Vec3[] = [...corners, ...extraPoints]
  const projected = allPoints.map(isoProject)

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of projected) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const w = maxX - minX
  const h = maxY - minY
  const scaleS = 80 / Math.max(w, h, 1e-6)
  const cxOff = (minX + maxX) / 2
  const cyOff = (minY + maxY) / 2
  const toScreen = ([x, y]: readonly [number, number]): [number, number] => [
    BACK_VIZ_CX + scaleS * (x - cxOff),
    BACK_VIZ_CY - scaleS * (y - cyOff),
  ]

  const screenCorners = projected.slice(0, 8).map(toScreen)
  const screenExtras = projected.slice(8).map(toScreen)
  const out: string[] = []
  const cornerZ = corners.map(([, , z]) => z)
  const medianZ = [...cornerZ].sort((a2, b2) => a2 - b2)[Math.floor(cornerZ.length / 2)]
  for (const [i, j] of edges) {
    const isBack = (cornerZ[i] + cornerZ[j]) / 2 < medianZ
    const dash = isBack ? ' stroke-dasharray="3 3"' : ''
    const opacity = isBack ? 0.4 : 1
    const [x1, y1] = screenCorners[i]
    const [x2, y2] = screenCorners[j]
    out.push(
      `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#0e2a2f" stroke-width="1" opacity="${opacity}"${dash} />`,
    )
  }
  for (const [x, y] of screenCorners) {
    out.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.2" fill="#0e2a2f" />`)
  }
  for (const [x, y] of screenExtras) {
    out.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.4" fill="#4a6c70" />`)
  }
  return out.join('')
}

function backLatticeStats(attrs: LatticeAttrs): string {
  type Row = { label: string; value: string }
  const rows: Row[] = []
  rows.push({ label: 'dim', value: `${attrs.dimension}` })
  if (attrs.bravaisClass) rows.push({ label: 'bravais', value: attrs.bravaisClass })
  if (attrs.pointGroup) rows.push({ label: 'point grp', value: attrs.pointGroup })
  if (attrs.spaceGroup) rows.push({ label: 'space grp', value: attrs.spaceGroup })
  const cell = attrs.conventionalCell
  if (cell) {
    const sides = `a=${cell.a} b=${cell.b} c=${cell.c}`
    rows.push({ label: 'cell', value: sides })
    const angles = [
      cell.alpha !== undefined ? `α=${cell.alpha}` : '',
      cell.beta !== undefined ? `β=${cell.beta}` : '',
      cell.gamma !== undefined ? `γ=${cell.gamma}` : '',
    ]
      .filter(Boolean)
      .join(' ')
    if (angles) rows.push({ label: '', value: angles })
  }
  const out: string[] = []
  const startY = 14
  const lineH = 13
  const labelX = BACK_VIZ_W + 16
  const valueX = labelX + 60
  rows.forEach((row, i) => {
    const y = startY + i * lineH
    if (row.label) {
      out.push(
        `<text x="${labelX}" y="${y}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" font-weight="600" fill="#4a6c70" letter-spacing="1.0">${escapeXml(row.label.toUpperCase())}</text>`,
      )
    }
    out.push(
      `<text x="${valueX}" y="${y}" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="10" fill="#0e2a2f">${escapeXml(row.value)}</text>`,
    )
  })
  return out.join('')
}

function buildLatticeFamilyBlock(attrs: LatticeAttrs): string {
  const sketch =
    attrs.dimension === 2
      ? backLatticeSketch2D(attrs)
      : attrs.dimension === 3
        ? backLatticeSketch3D(attrs)
        : ''
  return [sketch, backLatticeStats(attrs)].filter(Boolean).join('')
}

export const renderBack: BackRenderer = (primitive, ctx) => {
  if (!isLatticeAttrs(primitive.attrs)) {
    return { svg: makeTbdBackRenderer('lattice')(primitive, ctx).svg }
  }
  const familyBlock = buildLatticeFamilyBlock(primitive.attrs)
  return {
    svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)),
  }
}
