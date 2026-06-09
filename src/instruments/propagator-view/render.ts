/**
 * Canvas2D renderer for the propagator view.
 *
 * Coordinate space:
 *   x-axis: Re ω (rad/s) — transition frequency
 *   y-axis: Im ω (rad/s) — always ≤ 0; more negative = broader line
 *
 * Viewport auto-fits to the visible poles with 10 % padding.
 * The real axis (Im ω = 0) is drawn as a thick baseline.
 * Poles are circles colored by wavelength (CIE 1931 pipeline).
 * The ionization continuum threshold (H only) is a dashed vertical.
 */

import type { Pole } from './poles'
import type { RenderedPole } from './hit-test'
import type { LineSelection } from '../../types'
import { wavelengthToHex } from '../../physics/color'

const FONT_MONO = "'JetBrains Mono', monospace"
const PAD_L = 64
const PAD_R = 20
const PAD_T = 36
const PAD_B = 28

const POLE_R_NORMAL = 5
const POLE_R_SELECTED = 8

// Ionization threshold for hydrogen: ω_ion = E_ion / ħ = 13.6 eV / ħ
const ION_OMEGA_H = (13.6 * 1.602176634e-19) / 1.0545718176461565e-34

export type ViewPort = {
  reOmega_min: number
  reOmega_max: number
  imOmega_min: number
  imOmega_max: number
  width_px: number
  height_px: number
}

/**
 * Compute the viewport that fits all poles with 10 % padding.
 * Filters poles with ω < 1e11 (radio lines — off any optical viewport).
 * Guarantees a minimum x-range of 1e13 rad/s and y-range of 1e7 rad/s
 * so even sub-MHz natural linewidths produce a visible y-axis.
 */
export function computeViewPort(poles: Pole[], width_px: number, height_px: number): ViewPort {
  const opticalPoles = poles.filter((p) => p.reOmega_rad_per_s > 1e11)

  let reMin = 1e15
  let reMax = 4e15
  let imMin = -1e8

  for (const p of opticalPoles) {
    if (p.reOmega_rad_per_s < reMin) reMin = p.reOmega_rad_per_s
    if (p.reOmega_rad_per_s > reMax) reMax = p.reOmega_rad_per_s
    if (p.imOmega_rad_per_s < imMin) imMin = p.imOmega_rad_per_s
  }

  const reRange = Math.max(reMax - reMin, 1e13)
  const pad = reRange * 0.1
  const imRange = Math.max(-imMin, 1e7)

  return {
    reOmega_min: reMin - pad,
    reOmega_max: reMax + pad,
    imOmega_min: imMin - imRange * 0.1,
    imOmega_max: 0,
    width_px,
    height_px,
  }
}

function toX(vp: ViewPort, re: number): number {
  const t = (re - vp.reOmega_min) / (vp.reOmega_max - vp.reOmega_min)
  return PAD_L + t * (vp.width_px - PAD_L - PAD_R)
}

function toY(vp: ViewPort, im: number): number {
  const t = (im - vp.imOmega_max) / (vp.imOmega_min - vp.imOmega_max)
  return PAD_T + t * (vp.height_px - PAD_T - PAD_B)
}

function fmtOmega(omega: number): string {
  if (Math.abs(omega) >= 1e15) return `${(omega / 1e15).toFixed(2)}×10¹⁵`
  if (Math.abs(omega) >= 1e12) return `${(omega / 1e12).toFixed(1)}×10¹²`
  if (Math.abs(omega) >= 1e9) return `${(omega / 1e9).toFixed(1)} GHz`
  return omega.toExponential(2)
}

function fmtImOmega(im: number): string {
  const mag = Math.abs(im)
  if (mag >= 1e10) return `−${(mag / 1e9).toFixed(1)} G`
  if (mag >= 1e7) return `−${(mag / 1e6).toFixed(1)} M`
  return `${im.toExponential(1)}`
}

/**
 * Draw all poles onto `ctx` and return their canvas coordinates for hit-testing.
 * Returns [] if no optical poles are visible.
 */
export function drawPropagatorView(
  ctx: CanvasRenderingContext2D,
  poles: Pole[],
  viewport: ViewPort,
  selectedLine: LineSelection | null,
): RenderedPole[] {
  const { width_px: W, height_px: H } = viewport

  ctx.fillStyle = '#fafafa'
  ctx.fillRect(0, 0, W, H)

  const innerL = PAD_L
  const innerR = W - PAD_R
  const realAxisY = toY(viewport, 0)

  ctx.font = `10px ${FONT_MONO}`
  ctx.fillStyle = '#888'
  ctx.textAlign = 'right'

  const nGridLines = 4
  for (let i = 0; i <= nGridLines; i++) {
    const im = viewport.imOmega_min * (i / nGridLines)
    const y = toY(viewport, im)
    ctx.strokeStyle = im === 0 ? '#0a0a0a' : '#ddd'
    ctx.lineWidth = im === 0 ? 1.5 : 0.5
    ctx.beginPath()
    ctx.moveTo(innerL, y)
    ctx.lineTo(innerR, y)
    ctx.stroke()
    if (im !== 0) {
      ctx.fillText(fmtImOmega(im), innerL - 4, y + 3)
    }
  }

  ctx.save()
  ctx.translate(12, (PAD_T + H - PAD_B) / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.font = `10px ${FONT_MONO}`
  ctx.fillStyle = '#666'
  ctx.fillText('Im ω (rad/s)', 0, 0)
  ctx.restore()

  ctx.textAlign = 'left'
  ctx.font = `10px ${FONT_MONO}`
  ctx.fillStyle = '#666'
  ctx.fillText('Re ω →', innerL, realAxisY - 6)

  if (ION_OMEGA_H > viewport.reOmega_min && ION_OMEGA_H < viewport.reOmega_max) {
    const xIon = toX(viewport, ION_OMEGA_H)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = '#c44'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(xIon, PAD_T)
    ctx.lineTo(xIon, H - PAD_B)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = `9px ${FONT_MONO}`
    ctx.fillStyle = '#c44'
    ctx.textAlign = 'center'
    ctx.fillText('H ion.', xIon, PAD_T - 4)
  }

  ctx.textAlign = 'center'
  ctx.font = `9px ${FONT_MONO}`
  ctx.fillStyle = '#888'
  const opticalPoles = poles.filter((p) => p.reOmega_rad_per_s > 1e11)
  const seenX = new Set<number>()
  for (const p of opticalPoles) {
    const x = Math.round(toX(viewport, p.reOmega_rad_per_s))
    if (!seenX.has(x)) {
      seenX.add(x)
      ctx.strokeStyle = '#ccc'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(x, realAxisY)
      ctx.lineTo(x, H - PAD_B + 4)
      ctx.stroke()
      ctx.fillText(fmtOmega(p.reOmega_rad_per_s), x, H - 6)
    }
  }

  if (opticalPoles.length === 0) {
    ctx.textAlign = 'center'
    ctx.font = `11px ${FONT_MONO}`
    ctx.fillStyle = '#aaa'
    ctx.fillText('no lines in this element', W / 2, H / 2)
    return []
  }

  const renderedPoles: RenderedPole[] = []
  const selectedId = selectedLine ? `${selectedLine.element}/${selectedLine.wavelength_nm}` : null

  for (const pole of opticalPoles) {
    const cx = toX(viewport, pole.reOmega_rad_per_s)
    const cy = toY(viewport, pole.imOmega_rad_per_s)
    const lineId = `${pole.parent.element}/${pole.parent.wavelength_nm}`
    const isSelected = lineId === selectedId

    const color = wavelengthToHex(pole.parent.wavelength_nm, 'cie1931')
    const r = isSelected ? POLE_R_SELECTED : POLE_R_NORMAL

    ctx.setLineDash([2, 3])
    ctx.strokeStyle = color + '88'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx, realAxisY)
    ctx.lineTo(cx, cy)
    ctx.stroke()
    ctx.setLineDash([])

    if (isSelected) {
      ctx.beginPath()
      ctx.arc(cx, cy, r + 3, 0, 2 * Math.PI)
      ctx.fillStyle = '#fff'
      ctx.fill()
      ctx.strokeStyle = '#0a0a0a'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#0a0a0a'
    ctx.lineWidth = pole.fidelity === 'schematic' ? 0.5 : 1.5
    ctx.stroke()

    ctx.textAlign = 'center'
    ctx.font = `9px ${FONT_MONO}`
    ctx.fillStyle = '#0a0a0a'
    const labelText = pole.subLabel ? `${pole.label} ${pole.subLabel.slice(0, 7)}` : pole.label
    ctx.fillText(labelText, cx, realAxisY - 6)

    renderedPoles.push({ pole, cx_px: cx, cy_px: cy })
  }

  return renderedPoles
}
