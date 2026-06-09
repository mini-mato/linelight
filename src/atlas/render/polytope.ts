/**
 * Render a polytope primitive as an SVG card.
 *
 * Visual strategy:
 *   - 2D regular n-gons: orient with one vertex at top; draw centered polygon.
 *   - 3D Platonic solids: orthographic projection of hard-coded vertex
 *     coordinates; all visible edges drawn.
 *   - 4D regular polytopes: Schlegel projection where tractable
 *     (5-cell, tesseract, 16-cell, 24-cell). 120-cell + 600-cell render
 *     a typeset card with cell counts + Schlafli — honest fallback.
 *   - n-parametric: typeset card showing closed-form formulas.
 *
 * Card layout matches src/atlas/render/constant.ts (480x240, frame, name,
 * badge, central visual or symbol, source + id).
 */

import type { PolytopeAttrs, Primitive } from '../types.js'
import type { BackRenderer, Renderer } from './types.js'
import { DEFAULT_CARD, SVG_CLOSE, escapeXml, svgOpen } from './svg.js'
import { buildBackParts, makeTbdBackRenderer } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'

type Vec3 = readonly [number, number, number]
type Vec4 = readonly [number, number, number, number]

const PHI = (1 + Math.sqrt(5)) / 2
const CARD_W = DEFAULT_CARD.width
const CARD_H = DEFAULT_CARD.height
// Visual area: a square zone in the center between header rule and footer.
const VIZ_CX = CARD_W * 0.35
const VIZ_CY = 138
const VIZ_R = 72

function isPolytopeAttrs(a: unknown): a is PolytopeAttrs {
  return typeof a === 'object' && a !== null && 'dimension' in (a as Record<string, unknown>)
}

export const renderPolytope: Renderer = (primitive, ctx) => {
  if (!isPolytopeAttrs(primitive.attrs)) {
    throw new Error(`renderPolytope: primitive ${primitive.id} attrs do not satisfy PolytopeAttrs`)
  }
  const attrs = primitive.attrs
  const source = ctx.sources.get(primitive.sourceId)
  const sourceLabel = sourceShortLabel(source?.id ?? primitive.sourceId)
  const dim = attrs.dimension

  let visual = ''
  if (dim === 'n') {
    visual = renderParametricCard(primitive, attrs)
  } else if (dim === 2) {
    visual = render2DPolygon(attrs)
  } else if (dim === 3) {
    visual = render3DPlatonic(primitive.id)
  } else if (dim === 4) {
    visual = render4DPolytope(primitive.id, attrs)
  }

  const symbol = primitive.symbol ?? ''
  const info = buildInfoText(attrs)

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${CARD_W - 1.5}" height="${CARD_H - 1.5}" rx="6" />`,
    `<line class="accent-rule" x1="0" y1="42" x2="${CARD_W}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="badge-exact" x="${CARD_W - 20}" y="28" text-anchor="end">POLYTOPE</text>`,
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

/* ------------------------------ 2D n-gons ------------------------------ */

function render2DPolygon(attrs: PolytopeAttrs): string {
  const schlafli = attrs.schlafli
  if (!schlafli || schlafli.length === 0 || schlafli[0] === 'n') return ''
  const n = schlafli[0]
  const points: string[] = []
  // Orient with top vertex up.
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n
    const x = VIZ_CX + VIZ_R * Math.cos(angle)
    const y = VIZ_CY + VIZ_R * Math.sin(angle)
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return `<polygon points="${points.join(' ')}" fill="none" stroke="#0e2a2f" stroke-width="1.5" stroke-linejoin="round" />`
}

/* ------------------------ 3D Platonic solids ------------------------ */

function render3DPlatonic(id: string): string {
  const key = id.split('.').pop() ?? ''
  const mesh = PLATONIC_MESHES[key]
  if (!mesh) return ''
  // Orient with a small isometric tilt for visual interest.
  return projectAndDrawMesh(mesh.vertices, mesh.edges, isometricRotate)
}

type Mesh3D = { vertices: Vec3[]; edges: [number, number][] }

const PLATONIC_MESHES: Record<string, Mesh3D> = {
  tetrahedron: (() => {
    const v: Vec3[] = [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ]
    return { vertices: v, edges: allPairs(v.length) }
  })(),
  cube: (() => {
    const v: Vec3[] = []
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z])
    const edges: [number, number][] = []
    for (let i = 0; i < v.length; i++) {
      for (let j = i + 1; j < v.length; j++) {
        const [a, b] = [v[i], v[j]]
        const diff = a.reduce((s, ai, k) => s + Math.abs(ai - b[k]), 0)
        if (Math.abs(diff - 2) < 1e-9) edges.push([i, j])
      }
    }
    return { vertices: v, edges }
  })(),
  octahedron: (() => {
    const v: Vec3[] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]
    const edges: [number, number][] = []
    for (let i = 0; i < v.length; i++) {
      for (let j = i + 1; j < v.length; j++) {
        // skip antipodal
        const isAntipodal =
          Math.abs(v[i][0] + v[j][0]) < 1e-9 &&
          Math.abs(v[i][1] + v[j][1]) < 1e-9 &&
          Math.abs(v[i][2] + v[j][2]) < 1e-9
        if (!isAntipodal) edges.push([i, j])
      }
    }
    return { vertices: v, edges }
  })(),
  icosahedron: (() => {
    // 12 vertices: cyclic permutations of (0, ±1, ±φ)
    const v: Vec3[] = [
      [0, 1, PHI],
      [0, 1, -PHI],
      [0, -1, PHI],
      [0, -1, -PHI],
      [1, PHI, 0],
      [1, -PHI, 0],
      [-1, PHI, 0],
      [-1, -PHI, 0],
      [PHI, 0, 1],
      [PHI, 0, -1],
      [-PHI, 0, 1],
      [-PHI, 0, -1],
    ]
    const edges: [number, number][] = []
    // Edge length squared = 4 for these coords.
    const edgeLen2 = 4
    for (let i = 0; i < v.length; i++) {
      for (let j = i + 1; j < v.length; j++) {
        const dx = v[i][0] - v[j][0]
        const dy = v[i][1] - v[j][1]
        const dz = v[i][2] - v[j][2]
        const d2 = dx * dx + dy * dy + dz * dz
        if (Math.abs(d2 - edgeLen2) < 1e-6) edges.push([i, j])
      }
    }
    return { vertices: v, edges }
  })(),
  dodecahedron: (() => {
    // Vertices: (±1, ±1, ±1), (0, ±1/φ, ±φ), (±1/φ, ±φ, 0), (±φ, 0, ±1/φ)
    const inv = 1 / PHI
    const v: Vec3[] = []
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) v.push([sx, sy, sz])
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) v.push([0, sa * inv, sb * PHI])
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) v.push([sa * inv, sb * PHI, 0])
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) v.push([sa * PHI, 0, sb * inv])
    // Edge length = 2/φ for these coords.
    const edgeLen = 2 / PHI
    const edgeLen2 = edgeLen * edgeLen
    const edges: [number, number][] = []
    for (let i = 0; i < v.length; i++) {
      for (let j = i + 1; j < v.length; j++) {
        const dx = v[i][0] - v[j][0]
        const dy = v[i][1] - v[j][1]
        const dz = v[i][2] - v[j][2]
        const d2 = dx * dx + dy * dy + dz * dz
        if (Math.abs(d2 - edgeLen2) < 1e-6) edges.push([i, j])
      }
    }
    return { vertices: v, edges }
  })(),
}

function allPairs(n: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j])
  return out
}

function isometricRotate(p: Vec3): Vec3 {
  // Light isometric: rotate around y by ~25deg, then around x by ~20deg.
  const ay = (25 * Math.PI) / 180
  const ax = (20 * Math.PI) / 180
  const [x, y, z] = p
  // rotate y
  const x1 = x * Math.cos(ay) + z * Math.sin(ay)
  const z1 = -x * Math.sin(ay) + z * Math.cos(ay)
  // rotate x
  const y2 = y * Math.cos(ax) - z1 * Math.sin(ax)
  const z2 = y * Math.sin(ax) + z1 * Math.cos(ax)
  return [x1, y2, z2]
}

function projectAndDrawMesh(
  vertices: readonly Vec3[],
  edges: readonly [number, number][],
  rotate: (p: Vec3) => Vec3,
): string {
  const rotated = vertices.map(rotate)
  // Find max radius for scaling.
  let maxR = 0
  for (const [x, y] of rotated) {
    const r = Math.sqrt(x * x + y * y)
    if (r > maxR) maxR = r
  }
  const scale = (VIZ_R * 0.95) / Math.max(maxR, 1e-6)
  // Project: drop z (orthographic). Sort edges by depth-mean for hidden-line.
  const projected = rotated.map(([x, y, z]) => ({
    px: VIZ_CX + scale * x,
    py: VIZ_CY - scale * y,
    z,
  }))
  type EdgeWithDepth = { i: number; j: number; depth: number }
  const edgesWithDepth: EdgeWithDepth[] = edges.map(([i, j]) => ({
    i,
    j,
    depth: (projected[i].z + projected[j].z) / 2,
  }))
  // Sort: deepest first (drawn first, so nearer overdraws).
  edgesWithDepth.sort((a, b) => a.depth - b.depth)
  // Median depth → split front/back for visual hint.
  const sortedDepths = [...edgesWithDepth].map((e) => e.depth).sort((a, b) => a - b)
  const median = sortedDepths[Math.floor(sortedDepths.length / 2)]
  const lines = edgesWithDepth.map(({ i, j, depth }) => {
    const a = projected[i]
    const b = projected[j]
    const isBack = depth < median
    const opacity = isBack ? 0.35 : 1
    const dash = isBack ? ' stroke-dasharray="3 3"' : ''
    return `<line x1="${a.px.toFixed(2)}" y1="${a.py.toFixed(2)}" x2="${b.px.toFixed(2)}" y2="${b.py.toFixed(2)}" stroke="#0e2a2f" stroke-width="1.25" stroke-linecap="round" opacity="${opacity}"${dash} />`
  })
  return lines.join('')
}

/* ----------------------- 4D regular polytopes ----------------------- */

function render4DPolytope(id: string, attrs: PolytopeAttrs): string {
  const key = id.split('.').pop() ?? ''
  const mesh = build4DMesh(key)
  if (!mesh) {
    return render4DTypesetFallback(attrs)
  }
  const projected3D = mesh.vertices.map(schlegel4to3)
  return projectAndDrawMesh(projected3D, mesh.edges, isometricRotate)
}

type Mesh4D = { vertices: Vec4[]; edges: [number, number][] }

function build4DMesh(key: string): Mesh4D | null {
  if (key === '5-cell') {
    // 4-simplex coordinates: 5 standard basis vectors in R^5 mean-centered
    // and projected to R^4. Use a simpler form: 4-simplex with a clean
    // Schlegel-like spread by placing one vertex above the centroid of the
    // other four.
    const a = Math.sqrt(5 / 8)
    const v: Vec4[] = [
      [1, 1, 1, -a],
      [1, -1, -1, -a],
      [-1, 1, -1, -a],
      [-1, -1, 1, -a],
      [0, 0, 0, (4 * a) / 4 + a], // top apex
    ]
    return { vertices: v, edges: allPairs(5) }
  }
  if (key === 'tesseract') {
    const v: Vec4[] = []
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1]) for (const w of [-1, 1]) v.push([x, y, z, w])
    const edges: [number, number][] = []
    for (let i = 0; i < v.length; i++) {
      for (let j = i + 1; j < v.length; j++) {
        let diff = 0
        for (let k = 0; k < 4; k++) diff += Math.abs(v[i][k] - v[j][k])
        if (Math.abs(diff - 2) < 1e-9) edges.push([i, j])
      }
    }
    return { vertices: v, edges }
  }
  if (key === '16-cell') {
    // 16-cell: ±e_i in R^4 (8 vertices). Edges connect non-antipodal pairs.
    const v: Vec4[] = [
      [1, 0, 0, 0],
      [-1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, -1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, -1, 0],
      [0, 0, 0, 1],
      [0, 0, 0, -1],
    ]
    const edges: [number, number][] = []
    for (let i = 0; i < v.length; i++) {
      for (let j = i + 1; j < v.length; j++) {
        const isAnti =
          Math.abs(v[i][0] + v[j][0]) < 1e-9 &&
          Math.abs(v[i][1] + v[j][1]) < 1e-9 &&
          Math.abs(v[i][2] + v[j][2]) < 1e-9 &&
          Math.abs(v[i][3] + v[j][3]) < 1e-9
        if (!isAnti) edges.push([i, j])
      }
    }
    return { vertices: v, edges }
  }
  if (key === '24-cell') {
    // 24-cell: 8 vertices ±e_i ±e_j with i < j? Standard form:
    //   - 8 vertices ±e_i (16-cell vertices)
    //   - PLUS the 16 vertices of (±1, ±1, ±1, ±1)/sqrt(2)? Actually the
    // canonical form is: all permutations of (±1, ±1, 0, 0) → 24 vertices.
    const v: Vec4[] = []
    const positions = [0, 1, 2, 3]
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        for (const sa of [-1, 1]) {
          for (const sb of [-1, 1]) {
            const arr: [number, number, number, number] = [0, 0, 0, 0]
            arr[i] = sa
            arr[j] = sb
            v.push(arr)
          }
        }
      }
    }
    // Edge length squared = 2 for these coords.
    const edges: [number, number][] = []
    for (let i = 0; i < v.length; i++) {
      for (let j = i + 1; j < v.length; j++) {
        let d2 = 0
        for (let k = 0; k < 4; k++) d2 += (v[i][k] - v[j][k]) ** 2
        if (Math.abs(d2 - 2) < 1e-6) edges.push([i, j])
      }
    }
    return { vertices: v, edges }
  }
  return null
}

/**
 * Schlegel-like 4D -> 3D projection: stereographic from a viewpoint along the
 * positive w-axis. Pick viewpoint at w = wMax + d so all vertices project
 * inside a finite ball.
 */
function schlegel4to3(p: Vec4): Vec3 {
  const [x, y, z, w] = p
  const viewW = 3
  const denom = viewW - w
  const safe = Math.abs(denom) < 1e-6 ? 1e-6 : denom
  const k = viewW / safe
  return [k * x, k * y, k * z]
}

function render4DTypesetFallback(attrs: PolytopeAttrs): string {
  const lines: string[] = []
  const startY = 90
  const lineH = 18
  let y = startY
  if (attrs.vertices !== undefined) {
    lines.push(`vertices: ${attrs.vertices}`)
  }
  if (attrs.edges !== undefined) lines.push(`edges: ${attrs.edges}`)
  if (attrs.faces !== undefined) lines.push(`faces: ${attrs.faces}`)
  if (attrs.cells !== undefined) lines.push(`cells: ${attrs.cells}`)
  const out: string[] = []
  for (const ln of lines) {
    out.push(`<text class="value" x="40" y="${y}">${escapeXml(ln)}</text>`)
    y += lineH
  }
  out.push(
    `<text class="deriv" x="40" y="${y + 4}">Schlegel diagram pending — typeset fallback</text>`,
  )
  return out.join('')
}

/* ------------------------- n-parametric card ------------------------- */

function renderParametricCard(_primitive: Primitive, attrs: PolytopeAttrs): string {
  const out: string[] = []
  const startY = 90
  const lineH = 22
  let y = startY
  const formulas = attrs.formulas
  if (formulas) {
    const entries = Object.entries(formulas).slice(0, 3)
    for (const [name, f] of entries) {
      const label = name.replace(/_/g, ' ')
      out.push(`<text class="unit" x="24" y="${y}">${escapeXml(label)}:</text>`)
      out.push(
        `<text class="value" x="24" y="${y + lineH - 2}">${escapeXml(stripLatex(f.latex))}</text>`,
      )
      y += lineH * 2 + 4
    }
  } else {
    out.push(`<text class="value" x="24" y="${y}">parametric polytope (n-dimensional)</text>`)
  }
  return out.join('')
}

function stripLatex(s: string): string {
  return s
    .replace(/\\binom\{([^}]*)\}\{([^}]*)\}/g, 'C($1, $2)')
    .replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\\cdot/g, '·')
    .replace(/\\sin/g, 'sin')
    .replace(/\\cos/g, 'cos')
    .replace(/\\cot/g, 'cot')
    .replace(/\\pi/g, 'π')
    .replace(/\\theta/g, 'θ')
    .replace(/\\,/g, ' ')
    .replace(/\\\\/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\\/g, '')
    .trim()
}

/* ----------------------------- info text ----------------------------- */

function buildInfoText(attrs: PolytopeAttrs): string {
  const parts: string[] = []
  if (attrs.vertices !== undefined) parts.push(`V=${attrs.vertices}`)
  if (attrs.edges !== undefined) parts.push(`E=${attrs.edges}`)
  if (attrs.faces !== undefined) parts.push(`F=${attrs.faces}`)
  if (attrs.cells !== undefined) parts.push(`C=${attrs.cells}`)
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
 * Back-card family block (~440 × 130 px).
 *
 * Layout:
 *   - Left two-thirds: small wireframe rendering of the polytope.
 *     - 2D regular polygons: exact vertex coordinates from N=schlafli[0].
 *     - 3D Platonic solids: canonical vertex sets reused from the front
 *       renderer's `PLATONIC_MESHES`, orthographically projected.
 *     - 4D polytopes: text glyph + Schläfli + "(4D — projection deferred)".
 *   - Right third: stats column (V, E, F, C, Schläfli, Coxeter).
 *
 * Honest-data discipline: every value comes from `attrs`. Wireframes for
 * 4D polytopes are not drawn — only stats are surfaced.
 */

// Family block budget: ~440 × 130 px (origin top-left of family region).
const BACK_VIZ_W = 280
const BACK_VIZ_H = 130
const BACK_VIZ_CX = BACK_VIZ_W / 2
const BACK_VIZ_CY = BACK_VIZ_H / 2
const BACK_VIZ_R = 50

const BACK_STATS_X = BACK_VIZ_W + 12

function backWireframe2D(n: number): string {
  const points: string[] = []
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n
    const x = BACK_VIZ_CX + BACK_VIZ_R * Math.cos(angle)
    const y = BACK_VIZ_CY + BACK_VIZ_R * Math.sin(angle)
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return `<polygon points="${points.join(' ')}" fill="none" stroke="#0e2a2f" stroke-width="1.25" stroke-linejoin="round" />`
}

function backWireframe3D(meshKey: string): string {
  const mesh = PLATONIC_MESHES[meshKey]
  if (!mesh) return ''
  const rotated = mesh.vertices.map(isometricRotate)
  let maxR = 0
  for (const [x, y] of rotated) {
    const r = Math.sqrt(x * x + y * y)
    if (r > maxR) maxR = r
  }
  const scale = (BACK_VIZ_R * 0.95) / Math.max(maxR, 1e-6)
  const projected = rotated.map(([x, y, z]) => ({
    px: BACK_VIZ_CX + scale * x,
    py: BACK_VIZ_CY - scale * y,
    z,
  }))
  type EdgeWithDepth = { i: number; j: number; depth: number }
  const edgesWithDepth: EdgeWithDepth[] = mesh.edges.map(([i, j]) => ({
    i,
    j,
    depth: (projected[i].z + projected[j].z) / 2,
  }))
  edgesWithDepth.sort((a, b) => a.depth - b.depth)
  const sortedDepths = [...edgesWithDepth].map((e) => e.depth).sort((a, b) => a - b)
  const median = sortedDepths[Math.floor(sortedDepths.length / 2)]
  return edgesWithDepth
    .map(({ i, j, depth }) => {
      const a = projected[i]
      const b = projected[j]
      const isBack = depth < median
      const opacity = isBack ? 0.35 : 1
      const dash = isBack ? ' stroke-dasharray="3 3"' : ''
      return `<line x1="${a.px.toFixed(2)}" y1="${a.py.toFixed(2)}" x2="${b.px.toFixed(2)}" y2="${b.py.toFixed(2)}" stroke="#0e2a2f" stroke-width="1.1" stroke-linecap="round" opacity="${opacity}"${dash} />`
    })
    .join('')
}

function backWireframe4D(symbol: string | undefined): string {
  // 4D polytopes: do not attempt rendering. Surface a centered glyph and
  // the Schläfli symbol with an explicit "projection deferred" label.
  const sym = symbol ?? ''
  return [
    `<text x="${BACK_VIZ_CX}" y="${BACK_VIZ_CY - 10}" text-anchor="middle" font="500 22px 'Iosevka', ui-monospace, Menlo, monospace" fill="#0e2a2f" font-family="ui-monospace, Menlo, monospace" font-size="20" font-weight="500">${escapeXml(sym)}</text>`,
    `<text x="${BACK_VIZ_CX}" y="${BACK_VIZ_CY + 14}" text-anchor="middle" font-family="ui-serif, Georgia, serif" font-size="11" font-style="italic" fill="#4a6c70">(4D — projection deferred)</text>`,
  ].join('')
}

function backStatsColumn(attrs: PolytopeAttrs): string {
  type Row = { label: string; value: string }
  const rows: Row[] = []
  if (attrs.vertices !== undefined) rows.push({ label: 'V', value: String(attrs.vertices) })
  if (attrs.edges !== undefined) rows.push({ label: 'E', value: String(attrs.edges) })
  if (attrs.faces !== undefined) rows.push({ label: 'F', value: String(attrs.faces) })
  if (attrs.cells !== undefined) rows.push({ label: 'C', value: String(attrs.cells) })
  const schlafli = attrs.schlafli
  if (schlafli && schlafli.length > 0) {
    rows.push({ label: 'Schläfli', value: '{' + schlafli.join(',') + '}' })
  }
  if (attrs.coxeter) rows.push({ label: 'Coxeter', value: attrs.coxeter })

  const startY = 16
  const lineH = 14
  const out: string[] = []
  rows.forEach((row, i) => {
    const y = startY + i * lineH
    out.push(
      `<text x="${BACK_STATS_X}" y="${y}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" font-weight="600" fill="#4a6c70" letter-spacing="0.6">${escapeXml(row.label)}</text>`,
    )
    out.push(
      `<text x="${BACK_STATS_X + 56}" y="${y}" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="11" fill="#0e2a2f">${escapeXml(row.value)}</text>`,
    )
  })
  return out.join('')
}

function buildPolytopeFamilyBlock(primitive: Primitive, attrs: PolytopeAttrs): string {
  const dim = attrs.dimension
  let viz = ''
  let isSchematic = false
  if (dim === 2) {
    const n = attrs.schlafli?.[0]
    if (typeof n === 'number') viz = backWireframe2D(n)
  } else if (dim === 3) {
    const meshKey = primitive.id.split('.').pop() ?? ''
    viz = backWireframe3D(meshKey)
  } else if (dim === 4) {
    viz = backWireframe4D(primitive.symbol)
  } else if (dim === 'n') {
    isSchematic = true
    viz = `<text x="${BACK_VIZ_CX}" y="${BACK_VIZ_CY}" text-anchor="middle" font-family="ui-serif, Georgia, serif" font-size="11" font-style="italic" fill="#4a6c70">(n-parametric — see formulas on front)</text>`
  }

  const vizPanel = isSchematic
    ? `<rect x="0" y="0" width="${BACK_VIZ_W}" height="${BACK_VIZ_H}" rx="3" fill="none" stroke="#cdd6d8" stroke-width="0.6" stroke-dasharray="3 3" />` +
      `<text x="6" y="${BACK_VIZ_H - 6}" font-family="ui-serif, Georgia, serif" font-size="9" font-style="italic" fill="#8a9c9f">(schematic)</text>`
    : ''

  return [vizPanel, viz, backStatsColumn(attrs)].filter(Boolean).join('')
}

export const renderBack: BackRenderer = (primitive, ctx) => {
  if (!isPolytopeAttrs(primitive.attrs)) {
    return { svg: makeTbdBackRenderer('polytope')(primitive, ctx).svg }
  }
  const familyBlock = buildPolytopeFamilyBlock(primitive, primitive.attrs)
  return {
    svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)),
  }
}
