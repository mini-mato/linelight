/**
 * Shared SVG skeleton for the BACK of an atlas card.
 *
 * The back is the same width as the front (480px) and a standardized
 * height of 360px. v2 layout (no header chrome — the front already
 * carries the primitive name + symbol):
 *
 *   1. Description block — long-form prose, only when authored
 *   2. Family block      — family-specific SVG fragment (authored by
 *                          the family's `renderBack` implementation)
 *   3. Relations block   — only when at least one in/out edge exists
 *   4. Footer            — sourceCitation · retrievedAt · primitiveId
 *
 * Family-block geometry: with no description and no relations on a
 * typical card today, the family region occupies the LARGE central
 * area — top y = 30, bottom y = 350, height = 320, with 20 px of
 * horizontal padding on each side (effective width = 440). The
 * family-block fragment is authored as if (0, 0) were the top-left of
 * its own block; the skeleton wraps it in a `<g transform="translate(20 30)">`.
 *
 * When `description` and/or `relations` are present, those sections
 * are rendered above and below the family region respectively, but
 * the family region's nominal origin (y=30) and its export geometry
 * via `BACK_REGIONS.family` remain stable so family renderers do not
 * need to know which optional sections happen to be present.
 *
 * Style conventions match `svg.ts`: ink #0e2a2f, ink-soft #4a6c70,
 * rule #d8d3c1, card-bg #fdfdfd. Sans-serif for description,
 * monospace for footer / id.
 */

import type { BackParts } from './types.js'
import { escapeXml } from './svg.js'

export const BACK_CARD_WIDTH = 480
export const BACK_CARD_HEIGHT = 360

const PADDING_X = 20

const FAMILY_TOP = 30
const FAMILY_BOTTOM = 350
const FAMILY_WIDTH = BACK_CARD_WIDTH - 2 * PADDING_X

const FOOTER_Y = 348

const BACK_STYLE = `
  .back-frame { fill: #fdfdfd; stroke: #1a3a3f; stroke-width: 1.25; }
  .back-rule { stroke: #d8d3c1; stroke-width: 1; }
  .back-section-label { font: 600 9px ui-sans-serif, system-ui, sans-serif; fill: #4a6c70; letter-spacing: 1.4px; }
  .back-description { font: 400 12px ui-sans-serif, system-ui, -apple-system, sans-serif; fill: #0e2a2f; }
  .back-relation { font: 400 11px 'Iosevka', ui-monospace, Menlo, monospace; fill: #4a6c70; }
  .back-footer { font: 400 10px ui-monospace, Menlo, monospace; fill: #4a6c70; }
  .back-id { font: 400 9px ui-monospace, Menlo, monospace; fill: #8a9c9f; }
  .muted { font: italic 11px ui-serif, Georgia, serif; fill: #8a9c9f; }
`

function backOpen(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BACK_CARD_WIDTH} ${BACK_CARD_HEIGHT}" width="${BACK_CARD_WIDTH}" height="${BACK_CARD_HEIGHT}" role="img"><defs><style>${BACK_STYLE}</style></defs>`
}

const BACK_CLOSE = '</svg>'

/**
 * Wrap a y-coordinate-relative SVG fragment in a `<g>` translated to
 * the family-block region. The fragment authored by the family
 * renderer should treat (0, 0) as the top-left of its own block.
 */
function familyGroup(fragment: string): string {
  return `<g transform="translate(${PADDING_X} ${FAMILY_TOP})">${fragment}</g>`
}

function hasDescription(parts: BackParts): boolean {
  return typeof parts.description === 'string' && parts.description.trim().length > 0
}

function hasRelations(parts: BackParts): boolean {
  const r = parts.relations
  return !!r && (r.in.length > 0 || r.out.length > 0)
}

function renderDescription(parts: BackParts): string {
  if (!hasDescription(parts)) return ''
  const description = parts.description as string
  const labelY = 18
  const label = `<text class="back-section-label" x="${PADDING_X}" y="${labelY}">DESCRIPTION</text>`
  // Wrap description into lines naively at ~58 chars. Reviewers author
  // the description; we don't compute layout beyond a soft wrap.
  const maxCharsPerLine = 58
  const words = description.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (current.length === 0) {
      current = word
    } else if (current.length + 1 + word.length <= maxCharsPerLine) {
      current = current + ' ' + word
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current.length > 0) lines.push(current)

  const startY = labelY + 18
  const lineHeight = 15
  const visible = lines.slice(0, 4)
  const linesSvg = visible
    .map(
      (line, i) =>
        `<text class="back-description" x="${PADDING_X}" y="${startY + i * lineHeight}">${escapeXml(line)}</text>`,
    )
    .join('')
  return label + linesSvg
}

function renderRelations(parts: BackParts): string {
  if (!hasRelations(parts)) return ''
  const relations = parts.relations!
  const labelY = FOOTER_Y - 60
  const label = `<text class="back-section-label" x="${PADDING_X}" y="${labelY}">RELATIONS</text>`

  const allRelations: {
    dir: 'in' | 'out'
    ref: { kind: string; targetId: string; targetName?: string }
  }[] = [
    ...relations.out.map((ref) => ({ dir: 'out' as const, ref })),
    ...relations.in.map((ref) => ({ dir: 'in' as const, ref })),
  ]
  const startY = labelY + 16
  const lineHeight = 14
  const lines = allRelations.slice(0, 3).map((r, i) => {
    const arrow = r.dir === 'out' ? '→' : '←'
    const target = r.ref.targetName ?? r.ref.targetId
    const text = `${arrow} ${r.ref.kind}  ${target}`
    return `<text class="back-relation" x="${PADDING_X}" y="${startY + i * lineHeight}">${escapeXml(text)}</text>`
  })
  return label + lines.join('')
}

/**
 * Derive a short source label by stripping trailing year/version
 * suffixes. "CODATA 2022" → "CODATA", "NIST ASD v5.10" → "NIST ASD",
 * "CIE 015:2018" → "CIE", "Sansonetti-Martin 2005" → "Sansonetti-Martin".
 *
 * The full citation + retrievedAt are surfaced in the HTML card-foot
 * with `class="ai-detail"` so readers see the short form by default,
 * while the SVG keeps a minimal, prose-free identifier.
 */
function shortenCitation(citation: string): string {
  // Drop a trailing token if it's a 4-digit year, a "v..." version,
  // a "Vol ..." suffix, or a colon-bearing standard number like "015:2018".
  const tokens = citation.trim().split(/\s+/)
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1]
    if (/^\d{4}$/.test(last) || /^v\d/i.test(last) || /^\d+:\d+/.test(last)) {
      tokens.pop()
      continue
    }
    break
  }
  // Strip a trailing "Vol X" pair if still present.
  if (
    tokens.length >= 2 &&
    /^Vol$/i.test(tokens[tokens.length - 2]) &&
    /^[A-Za-z0-9]+$/.test(tokens[tokens.length - 1])
  ) {
    tokens.pop()
    tokens.pop()
  }
  return tokens.join(' ') || citation
}

function renderFooter(parts: BackParts): string {
  // v3 (2026-05-04): the SVG footer renders only a SHORT source label.
  // The full citation, retrievedAt, and primitiveId are exposed in the
  // gallery HTML card-foot under `class="ai-detail"` (hidden by default,
  // revealed per-card via the `[i]` toggle or globally via `?dev=1`).
  // This keeps each card visually clean for human readers while
  // preserving every piece of provenance for ⌘-F search and dev mode.
  const shortLabel = shortenCitation(parts.sourceCitation)
  return `<text class="back-footer" x="${PADDING_X}" y="${FOOTER_Y}">${escapeXml(shortLabel)}</text>`
}

export function renderBackSkeleton(parts: BackParts): string {
  return [
    backOpen(),
    `<rect class="back-frame" x="0.75" y="0.75" width="${BACK_CARD_WIDTH - 1.5}" height="${BACK_CARD_HEIGHT - 1.5}" rx="6" />`,
    renderDescription(parts),
    familyGroup(parts.familyBlock),
    renderRelations(parts),
    renderFooter(parts),
    BACK_CLOSE,
  ].join('')
}

/**
 * Layout regions exposed for the key card so its legend can mirror the
 * exact pixel boundaries of a real back. v2 omits the optional
 * description/relations regions entirely — they appear only on cards
 * that author them.
 */
export const BACK_REGIONS = {
  width: BACK_CARD_WIDTH,
  height: BACK_CARD_HEIGHT,
  family: {
    x: PADDING_X,
    y: FAMILY_TOP,
    w: FAMILY_WIDTH,
    h: FAMILY_BOTTOM - FAMILY_TOP,
  },
  footer: { x: PADDING_X, y: FOOTER_Y - 12, w: BACK_CARD_WIDTH - 2 * PADDING_X, h: 16 },
} as const
