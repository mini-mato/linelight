/**
 * Stub renderer — used for primitive families that don't have a dedicated
 * renderer yet. Renders a typeset card with the primitive id, family, name,
 * and any obvious attrs as JSON. Not pretty, but honest.
 */

import type { Renderer } from './types.js'
import { DEFAULT_CARD, SVG_CLOSE, escapeXml, svgOpen } from './svg.js'

export const renderStub: Renderer = (primitive) => {
  const attrsPreview = previewAttrs(primitive.attrs)
  const symbol = primitive.symbol ?? ''

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${DEFAULT_CARD.width - 1.5}" height="${DEFAULT_CARD.height - 1.5}" rx="6" />`,
    `<line class="accent-rule-derived" x1="0" y1="42" x2="${DEFAULT_CARD.width}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="badge-derived" x="${DEFAULT_CARD.width - 20}" y="28" text-anchor="end">${escapeXml(primitive.family.toUpperCase())}</text>`,
    symbol ? `<text class="symbol" x="24" y="92">${escapeXml(symbol)}</text>` : '',
    `<text class="uncertainty" x="24" y="${symbol ? 132 : 92}">${escapeXml(attrsPreview)}</text>`,
    `<text class="deriv" x="24" y="200">renderer pending — typeset stub</text>`,
    `<text class="source" x="24" y="226">${escapeXml(primitive.sourceId)}</text>`,
    `<text class="id" x="${DEFAULT_CARD.width - 20}" y="226" text-anchor="end">${escapeXml(primitive.id)}</text>`,
    SVG_CLOSE,
  ].join('')
}

function previewAttrs(attrs: unknown): string {
  if (typeof attrs !== 'object' || attrs === null) return ''
  const entries = Object.entries(attrs as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null && typeof v !== 'object')
    .slice(0, 4)
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join('   ')
}
