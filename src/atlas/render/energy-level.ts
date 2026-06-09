/**
 * Render an energy-level primitive as an SVG card.
 *
 * Card layout (480x240):
 *   - top-left:  primitive.name
 *   - top-right: LEVEL or SCHEMATIC badge
 *   - center:    a single rung of a Grotrian-style ladder. The rung sits on
 *                a vertical scale where E=0 is the ionization threshold and
 *                a baseline marks the ground state.
 *   - left:      term symbol + electron config + n / l / j when present
 *   - right:     energy in eV and cm^-1 when present
 *   - bottom:    source + id
 *
 * Back family block (440 × 130):
 *   - Left half: quantum-number table (n, l, s, j, parity, term, config, E_eV, E_cm⁻¹).
 *   - Right half: |ψ|² miniature for hydrogenic n-shells (closed-form
 *                 R_nl(r) × Y_lm). Achromatic grayscale heatmap. For
 *                 multi-electron / shell-degenerate levels, the right
 *                 half shows a (schematic) tag inside a dashed border.
 */

import type { EnergyLevelAttrs } from '../types.js'
import type { BackRenderer, Renderer } from './types.js'
import { DEFAULT_CARD, SVG_CLOSE, escapeXml, svgOpen } from './svg.js'
import { buildBackParts } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'
import { psi } from '../../physics/atomic/index.js'

function isEnergyLevelAttrs(a: unknown): a is EnergyLevelAttrs {
  return typeof a === 'object' && a !== null
}

const LADDER_X = 280
const LADDER_W = 170
const LADDER_TOP_Y = 70
const LADDER_BOTTOM_Y = 200
const E_TOP = 0 // ionization threshold (top of ladder)
const E_BOTTOM = -14 // approx H ground state in eV; covers typical visible-emission ranges

function rungYForEnergy(energyEV: number): number {
  // Linear map from E_BOTTOM..E_TOP to LADDER_BOTTOM_Y..LADDER_TOP_Y.
  const clamped = Math.max(E_BOTTOM, Math.min(E_TOP, energyEV))
  const t = (clamped - E_BOTTOM) / (E_TOP - E_BOTTOM)
  return LADDER_BOTTOM_Y - t * (LADDER_BOTTOM_Y - LADDER_TOP_Y)
}

export const renderEnergyLevel: Renderer = (primitive, ctx) => {
  if (!isEnergyLevelAttrs(primitive.attrs)) {
    throw new Error(
      `renderEnergyLevel: primitive ${primitive.id} attrs do not satisfy EnergyLevelAttrs`,
    )
  }
  const attrs = primitive.attrs as EnergyLevelAttrs & { schematic?: boolean }
  const source = ctx.sources.get(primitive.sourceId)
  const sourceLabel =
    source?.id === 'nist-asd-v5.10' ? 'NIST ASD v5.10' : (source?.id ?? primitive.sourceId)

  const isSchematic = attrs.schematic === true || typeof attrs.energyEV !== 'number'
  const badge = isSchematic ? 'SCHEMATIC' : 'LEVEL'
  const badgeClass = isSchematic ? 'badge-derived' : 'badge-exact'
  const ruleClass = isSchematic ? 'accent-rule-derived' : 'accent-rule'

  // Ladder: top axis (E=0), bottom axis (ground), and either a positioned
  // rung (when energyEV is known) or a floating "level" tick at midline.
  const axis = `<line x1="${LADDER_X}" y1="${LADDER_TOP_Y}" x2="${LADDER_X}" y2="${LADDER_BOTTOM_Y}" stroke="#1a3a3f" stroke-opacity="0.5" stroke-width="0.8" />`
  const topTick = `<line x1="${LADDER_X - 6}" y1="${LADDER_TOP_Y}" x2="${LADDER_X + LADDER_W}" y2="${LADDER_TOP_Y}" stroke="#1a3a3f" stroke-opacity="0.4" stroke-dasharray="2 2" />`
  const topLabel = `<text class="unit" x="${LADDER_X + LADDER_W}" y="${LADDER_TOP_Y - 4}" text-anchor="end">E = 0 (ionized)</text>`
  const bottomTick = `<line x1="${LADDER_X - 6}" y1="${LADDER_BOTTOM_Y}" x2="${LADDER_X + LADDER_W}" y2="${LADDER_BOTTOM_Y}" stroke="#1a3a3f" stroke-opacity="0.4" />`
  const bottomLabel = `<text class="unit" x="${LADDER_X + LADDER_W}" y="${LADDER_BOTTOM_Y + 14}" text-anchor="end">ground</text>`

  const rungY =
    typeof attrs.energyEV === 'number'
      ? rungYForEnergy(attrs.energyEV)
      : (LADDER_TOP_Y + LADDER_BOTTOM_Y) / 2
  const rungColor = isSchematic ? '#b89a3a' : '#1a3a3f'
  const rung = `<line x1="${LADDER_X}" y1="${rungY.toFixed(2)}" x2="${LADDER_X + LADDER_W}" y2="${rungY.toFixed(2)}" stroke="${rungColor}" stroke-width="2.4" />`
  const rungLabel = primitive.symbol
    ? `<text class="unit" x="${LADDER_X + LADDER_W + 4}" y="${(rungY + 4).toFixed(2)}">${escapeXml(primitive.symbol)}</text>`
    : ''

  // Left-column details.
  const detailX = 24
  const lines: string[] = []
  let y = 80
  if (attrs.termSymbol) {
    lines.push(`<text class="value" x="${detailX}" y="${y}">${escapeXml(attrs.termSymbol)}</text>`)
    y += 28
  }
  if (attrs.electronConfig) {
    lines.push(
      `<text class="unit" x="${detailX}" y="${y}">${escapeXml(attrs.electronConfig)}</text>`,
    )
    y += 22
  }
  const qParts: string[] = []
  if (typeof attrs.n === 'number') qParts.push(`n=${attrs.n}`)
  if (typeof attrs.l === 'number') qParts.push(`l=${attrs.l}`)
  if (typeof attrs.j === 'number') qParts.push(`j=${attrs.j}`)
  if (qParts.length > 0) {
    lines.push(`<text class="unit" x="${detailX}" y="${y}">${escapeXml(qParts.join(' · '))}</text>`)
    y += 22
  }
  if (typeof attrs.energyEV === 'number') {
    lines.push(
      `<text class="unit" x="${detailX}" y="${y}">E = ${attrs.energyEV.toFixed(4)} eV</text>`,
    )
    y += 20
  }
  if (typeof attrs.energyCm1 === 'number') {
    lines.push(
      `<text class="uncertainty" x="${detailX}" y="${y}">${attrs.energyCm1.toFixed(2)} cm⁻¹</text>`,
    )
    y += 18
  }

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${DEFAULT_CARD.width - 1.5}" height="${DEFAULT_CARD.height - 1.5}" rx="6" />`,
    `<line class="${ruleClass}" x1="0" y1="42" x2="${DEFAULT_CARD.width}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="${badgeClass}" x="${DEFAULT_CARD.width - 20}" y="28" text-anchor="end">${badge}</text>`,
    axis,
    topTick,
    topLabel,
    bottomTick,
    bottomLabel,
    rung,
    rungLabel,
    lines.join(''),
    `<text class="source" x="24" y="226">${escapeXml(sourceLabel)}</text>`,
    `<text class="id" x="${DEFAULT_CARD.width - 20}" y="226" text-anchor="end">${escapeXml(primitive.id)}</text>`,
    SVG_CLOSE,
  ].join('')
}

// ---------------------------------------------------------------------------
// Back-card family block.
// ---------------------------------------------------------------------------

/** Family-block coordinate budget: ~440 × 130 px. */
const FB_W = 440
const FB_H = 130
const FB_LEFT_W = 220
const FB_RIGHT_X = 240
const FB_RIGHT_W = FB_W - FB_RIGHT_X

/** Width × height of the |ψ|² heatmap mini, in pixels. */
const PSI_PX = 90
/** Heatmap grid resolution (cells per side). 30 keeps SVG small but readable. */
const PSI_GRID = 30

/**
 * Render the right-half |ψ|² heatmap as a square block of greyscale cells.
 * The xz-plane slice is sampled at y=0 with bounds [-extent, +extent] in
 * Bohr radii. Probability density |ψ|² is normalized to its in-slice maximum
 * so cell opacity in [0, 1] is the relative density.
 *
 * Achromatic per the back-palette rule: no Bruton wavelength→hue.
 */
function renderPsiMini(n: number, l: number, m: number, originX: number, originY: number): string {
  // Radial extent ~ n² · a₀ in Bohr radii. Use 2·n² to capture most density.
  const extent = 2 * n * n
  const cell = PSI_PX / PSI_GRID
  // Sample |ψ|² on the xz-plane (y=0) — same plane the front-card cloud uses.
  const samples = new Array<number>(PSI_GRID * PSI_GRID)
  let maxDensity = 0
  for (let iz = 0; iz < PSI_GRID; iz++) {
    // SVG y axis points down; physical z up. Flip iz.
    const z = extent * (1 - (2 * (iz + 0.5)) / PSI_GRID)
    for (let ix = 0; ix < PSI_GRID; ix++) {
      const x = extent * ((2 * (ix + 0.5)) / PSI_GRID - 1)
      const r = Math.sqrt(x * x + z * z)
      let psiVal: number
      if (r < 1e-9) {
        // At origin only s-orbitals are nonzero; psiCartesian handles it,
        // but we use a small offset to avoid spherical-coord ambiguity.
        psiVal = psi(n, l, m, 1, 1e-9, 0, 0)
      } else {
        const theta = Math.acos(z / r)
        // phi = 0 on the +x axis (we are in xz-plane), but signed by sign(x).
        const phi = x >= 0 ? 0 : Math.PI
        psiVal = psi(n, l, m, 1, r, theta, phi)
      }
      const density = psiVal * psiVal
      samples[iz * PSI_GRID + ix] = density
      if (density > maxDensity) maxDensity = density
    }
  }

  if (maxDensity <= 0) {
    return `<text class="muted" x="${originX + PSI_PX / 2}" y="${originY + PSI_PX / 2}" text-anchor="middle">(numeric error)</text>`
  }

  // Apply a mild gamma to bring out structure.
  const gamma = 0.5
  const cells: string[] = []
  for (let iz = 0; iz < PSI_GRID; iz++) {
    for (let ix = 0; ix < PSI_GRID; ix++) {
      const v = samples[iz * PSI_GRID + ix] / maxDensity
      if (v < 0.005) continue
      const opacity = Math.pow(v, gamma).toFixed(3)
      const x = (originX + ix * cell).toFixed(2)
      const y = (originY + iz * cell).toFixed(2)
      cells.push(
        `<rect x="${x}" y="${y}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="#0e2a2f" fill-opacity="${opacity}" />`,
      )
    }
  }
  return cells.join('')
}

/**
 * Decide whether to render a |ψ|² miniature for this energy level.
 *
 * Hydrogen rows in the seed encode only `n` (the level represents the whole
 * shell, since H levels are degenerate in l to first order). When (n, l) are
 * both known we render |ψ_{n,l,0}|². When only n is known and the row is the
 * neutral-H n-shell, we sample (l=0, m=0) — the s-orbital — and label it
 * accordingly. Anything outside n ∈ [1, 4] falls back to schematic to stay
 * inside `radialR`'s supported range.
 */
function pickHydrogenicQuantumNumbers(
  primitiveId: string,
  attrs: EnergyLevelAttrs,
): { n: number; l: number; m: number; label: string } | null {
  const n = typeof attrs.n === 'number' ? attrs.n : null
  if (n === null || n < 1 || n > 4) return null

  // Restrict the |ψ|² mini to neutral-H shell levels. He II 1s/2p have the
  // right structure (Z=2 hydrogenic) but the seed marks them schematic; honor
  // the seed flag and skip rendering there.
  const isHShell = /^energy-level\.h\.n\d+$/.test(primitiveId)
  if (!isHShell) return null

  const l = typeof attrs.l === 'number' ? attrs.l : 0
  if (l < 0 || l >= n) return null
  const m = 0
  const subshell = ['s', 'p', 'd', 'f'][l] ?? 'g'
  const label = `${n}${subshell} (m=${m})`
  return { n, l, m, label }
}

/** Quantum-number table on the left half of the family block. */
function renderQuantumTable(attrs: EnergyLevelAttrs): string {
  const labelStyle = 'font: 600 9px ui-sans-serif, system-ui, sans-serif; fill: #4a6c70;'
  const valueStyle = `font: 400 11px 'Iosevka', ui-monospace, Menlo, monospace; fill: #0e2a2f;`
  const dimStyle = `font: 400 11px 'Iosevka', ui-monospace, Menlo, monospace; fill: #8a9c9f;`

  const rows: { k: string; v: string | undefined }[] = [
    { k: 'n', v: typeof attrs.n === 'number' ? String(attrs.n) : undefined },
    { k: 'l', v: typeof attrs.l === 'number' ? String(attrs.l) : undefined },
    { k: 's', v: typeof attrs.s === 'number' ? String(attrs.s) : undefined },
    { k: 'j', v: typeof attrs.j === 'number' ? String(attrs.j) : undefined },
    { k: 'term', v: attrs.termSymbol },
    { k: 'config', v: attrs.electronConfig },
    {
      k: 'E (eV)',
      v: typeof attrs.energyEV === 'number' ? attrs.energyEV.toFixed(4) : undefined,
    },
    {
      k: 'E (cm⁻¹)',
      v: typeof attrs.energyCm1 === 'number' ? attrs.energyCm1.toFixed(2) : undefined,
    },
  ]

  const lineHeight = 14
  const startY = 14
  const colKeyX = 0
  const colValueX = 56

  const out: string[] = []
  out.push(
    `<text style="${labelStyle}" x="${colKeyX}" y="0" letter-spacing="1.4">QUANTUM NUMBERS</text>`,
  )
  rows.forEach((row, i) => {
    const y = startY + i * lineHeight
    out.push(`<text style="${valueStyle}" x="${colKeyX}" y="${y}">${escapeXml(row.k)}</text>`)
    if (row.v !== undefined) {
      out.push(`<text style="${valueStyle}" x="${colValueX}" y="${y}">${escapeXml(row.v)}</text>`)
    } else {
      out.push(`<text style="${dimStyle}" x="${colValueX}" y="${y}">—</text>`)
    }
  })
  return out.join('')
}

/** Right-half: |ψ|² mini for hydrogenic levels, schematic placeholder otherwise. */
function renderRightHalf(primitive: { id: string; attrs: EnergyLevelAttrs }): string {
  const { id, attrs } = primitive
  const labelStyle = 'font: 600 9px ui-sans-serif, system-ui, sans-serif; fill: #4a6c70;'
  const captionStyle = `font: 400 9px 'Iosevka', ui-monospace, Menlo, monospace; fill: #4a6c70;`
  const mutedStyle = 'font: italic 11px ui-serif, Georgia, serif; fill: #8a9c9f;'

  const heading = `<text style="${labelStyle}" x="0" y="0" letter-spacing="1.4">|ψ|² (xz-slice)</text>`

  const choice = pickHydrogenicQuantumNumbers(id, attrs)
  if (!choice) {
    // Schematic placeholder with dashed border.
    const w = FB_RIGHT_W
    const h = 100
    return [
      heading,
      `<rect x="0" y="14" width="${w}" height="${h}" fill="none" stroke="#8a9c9f" stroke-dasharray="3 3" stroke-width="0.8" />`,
      `<text style="${mutedStyle}" x="${w / 2}" y="${14 + h / 2}" text-anchor="middle">(schematic)</text>`,
      `<text style="${captionStyle}" x="${w / 2}" y="${14 + h / 2 + 16}" text-anchor="middle">multi-electron · ψ not closed-form</text>`,
    ].join('')
  }

  // Center the heatmap inside the right-half region.
  const originX = (FB_RIGHT_W - PSI_PX) / 2
  const originY = 16
  const heatmap = renderPsiMini(choice.n, choice.l, choice.m, originX, originY)
  const frame = `<rect x="${originX}" y="${originY}" width="${PSI_PX}" height="${PSI_PX}" fill="none" stroke="#1a3a3f" stroke-opacity="0.4" stroke-width="0.8" />`
  // Horizontal/vertical center crosshair to mark origin.
  const crossH = `<line x1="${originX}" y1="${originY + PSI_PX / 2}" x2="${originX + PSI_PX}" y2="${originY + PSI_PX / 2}" stroke="#1a3a3f" stroke-opacity="0.18" stroke-width="0.5" />`
  const crossV = `<line x1="${originX + PSI_PX / 2}" y1="${originY}" x2="${originX + PSI_PX / 2}" y2="${originY + PSI_PX} " stroke="#1a3a3f" stroke-opacity="0.18" stroke-width="0.5" />`
  const caption = `<text style="${captionStyle}" x="${FB_RIGHT_W / 2}" y="${originY + PSI_PX + 14}" text-anchor="middle">${escapeXml(choice.label)} · extent ≈ 2n²·a₀</text>`
  return [heading, heatmap, frame, crossH, crossV, caption].join('')
}

function renderEnergyLevelFamilyBlock(primitive: { id: string; attrs: EnergyLevelAttrs }): string {
  const left = `<g transform="translate(0 16)">${renderQuantumTable(primitive.attrs)}</g>`
  const right = `<g transform="translate(${FB_RIGHT_X} 16)">${renderRightHalf(primitive)}</g>`
  // Light vertical divider between halves.
  const divider = `<line x1="${FB_LEFT_W + 8}" y1="0" x2="${FB_LEFT_W + 8}" y2="${FB_H}" stroke="#d8d3c1" stroke-width="0.8" />`
  return [divider, left, right].join('')
}

export const renderBack: BackRenderer = (primitive, ctx) => {
  if (!isEnergyLevelAttrs(primitive.attrs)) {
    throw new Error(
      `renderBack[energy-level]: primitive ${primitive.id} attrs do not satisfy EnergyLevelAttrs`,
    )
  }
  const familyBlock = renderEnergyLevelFamilyBlock({
    id: primitive.id,
    attrs: primitive.attrs as EnergyLevelAttrs,
  })
  return { svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)) }
}
