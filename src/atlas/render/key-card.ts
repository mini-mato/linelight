/**
 * Family "key card" — the first card in each family section.
 *
 * Front: family label, distinctive glyph, and a count slot.
 * Back:  legend whose layout mirrors a real family back. v2 only
 *        labels the regions that always render (FAMILY DETAILS,
 *        SOURCE FOOTER) — DESCRIPTION and RELATIONS are conditional
 *        per-card and intentionally absent from the legend.
 *
 * The legend is consistent across all 15 families — only the front
 * glyph + label changes.
 */

import type { PrimitiveFamily } from '../types.js'
import { escapeXml } from './svg.js'
import { BACK_CARD_HEIGHT, BACK_CARD_WIDTH, BACK_REGIONS } from './back-skeleton.js'

const FRONT_WIDTH = 480
const FRONT_HEIGHT = 240

/** One distinctive glyph per family, picked for visual character. */
const FAMILY_GLYPH: Record<PrimitiveFamily, string> = {
  constant: 'ℏ',
  unit: 'm·s⁻¹',
  identity: 'e^{iπ}+1',
  'special-function': 'P_n(x)',
  'spectral-line': 'Δλ',
  'energy-level': 'n=∞ ↓',
  element: 'Z̲',
  series: 'Σ 1/n',
  'transition-type': 'E1 / M1',
  polytope: '{n,k,p}',
  'coord-system': '(r,θ,φ)',
  lattice: '⊞',
  tiling: '⌑',
  'curved-space': 'κ',
  'symmetry-group': '↻',
}

const FAMILY_LABEL: Record<PrimitiveFamily, string> = {
  constant: 'Fundamental constants',
  unit: 'Units',
  identity: 'Identities',
  'special-function': 'Special functions',
  'spectral-line': 'Spectral lines',
  'energy-level': 'Energy levels',
  element: 'Elements',
  series: 'Series',
  'transition-type': 'Transition types',
  polytope: 'Polytopes',
  'coord-system': 'Coordinate systems',
  lattice: 'Lattices',
  tiling: 'Tilings',
  'curved-space': 'Curved spaces',
  'symmetry-group': 'Symmetry groups',
}

const KEY_STYLE = `
  .key-frame { fill: #fdfdfd; stroke: #1a3a3f; stroke-width: 1.25; }
  .key-rule { stroke: #d8d3c1; stroke-width: 1; }
  .key-eyebrow { font: 600 10px ui-sans-serif, system-ui, sans-serif; fill: #4a6c70; letter-spacing: 1.4px; }
  .key-title { font: 600 22px ui-sans-serif, system-ui, -apple-system, sans-serif; fill: #0e2a2f; letter-spacing: 0.2px; }
  .key-glyph { font: 500 56px 'Iosevka', 'iA Writer Quattro', ui-monospace, Menlo, monospace; fill: #1a3a3f; }
  .key-count-label { font: 600 9px ui-sans-serif, system-ui, sans-serif; fill: #4a6c70; letter-spacing: 1.4px; }
  .key-count-value { font: 500 14px 'Iosevka', ui-monospace, Menlo, monospace; fill: #0e2a2f; }
  .key-id { font: 400 9px ui-monospace, Menlo, monospace; fill: #8a9c9f; }
  .key-region-border { fill: none; stroke: #4a6c70; stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.7; }
  .key-region-label { font: 600 10px ui-sans-serif, system-ui, sans-serif; fill: #4a6c70; letter-spacing: 1.4px; }
  .key-legend-eyebrow { font: 600 10px ui-sans-serif, system-ui, sans-serif; fill: #4a6c70; letter-spacing: 1.4px; }
`

function frontOpen(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FRONT_WIDTH} ${FRONT_HEIGHT}" width="${FRONT_WIDTH}" height="${FRONT_HEIGHT}" role="img"><defs><style>${KEY_STYLE}</style></defs>`
}

function backOpen(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BACK_CARD_WIDTH} ${BACK_CARD_HEIGHT}" width="${BACK_CARD_WIDTH}" height="${BACK_CARD_HEIGHT}" role="img"><defs><style>${KEY_STYLE}</style></defs>`
}

const SVG_CLOSE = '</svg>'

export type KeyCardOptions = {
  /** Optional pre-computed primitive count for the family (placeholder if absent). */
  count?: number
}

function renderFront(family: PrimitiveFamily, opts: KeyCardOptions): string {
  const glyph = FAMILY_GLYPH[family]
  const label = FAMILY_LABEL[family]
  const countText = typeof opts.count === 'number' ? String(opts.count) : '—'

  return [
    frontOpen(),
    `<rect class="key-frame" x="0.75" y="0.75" width="${FRONT_WIDTH - 1.5}" height="${FRONT_HEIGHT - 1.5}" rx="6" />`,
    `<text class="key-eyebrow" x="20" y="28">FAMILY KEY</text>`,
    `<line class="key-rule" x1="20" y1="42" x2="${FRONT_WIDTH - 20}" y2="42" />`,
    `<text class="key-title" x="20" y="80">${escapeXml(label)}</text>`,
    `<text class="key-glyph" x="${FRONT_WIDTH / 2}" y="160" text-anchor="middle">${escapeXml(glyph)}</text>`,
    `<text class="key-count-label" x="20" y="200">PRIMITIVES IN FAMILY</text>`,
    `<text class="key-count-value" x="20" y="220">${escapeXml(countText)}</text>`,
    `<text class="key-id" x="${FRONT_WIDTH - 20}" y="220" text-anchor="end">_key.${escapeXml(family)}</text>`,
    SVG_CLOSE,
  ].join('')
}

function renderRegion(
  region: { x: number; y: number; w: number; h: number },
  label: string,
): string {
  const cx = region.x + region.w / 2
  const cy = region.y + region.h / 2 + 4
  return [
    `<rect class="key-region-border" x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" rx="3" />`,
    `<text class="key-region-label" x="${cx}" y="${cy}" text-anchor="middle">${escapeXml(label)}</text>`,
  ].join('')
}

function renderBackLegend(family: PrimitiveFamily): string {
  return [
    backOpen(),
    `<rect class="key-frame" x="0.75" y="0.75" width="${BACK_CARD_WIDTH - 1.5}" height="${BACK_CARD_HEIGHT - 1.5}" rx="6" />`,
    `<text class="key-legend-eyebrow" x="20" y="22">BACK LEGEND · ${escapeXml(FAMILY_LABEL[family].toUpperCase())}</text>`,
    renderRegion(BACK_REGIONS.family, 'FAMILY DETAILS'),
    renderRegion(BACK_REGIONS.footer, 'SOURCE FOOTER'),
    SVG_CLOSE,
  ].join('')
}

export function renderFamilyKeyCard(
  family: PrimitiveFamily,
  opts: KeyCardOptions = {},
): { frontSvg: string; backSvg: string } {
  return {
    frontSvg: renderFront(family, opts),
    backSvg: renderBackLegend(family),
  }
}

export { FAMILY_GLYPH, FAMILY_LABEL as FAMILY_KEY_LABEL }
