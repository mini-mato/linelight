/**
 * Render a neutral-atom element primitive as an SVG card.
 *
 * Card layout (480x240, FRONT — unchanged):
 *   - top-left:  element name
 *   - top-right: ATOM badge
 *   - left column (~y 60-200):
 *       symbol (large)
 *       Z, ground config, ground term, ionization energy
 *   - right column (~x 290-460):
 *       schematic shells diagram — concentric arcs sized by principal
 *       quantum number n in the ground configuration. Schematic only.
 *   - bottom: source citation + primitive id
 *
 * Back family block (440 × 320 — v2):
 *   The front already shows Z + config + term + IP as text. The back
 *   lifts the element's identity into a 2D periodic-table mini (left
 *   two-thirds) plus a 1D electron-shell sketch (right third), with a
 *   horizontal IP scale bar at the bottom. The current element is
 *   highlighted in the table; the other four atlas elements appear as
 *   secondary outline cells. The shell sketch shows occupancy parsed
 *   from `attrs.groundConfig` (with noble-gas-core expansion via a
 *   small static table).
 */

import type { ElementAttrs } from '../types.js'
import type { BackRenderer, Renderer } from './types.js'
import { DEFAULT_CARD, SVG_CLOSE, escapeXml, svgOpen } from './svg.js'
import { buildBackParts } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'

function isElementAttrs(a: unknown): a is ElementAttrs {
  return (
    typeof a === 'object' && a !== null && 'z' in a && typeof (a as ElementAttrs).z === 'number'
  )
}

/**
 * Approximate filled-shell counts for a few elements we ship. Schematic —
 * the actual ground configurations are the canonical source. This is just
 * for the concentric-arcs visual hint on the FRONT.
 */
function ringRadiiForZ(z: number): number[] {
  // Aufbau principle through n=6 — enough for H..Hg.
  // Capacity per shell n: 2n^2.
  const caps = [2, 8, 18, 32, 50, 72]
  const radii: number[] = []
  let remaining = z
  for (let i = 0; i < caps.length && remaining > 0; i++) {
    radii.push(20 + i * 12)
    remaining -= caps[i]
  }
  return radii
}

export const renderElement: Renderer = (primitive, ctx) => {
  if (!isElementAttrs(primitive.attrs)) {
    throw new Error(`renderElement: primitive ${primitive.id} attrs do not satisfy ElementAttrs`)
  }
  const attrs = primitive.attrs
  const source = ctx.sources.get(primitive.sourceId)
  const sourceLabel =
    source?.id === 'nist-asd-v5.10' ? 'NIST ASD v5.10' : (source?.id ?? primitive.sourceId)

  const symbol = primitive.symbol ?? ''

  // Right-column schematic (atom shells).
  const cx = 380
  const cy = 130
  const radii = ringRadiiForZ(attrs.z)
  const shellsSvg = radii
    .map(
      (r) =>
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#5b8c5a" stroke-width="0.9" stroke-opacity="0.55" />`,
    )
    .join('')
  const nucleus = `<circle cx="${cx}" cy="${cy}" r="3.5" fill="#1a3a3f" />`

  // Left-column lines.
  const detailX = 24
  const lines: string[] = []
  let y = 130
  lines.push(`<text class="unit" x="${detailX}" y="${y}">Z = ${attrs.z}</text>`)
  y += 20
  if (attrs.groundConfig) {
    lines.push(`<text class="unit" x="${detailX}" y="${y}">${escapeXml(attrs.groundConfig)}</text>`)
    y += 20
  }
  if (attrs.groundTerm) {
    lines.push(`<text class="unit" x="${detailX}" y="${y}">${escapeXml(attrs.groundTerm)}</text>`)
    y += 20
  }
  if (typeof attrs.ionizationEnergyEV === 'number') {
    const ip = attrs.ionizationEnergyEV.toFixed(3)
    lines.push(`<text class="unit" x="${detailX}" y="${y}">IP = ${ip} eV</text>`)
    y += 20
  }

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${DEFAULT_CARD.width - 1.5}" height="${DEFAULT_CARD.height - 1.5}" rx="6" />`,
    `<line class="accent-rule" x1="0" y1="42" x2="${DEFAULT_CARD.width}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="badge-exact" x="${DEFAULT_CARD.width - 20}" y="28" text-anchor="end">ATOM</text>`,
    shellsSvg,
    nucleus,
    `<text class="symbol" x="24" y="100">${escapeXml(symbol)}</text>`,
    lines.join(''),
    `<text class="source" x="24" y="226">${escapeXml(sourceLabel)}</text>`,
    `<text class="id" x="${DEFAULT_CARD.width - 20}" y="226" text-anchor="end">${escapeXml(primitive.id)}</text>`,
    SVG_CLOSE,
  ].join('')
}

// ---------------------------------------------------------------------------
// Back-card family block (v2 — visual primitive in 440×320).
// ---------------------------------------------------------------------------

const FB_W = 440

const LABEL_STYLE = 'font: 600 9px ui-sans-serif, system-ui, sans-serif; fill: #4a6c70;'
const TICK_STYLE = `font: 400 8px 'Iosevka', ui-monospace, Menlo, monospace; fill: #8a9c9f;`
const MUTED_STYLE = 'font: italic 10px ui-serif, Georgia, serif; fill: #8a9c9f;'

// Static (Z, period, group) table for the 5 atlas elements + noble-gas
// cores referenced by `attrs.groundConfig`. Period and group follow IUPAC
// 1990 18-column convention (group 1 = alkali, group 18 = noble gases;
// lanthanides/actinides projected into a separate row in the standard
// long-form layout — none of the atlas-shipped elements live there).
type Cell = { z: number; symbol: string; period: number; group: number }

const ATLAS_ELEMENTS: Cell[] = [
  { z: 1, symbol: 'H', period: 1, group: 1 },
  { z: 2, symbol: 'He', period: 1, group: 18 },
  { z: 10, symbol: 'Ne', period: 2, group: 18 },
  { z: 11, symbol: 'Na', period: 3, group: 1 },
  { z: 80, symbol: 'Hg', period: 6, group: 12 },
]

// Periodic-table mini layout (left two-thirds of the family block).
// 18 columns × 7 periods. We allocate ~280 px wide × 120 px tall.
const PT_X = 0
const PT_Y = 30
const PT_W = 280
const PT_H = 7 * 14 // 98 px (7 rows of 14 px)
const CELL_W = PT_W / 18 // ~15.5 px
const CELL_H = PT_H / 7 // 14 px

function renderPeriodicTable(currentZ: number): string {
  const out: string[] = []
  out.push(`<text style="${LABEL_STYLE}" x="0" y="20" letter-spacing="1.4">PERIODIC TABLE</text>`)

  // Build a quick lookup of atlas cells by Z.
  const atlasByZ = new Map<number, Cell>()
  for (const c of ATLAS_ELEMENTS) atlasByZ.set(c.z, c)

  // Faint dotted placeholder grid: only render outlines for the rows where
  // an atlas element lives (periods 1, 2, 3, 6) to keep the visual sparse.
  const atlasRows = new Set<number>()
  for (const c of ATLAS_ELEMENTS) atlasRows.add(c.period)

  for (const period of atlasRows) {
    for (let group = 1; group <= 18; group++) {
      const cx = PT_X + (group - 1) * CELL_W
      const cy = PT_Y + (period - 1) * CELL_H
      out.push(
        `<rect x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" width="${CELL_W.toFixed(2)}" height="${CELL_H.toFixed(2)}" fill="none" stroke="#d8d3c1" stroke-width="0.4" stroke-dasharray="1 2" />`,
      )
    }
  }

  // Period number labels on the left edge.
  for (const p of atlasRows) {
    const cy = PT_Y + (p - 1) * CELL_H + CELL_H / 2 + 3
    out.push(
      `<text style="${TICK_STYLE}" x="${(PT_X - 4).toFixed(2)}" y="${cy.toFixed(2)}" text-anchor="end">${p}</text>`,
    )
  }

  // Atlas elements: highlighted current, outlined others.
  for (const c of ATLAS_ELEMENTS) {
    const cx = PT_X + (c.group - 1) * CELL_W
    const cy = PT_Y + (c.period - 1) * CELL_H
    const isCurrent = c.z === currentZ
    if (isCurrent) {
      out.push(
        `<rect x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" width="${CELL_W.toFixed(2)}" height="${CELL_H.toFixed(2)}" fill="#1a3a3f" stroke="#1a3a3f" stroke-width="0.6" />`,
      )
      out.push(
        `<text style="font: 600 8px 'Iosevka', ui-monospace, Menlo, monospace; fill: #fdfdfd;" x="${(cx + CELL_W / 2).toFixed(2)}" y="${(cy + CELL_H / 2 - 1).toFixed(2)}" text-anchor="middle">${escapeXml(c.symbol)}</text>`,
      )
      out.push(
        `<text style="font: 400 6px 'Iosevka', ui-monospace, Menlo, monospace; fill: #fdfdfd; opacity: 0.85;" x="${(cx + CELL_W / 2).toFixed(2)}" y="${(cy + CELL_H - 2).toFixed(2)}" text-anchor="middle">${c.z}</text>`,
      )
    } else {
      out.push(
        `<rect x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" width="${CELL_W.toFixed(2)}" height="${CELL_H.toFixed(2)}" fill="none" stroke="#4a6c70" stroke-width="0.7" />`,
      )
      out.push(
        `<text style="font: 500 7px 'Iosevka', ui-monospace, Menlo, monospace; fill: #4a6c70;" x="${(cx + CELL_W / 2).toFixed(2)}" y="${(cy + CELL_H / 2 + 2).toFixed(2)}" text-anchor="middle">${escapeXml(c.symbol)}</text>`,
      )
    }
  }

  return out.join('')
}

// ---------------------------------------------------------------------------
// Electron-shell sketch (right third).
// ---------------------------------------------------------------------------

// Noble-gas-core electron counts (cumulative through that noble gas).
// Used to expand `[He]`, `[Ne]`, `[Ar]`, `[Kr]`, `[Xe]`, `[Rn]` notation
// into per-shell-n electron counts. Values are textbook (aufbau).
const NOBLE_CORE_SHELLS: Record<string, number[]> = {
  // index = (n - 1)
  // [He]: 1s² → n=1: 2
  He: [2],
  // [Ne]: 1s² 2s² 2p⁶ → n=1: 2, n=2: 8
  Ne: [2, 8],
  // [Ar]: + 3s² 3p⁶ → n=1: 2, n=2: 8, n=3: 8
  Ar: [2, 8, 8],
  // [Kr]: + 3d¹⁰ 4s² 4p⁶ → n=1: 2, n=2: 8, n=3: 18, n=4: 8
  Kr: [2, 8, 18, 8],
  // [Xe]: + 4d¹⁰ 5s² 5p⁶ → n=1: 2, n=2: 8, n=3: 18, n=4: 18, n=5: 8
  Xe: [2, 8, 18, 18, 8],
  // [Rn]: + 4f¹⁴ 5d¹⁰ 6s² 6p⁶ → n=1:2, n=2:8, n=3:18, n=4:32, n=5:18, n=6:8
  Rn: [2, 8, 18, 32, 18, 8],
}

// Map subshell letter → principal-quantum-number contribution mapping.
// Letters here only carry their "l" character; the n is read from the
// digit prefix in tokens like "1s²", "3d¹⁰".
const SUPERSCRIPT_DIGIT: Record<string, number> = {
  '⁰': 0,
  '¹': 1,
  '²': 2,
  '³': 3,
  '⁴': 4,
  '⁵': 5,
  '⁶': 6,
  '⁷': 7,
  '⁸': 8,
  '⁹': 9,
}

function parseOccupancyDigit(s: string): number | null {
  // Accept either ASCII digits or unicode superscript digits.
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  let total = 0
  for (const ch of s) {
    if (SUPERSCRIPT_DIGIT[ch] === undefined) return null
    total = total * 10 + SUPERSCRIPT_DIGIT[ch]
  }
  return total
}

/**
 * Parse a ground configuration like "1s¹", "[Ne] 3s¹", or
 * "[Xe] 4f¹⁴ 5d¹⁰ 6s²" into an array of per-shell electron counts
 * (index 0 = n=1, index 1 = n=2, …).
 *
 * Returns null when the config can't be parsed (caller falls back to a
 * schematic ringRadiiForZ-style depiction).
 */
function parseGroundConfigShells(config: string): number[] | null {
  const shells: number[] = []
  const tokens = config.trim().split(/\s+/)
  for (const tok of tokens) {
    // Noble-gas core: [He], [Ne], [Ar], [Kr], [Xe], [Rn]
    const coreMatch = tok.match(/^\[([A-Z][a-z]?)\]$/)
    if (coreMatch) {
      const symbol = coreMatch[1]
      const core = NOBLE_CORE_SHELLS[symbol]
      if (!core) return null
      for (let i = 0; i < core.length; i++) {
        shells[i] = (shells[i] ?? 0) + core[i]
      }
      continue
    }
    // Subshell: digit(n) + letter(l) + (digit|superscript)(occupancy)
    // Handles: "1s²", "2p⁶", "5d¹⁰", "6s2"
    const m = tok.match(/^(\d+)([spdfg])([0-9⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/)
    if (!m) return null
    const n = parseInt(m[1], 10)
    const occ = parseOccupancyDigit(m[3])
    if (occ === null) return null
    shells[n - 1] = (shells[n - 1] ?? 0) + occ
  }
  return shells
}

// Shell-sketch geometry (right third of the family block).
const SHELL_X = 360 // center of the sketch
const SHELL_Y = 78 // center
const SHELL_R0 = 8 // innermost shell radius
const SHELL_DR = 9 // radial step per shell

function renderShellSketch(z: number, groundConfig: string | undefined): string {
  const out: string[] = []
  out.push(
    `<text style="${LABEL_STYLE}" x="${SHELL_X}" y="20" letter-spacing="1.4" text-anchor="middle">SHELLS</text>`,
  )

  let shells: number[] | null = null
  if (groundConfig) {
    shells = parseGroundConfigShells(groundConfig)
  }
  let isSchematic = false
  if (!shells) {
    // Fallback: distribute Z across full-shell capacities (2n²) — schematic.
    const caps = [2, 8, 18, 32, 50, 72]
    shells = []
    let remaining = z
    for (let i = 0; i < caps.length && remaining > 0; i++) {
      const fill = Math.min(caps[i], remaining)
      shells.push(fill)
      remaining -= fill
    }
    isSchematic = true
  }

  // Nucleus.
  out.push(`<circle cx="${SHELL_X}" cy="${SHELL_Y}" r="3" fill="#1a3a3f" />`)

  // Cap shells we draw at 6 (n=1..6 covers H..Hg). Sketch is necessarily
  // schematic for very heavy atoms — show a notice.
  const drawn = shells.slice(0, 6)
  drawn.forEach((occupancy, idx) => {
    const r = SHELL_R0 + idx * SHELL_DR
    const stroke = isSchematic ? '#b89a3a' : '#4a6c70'
    out.push(
      `<circle cx="${SHELL_X}" cy="${SHELL_Y}" r="${r}" fill="none" stroke="${stroke}" stroke-width="0.7" stroke-opacity="0.55" />`,
    )
    // Place dots around the shell. For occupancy > 14, render a numeric
    // count inside the arc (top-right) instead, to avoid dot soup.
    if (occupancy <= 14) {
      const count = Math.max(0, Math.min(14, occupancy))
      for (let k = 0; k < count; k++) {
        const angle = -Math.PI / 2 + (2 * Math.PI * k) / count
        const dx = SHELL_X + r * Math.cos(angle)
        const dy = SHELL_Y + r * Math.sin(angle)
        out.push(`<circle cx="${dx.toFixed(2)}" cy="${dy.toFixed(2)}" r="1.2" fill="${stroke}" />`)
      }
    } else {
      // Show count tag at NE of the shell.
      const dx = SHELL_X + r * Math.cos(-Math.PI / 4)
      const dy = SHELL_Y + r * Math.sin(-Math.PI / 4)
      out.push(
        `<circle cx="${dx.toFixed(2)}" cy="${dy.toFixed(2)}" r="5" fill="#fdfdfd" stroke="${stroke}" stroke-width="0.6" />`,
      )
      out.push(
        `<text style="font: 500 6px 'Iosevka', ui-monospace, Menlo, monospace; fill: ${stroke};" x="${dx.toFixed(2)}" y="${(dy + 2).toFixed(2)}" text-anchor="middle">${occupancy}</text>`,
      )
    }
    // Tiny shell label (K, L, M, N, O, P) at the right of each shell.
    const shellLetter = ['K', 'L', 'M', 'N', 'O', 'P'][idx] ?? ''
    out.push(
      `<text style="${TICK_STYLE}" x="${(SHELL_X + r + 3).toFixed(2)}" y="${(SHELL_Y + 2).toFixed(2)}">${shellLetter}</text>`,
    )
  })

  if (isSchematic) {
    out.push(
      `<text style="${MUTED_STYLE}" x="${SHELL_X}" y="${(SHELL_Y + Math.max(60, SHELL_R0 + drawn.length * SHELL_DR + 18)).toFixed(2)}" text-anchor="middle">(schematic — config unparsed)</text>`,
    )
  }

  return out.join('')
}

// ---------------------------------------------------------------------------
// Ionization-energy scale bar (bottom row).
// ---------------------------------------------------------------------------

const IP_BAR_X = 0
const IP_BAR_W = FB_W
const IP_BAR_Y = 248
const IP_BAR_H = 6

// Reference IPs for the 5 atlas elements (eV) — used to anchor the scale.
// Min/max derived from atlas data; rounded outward to a whole number for
// a clean axis. Min ≈ Na (5.14 eV); Max ≈ He (24.59 eV).
const IP_AXIS_MIN = 5
const IP_AXIS_MAX = 25

function renderIonizationBar(ipEV: number | undefined): string {
  const out: string[] = []
  out.push(
    `<text style="${LABEL_STYLE}" x="0" y="${(IP_BAR_Y - 14).toFixed(2)}" letter-spacing="1.4">IONIZATION ENERGY</text>`,
  )
  // Bar (axis).
  out.push(
    `<rect x="${IP_BAR_X.toFixed(2)}" y="${IP_BAR_Y.toFixed(2)}" width="${IP_BAR_W.toFixed(2)}" height="${IP_BAR_H.toFixed(2)}" fill="rgba(14, 42, 47, 0.05)" stroke="#1a3a3f" stroke-opacity="0.35" stroke-width="0.5" />`,
  )

  // Decade ticks at 5, 10, 15, 20, 25 eV.
  for (let v = IP_AXIS_MIN; v <= IP_AXIS_MAX; v += 5) {
    const t = (v - IP_AXIS_MIN) / (IP_AXIS_MAX - IP_AXIS_MIN)
    const x = IP_BAR_X + t * IP_BAR_W
    out.push(
      `<line x1="${x.toFixed(2)}" y1="${IP_BAR_Y}" x2="${x.toFixed(2)}" y2="${(IP_BAR_Y + IP_BAR_H + 3).toFixed(2)}" stroke="#1a3a3f" stroke-opacity="0.45" stroke-width="0.5" />`,
    )
    out.push(
      `<text style="${TICK_STYLE}" x="${x.toFixed(2)}" y="${(IP_BAR_Y + IP_BAR_H + 13).toFixed(2)}" text-anchor="middle">${v} eV</text>`,
    )
  }

  // Marker for THIS element's IP, when present.
  if (typeof ipEV === 'number') {
    const clamped = Math.max(IP_AXIS_MIN, Math.min(IP_AXIS_MAX, ipEV))
    const t = (clamped - IP_AXIS_MIN) / (IP_AXIS_MAX - IP_AXIS_MIN)
    const x = IP_BAR_X + t * IP_BAR_W
    out.push(
      `<line x1="${x.toFixed(2)}" y1="${(IP_BAR_Y - 4).toFixed(2)}" x2="${x.toFixed(2)}" y2="${(IP_BAR_Y + IP_BAR_H + 4).toFixed(2)}" stroke="#1a3a3f" stroke-width="1.6" />`,
    )
    out.push(
      `<circle cx="${x.toFixed(2)}" cy="${(IP_BAR_Y + IP_BAR_H / 2).toFixed(2)}" r="3.5" fill="#1a3a3f" stroke="#fdfdfd" stroke-width="0.8" />`,
    )
    // IP value annotation above the marker; clamp anchor to box edges.
    let anchor: 'start' | 'middle' | 'end' = 'middle'
    let textX = x
    if (x < 60) {
      anchor = 'start'
      textX = x + 6
    } else if (x > FB_W - 60) {
      anchor = 'end'
      textX = x - 6
    }
    out.push(
      `<text style="font: 500 10px 'Iosevka', ui-monospace, Menlo, monospace; fill: #0e2a2f;" x="${textX.toFixed(2)}" y="${(IP_BAR_Y - 8).toFixed(2)}" text-anchor="${anchor}">${ipEV.toFixed(3)} eV</text>`,
    )
  } else {
    out.push(
      `<text style="${MUTED_STYLE}" x="${(FB_W / 2).toFixed(2)}" y="${(IP_BAR_Y - 8).toFixed(2)}" text-anchor="middle">IP not in seed</text>`,
    )
  }

  return out.join('')
}

function renderElementFamilyBlock(attrs: ElementAttrs): string {
  const pt = renderPeriodicTable(attrs.z)
  const shells = renderShellSketch(attrs.z, attrs.groundConfig)
  const ip = renderIonizationBar(attrs.ionizationEnergyEV)
  return [pt, shells, ip].join('')
}

export const renderBack: BackRenderer = (primitive, ctx) => {
  if (!isElementAttrs(primitive.attrs)) {
    throw new Error(
      `renderBack[element]: primitive ${primitive.id} attrs do not satisfy ElementAttrs`,
    )
  }
  const familyBlock = renderElementFamilyBlock(primitive.attrs)
  return { svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)) }
}
