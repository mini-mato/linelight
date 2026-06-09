/**
 * SVG render helpers for atlas thumbnails.
 *
 * Pure string-output. No DOM. No browser-only APIs. Runs equally in
 * Node (via tsx for build-time emission) and the browser.
 */

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
  '+': '⁺',
}

const THIN_SPACE = ' '
const TIMES = '×'
const DOT = '·'

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function toSuperscript(s: string): string {
  return [...s].map((ch) => SUPERSCRIPT_MAP[ch] ?? ch).join('')
}

/**
 * Group digits with thin spaces, CODATA convention.
 *  - "299792458" -> "299 792 458" (groups of 3 from right)
 *  - "6.62607015" -> "6.626 070 15" (groups of 3 from decimal point outward)
 */
export function groupDigits(numericString: string): string {
  const negative = numericString.startsWith('-')
  const s = negative ? numericString.slice(1) : numericString
  let result: string
  if (s.includes('.')) {
    const [intPart, fracPart] = s.split('.')
    result = groupRight(intPart) + '.' + groupLeft(fracPart)
  } else {
    result = groupRight(s)
  }
  return (negative ? '-' : '') + result
}

function groupRight(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE)
}

function groupLeft(s: string): string {
  return s.replace(/(\d{3})(?=\d)/g, '$1' + THIN_SPACE)
}

/**
 * Format a numeric value into a (mantissa, exponent) pair with CODATA-style
 * digit grouping. Exponent is null when the value sits in [1e-3, 1e6).
 */
export function formatValueGrouped(value: number): {
  mantissa: string
  exponent: number | null
} {
  if (value === 0) return { mantissa: '0', exponent: null }
  const abs = Math.abs(value)
  const useScientific = abs < 1e-3 || abs >= 1e6
  if (useScientific) {
    const [mRaw, eRaw] = abs.toExponential().split('e')
    const exp = parseInt(eRaw, 10)
    const sign = value < 0 ? '-' : ''
    return { mantissa: sign + groupDigits(mRaw), exponent: exp }
  }
  return { mantissa: groupDigits(value.toString()), exponent: null }
}

/**
 * "m s^-1" -> "m·s⁻¹"
 * "J K^-1" -> "J·K⁻¹"
 * "mol^-1" -> "mol⁻¹"
 * "C" -> "C"
 * Conservative: only converts ^-? and ^? followed by digits.
 */
export function prettifyUnit(unit: string): string {
  // First, replace single spaces with middle dots between unit tokens.
  // Then convert ^<digits> and ^-<digits> to unicode superscripts.
  const dotted = unit.replace(/\s+/g, DOT)
  return dotted.replace(/\^(-?\+?\d+)/g, (_m, exp: string) => toSuperscript(exp))
}

export type SvgCardOptions = {
  width: number
  height: number
}

export const DEFAULT_CARD: SvgCardOptions = { width: 480, height: 240 }

/** Common SVG <defs><style/></defs> block shared across all atlas thumbnails. */
export const ATLAS_STYLE = `
  .frame { fill: #fdfdfd; stroke: #1a3a3f; stroke-width: 1.25; }
  .name { font: 500 13px ui-sans-serif, system-ui, -apple-system, sans-serif; fill: #1a3a3f; letter-spacing: 0.2px; }
  .badge-exact { font: 600 10px ui-sans-serif, system-ui, sans-serif; fill: #5b8c5a; letter-spacing: 1.2px; }
  .badge-derived { font: 600 10px ui-sans-serif, system-ui, sans-serif; fill: #7c6e3a; letter-spacing: 1.2px; }
  .symbol { font: 600 38px 'Iosevka', 'iA Writer Quattro', ui-monospace, Menlo, monospace; fill: #0e2a2f; }
  .value { font: 400 22px 'Iosevka', 'iA Writer Quattro', ui-monospace, Menlo, monospace; fill: #0e2a2f; }
  .exponent { font: 400 14px 'Iosevka', ui-monospace, Menlo, monospace; fill: #0e2a2f; }
  .unit { font: 400 14px 'Iosevka', ui-monospace, Menlo, monospace; fill: #4a6c70; }
  .deriv { font: italic 11px ui-serif, Georgia, serif; fill: #4a6c70; }
  .source { font: 600 10px ui-sans-serif, system-ui, sans-serif; fill: #4a6c70; letter-spacing: 0.8px; }
  .id { font: 400 9px ui-monospace, Menlo, monospace; fill: #8a9c9f; }
  .uncertainty { font: 400 11px 'Iosevka', ui-monospace, Menlo, monospace; fill: #6a7c80; }
  .accent-rule { stroke: #5b8c5a; stroke-width: 2; opacity: 0.45; }
  .accent-rule-derived { stroke: #b89a3a; stroke-width: 2; opacity: 0.4; }
`

export function svgOpen(opts: SvgCardOptions = DEFAULT_CARD): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${opts.width} ${opts.height}" width="${opts.width}" height="${opts.height}" role="img"><defs><style>${ATLAS_STYLE}</style></defs>`
}

export function addAccessibleTitle(svg: string, title: string, idHint: string): string {
  if (/<title\b/.test(svg)) return svg
  const titleId = `title-${idHint.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const openMatch = svg.match(/^<svg\b[^>]*>/)
  if (!openMatch) return svg

  const open = openMatch[0]
  const labelledOpen = /\baria-labelledby=/.test(open)
    ? open
    : open.replace(/^<svg\b/, `<svg aria-labelledby="${titleId}"`)
  return `${labelledOpen}<title id="${titleId}">${escapeXml(title)}</title>${svg.slice(open.length)}`
}

export const SVG_CLOSE = '</svg>'

export { THIN_SPACE, TIMES, DOT }
