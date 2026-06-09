/**
 * Render a special-function primitive as an SVG card with a small inline plot.
 *
 * Card layout (480x240) mirrors the constant card:
 *   - top-left:  human name
 *   - top-right: family badge
 *   - left half: symbol + tiny defining-equation strip
 *   - right half: 200x140 plot canvas
 *   - bottom:    source citation + primitive id
 *
 * Math is implemented inline (no scipy / no math.js):
 *   Γ(z)            — Lanczos g=7 approximation, accurate to ~1e-13 on real axis.
 *   Β(p,q)          — via Γ.
 *   J_n(x), Y_n(x)  — power-series for small |x|, Hankel asymptotic for large.
 *   I_n(x), K_n(x)  — modified Bessel (series + asymptotic).
 *   P_n(x), Q_n(x)  — Bonnet recurrence; Q_0,Q_1 closed form, then recursion.
 *   H_n(x)          — physicists' Hermite recursion: H_{n+1} = 2x H_n − 2n H_{n-1}.
 *   L_n^α(x)        — generalised Laguerre recursion.
 *   C_n^α(x)        — Gegenbauer recursion.
 *   Y_l^m polar     — |Y_l^m(θ,0)| as a polar plot with sign coloring.
 *   ₂F₁, ₁F₁        — truncated series in their disks of convergence.
 *
 * No external dependencies.
 */

import type { Primitive, SpecialFunctionAttrs } from '../types.js'
import type { BackRenderer, Renderer } from './types.js'
import { DEFAULT_CARD, SVG_CLOSE, escapeXml, svgOpen } from './svg.js'
import { buildBackParts } from './back-helpers.js'
import { renderBackSkeleton } from './back-skeleton.js'

// -- Lanczos Γ(z) ----------------------------------------------------------

const LANCZOS_G = 7
const LANCZOS_P = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
]

export function gammaFn(z: number): number {
  if (z < 0.5) {
    // Reflection formula: Γ(z)Γ(1-z) = π/sin(πz)
    return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z))
  }
  z -= 1
  let x = LANCZOS_P[0]
  for (let i = 1; i < LANCZOS_G + 2; i++) x += LANCZOS_P[i] / (z + i)
  const t = z + LANCZOS_G + 0.5
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x
}

export function betaFn(p: number, q: number): number {
  return (gammaFn(p) * gammaFn(q)) / gammaFn(p + q)
}

// -- Bessel J_n(x) ---------------------------------------------------------
// Series for |x| < ~12, asymptotic for larger x. Accurate enough for plots.

export function besselJ(n: number, x: number): number {
  if (x < 0) return (n % 2 === 0 ? 1 : -1) * besselJ(n, -x)
  if (x === 0) return n === 0 ? 1 : 0
  if (Math.abs(x) < 12) {
    // J_n(x) = (x/2)^n Σ_{k≥0} (-x²/4)^k / (k! (n+k)!)
    const half = x / 2
    let term = Math.pow(half, n) / factorial(n)
    let sum = term
    const z = -half * half
    for (let k = 1; k < 80; k++) {
      term *= z / (k * (n + k))
      sum += term
      if (Math.abs(term) < 1e-16 * Math.abs(sum)) break
    }
    return sum
  }
  // Hankel asymptotic
  const chi = x - (n / 2 + 0.25) * Math.PI
  return Math.sqrt(2 / (Math.PI * x)) * Math.cos(chi)
}

export function besselY(n: number, x: number): number {
  if (x <= 0) return Number.NaN
  if (Math.abs(x) > 12) {
    const chi = x - (n / 2 + 0.25) * Math.PI
    return Math.sqrt(2 / (Math.PI * x)) * Math.sin(chi)
  }
  // Use the relation Y_n(x) = lim_{ν→n} [J_ν(x) cos(νπ) − J_{−ν}(x)] / sin(νπ).
  // Numerically: differentiate at small ε.
  const eps = 1e-5
  const num =
    besselJfractional(n + eps, x) * Math.cos((n + eps) * Math.PI) - besselJfractional(-(n + eps), x)
  return num / Math.sin((n + eps) * Math.PI)
}

function besselJfractional(nu: number, x: number): number {
  // Power series with Γ instead of factorial; converges for x not too large.
  const half = x / 2
  let sum = 0
  const z = -half * half
  let term = Math.pow(half, nu) / gammaFn(nu + 1)
  sum += term
  for (let k = 1; k < 80; k++) {
    term *= z / (k * (nu + k))
    sum += term
    if (Math.abs(term) < 1e-16 * Math.abs(sum)) break
  }
  return sum
}

export function besselI(n: number, x: number): number {
  // I_n(x) = Σ (x/2)^{n+2k} / (k! (n+k)!)
  const half = x / 2
  let term = Math.pow(half, n) / factorial(n)
  let sum = term
  const z = half * half
  for (let k = 1; k < 80; k++) {
    term *= z / (k * (n + k))
    sum += term
    if (Math.abs(term) < 1e-16 * Math.abs(sum)) break
  }
  return sum
}

export function besselK(n: number, x: number): number {
  if (x <= 0) return Number.NaN
  // Crude but adequate for plots: K_n(x) ≈ √(π/(2x)) e^{-x} for large x;
  // for small x we use the integral series via I_{±ν} relation.
  if (x > 5) return Math.sqrt(Math.PI / (2 * x)) * Math.exp(-x)
  // K_n(x) = (π/2) [I_{-n}(x) − I_n(x)] / sin(nπ); for integer n use limit
  const eps = 1e-5
  const nu = n + eps
  return (
    (Math.PI / 2) *
    ((besselIfractional(-nu, x) - besselIfractional(nu, x)) / Math.sin(nu * Math.PI))
  )
}

function besselIfractional(nu: number, x: number): number {
  const half = x / 2
  const z = half * half
  let term = Math.pow(half, nu) / gammaFn(nu + 1)
  let sum = term
  for (let k = 1; k < 80; k++) {
    term *= z / (k * (nu + k))
    sum += term
    if (Math.abs(term) < 1e-16 * Math.abs(sum)) break
  }
  return sum
}

// -- Legendre P_n(x), Q_n(x) ----------------------------------------------

export function legendreP(n: number, x: number): number {
  if (n === 0) return 1
  if (n === 1) return x
  let p0 = 1
  let p1 = x
  for (let k = 1; k < n; k++) {
    const p2 = ((2 * k + 1) * x * p1 - k * p0) / (k + 1)
    p0 = p1
    p1 = p2
  }
  return p1
}

export function legendreQ(n: number, x: number): number {
  if (Math.abs(x) >= 1) return Number.NaN
  const q0 = 0.5 * Math.log((1 + x) / (1 - x))
  if (n === 0) return q0
  const q1 = x * q0 - 1
  if (n === 1) return q1
  let qm1 = q0
  let qn = q1
  for (let k = 1; k < n; k++) {
    const qp1 = ((2 * k + 1) * x * qn - k * qm1) / (k + 1)
    qm1 = qn
    qn = qp1
  }
  return qn
}

// -- Hermite H_n(x) (physicists') -----------------------------------------

export function hermiteH(n: number, x: number): number {
  if (n === 0) return 1
  if (n === 1) return 2 * x
  let h0 = 1
  let h1 = 2 * x
  for (let k = 1; k < n; k++) {
    const h2 = 2 * x * h1 - 2 * k * h0
    h0 = h1
    h1 = h2
  }
  return h1
}

// -- Generalised Laguerre L_n^α(x) ----------------------------------------

export function laguerreL(n: number, alpha: number, x: number): number {
  if (n === 0) return 1
  if (n === 1) return 1 + alpha - x
  let l0 = 1
  let l1 = 1 + alpha - x
  for (let k = 1; k < n; k++) {
    const l2 = ((2 * k + 1 + alpha - x) * l1 - (k + alpha) * l0) / (k + 1)
    l0 = l1
    l1 = l2
  }
  return l1
}

// -- Gegenbauer C_n^α(x) ---------------------------------------------------

export function gegenbauerC(n: number, alpha: number, x: number): number {
  if (n === 0) return 1
  if (n === 1) return 2 * alpha * x
  let c0 = 1
  let c1 = 2 * alpha * x
  for (let k = 1; k < n; k++) {
    const c2 = (2 * (k + alpha) * x * c1 - (k + 2 * alpha - 1) * c0) / (k + 1)
    c0 = c1
    c1 = c2
  }
  return c1
}

// -- Hypergeometric ₂F₁ and ₁F₁ -------------------------------------------

export function hyper2F1(a: number, b: number, c: number, z: number): number {
  let term = 1
  let sum = 1
  for (let k = 0; k < 200; k++) {
    term *= (((a + k) * (b + k)) / ((c + k) * (k + 1))) * z
    sum += term
    if (Math.abs(term) < 1e-16 * Math.abs(sum)) break
  }
  return sum
}

export function hyper1F1(a: number, b: number, z: number): number {
  let term = 1
  let sum = 1
  for (let k = 0; k < 300; k++) {
    term *= ((a + k) / ((b + k) * (k + 1))) * z
    sum += term
    if (Math.abs(term) < 1e-16 * Math.abs(sum)) break
  }
  return sum
}

// -- Spherical harmonic |Y_l^m(θ,0)| --------------------------------------
// We render the polar magnitude profile (the textbook rosette).

function factorial(n: number): number {
  if (n < 2) return 1
  let f = 1
  for (let i = 2; i <= n; i++) f *= i
  return f
}

function assocLegendreP(l: number, m: number, x: number): number {
  // Numerical recipes-style recurrence for P_l^m(x), m ≥ 0.
  if (m < 0 || m > l) return 0
  let pmm = 1
  if (m > 0) {
    const somx2 = Math.sqrt((1 - x) * (1 + x))
    let fact = 1
    for (let i = 1; i <= m; i++) {
      pmm *= -fact * somx2
      fact += 2
    }
  }
  if (l === m) return pmm
  let pmmp1 = x * (2 * m + 1) * pmm
  if (l === m + 1) return pmmp1
  let pll = 0
  for (let ll = m + 2; ll <= l; ll++) {
    pll = (x * (2 * ll - 1) * pmmp1 - (ll + m - 1) * pmm) / (ll - m)
    pmm = pmmp1
    pmmp1 = pll
  }
  return pll
}

export function sphericalHarmonicReal(l: number, m: number, theta: number): number {
  // φ = 0; returns the real-valued angular factor (sign included).
  const am = Math.abs(m)
  const norm = Math.sqrt(((2 * l + 1) / (4 * Math.PI)) * (factorial(l - am) / factorial(l + am)))
  const plm = assocLegendreP(l, am, Math.cos(theta))
  // For m=0 we return real Y. For m≠0, just return the magnitude factor; sign
  // is handled by caller for rosette coloring.
  return norm * plm
}

// -- Plot helpers ----------------------------------------------------------

const PLOT_X = 240
const PLOT_Y = 60
const PLOT_W = 220
const PLOT_H = 130

type PlotSpec =
  | {
      kind: 'cartesian'
      xMin: number
      xMax: number
      series: Array<{ f: (x: number) => number; label?: string; stroke: string }>
    }
  | { kind: 'polar'; thetaSamples: number; r: (theta: number) => number; stroke: string }

function isFiniteNum(v: number): boolean {
  return Number.isFinite(v)
}

function buildPath(
  samples: Array<[number, number]>,
  x0: number,
  y0: number,
  w: number,
  h: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): string {
  const xRange = xMax - xMin || 1
  const yRange = yMax - yMin || 1
  const segments: string[] = []
  let started = false
  for (const [sx, sy] of samples) {
    if (!isFiniteNum(sy)) {
      started = false
      continue
    }
    const px = x0 + ((sx - xMin) / xRange) * w
    const py = y0 + h - ((sy - yMin) / yRange) * h
    if (!started) {
      segments.push(`M ${px.toFixed(2)} ${py.toFixed(2)}`)
      started = true
    } else {
      segments.push(`L ${px.toFixed(2)} ${py.toFixed(2)}`)
    }
  }
  return segments.join(' ')
}

function renderPlot(spec: PlotSpec): string {
  const x0 = PLOT_X
  const y0 = PLOT_Y
  const w = PLOT_W
  const h = PLOT_H

  if (spec.kind === 'polar') {
    const samples: Array<[number, number]> = []
    for (let i = 0; i <= spec.thetaSamples; i++) {
      const t = (i / spec.thetaSamples) * 2 * Math.PI
      const r = spec.r(t)
      const x = r * Math.sin(t)
      const y = r * Math.cos(t)
      samples.push([x, y])
    }
    let maxAbs = 0
    for (const [sx, sy] of samples) {
      maxAbs = Math.max(maxAbs, Math.abs(sx), Math.abs(sy))
    }
    if (maxAbs === 0) maxAbs = 1
    const cx = x0 + w / 2
    const cy = y0 + h / 2
    const scale = (Math.min(w, h) / 2) * 0.9
    const segs: string[] = []
    let started = false
    for (const [sx, sy] of samples) {
      if (!isFiniteNum(sx) || !isFiniteNum(sy)) {
        started = false
        continue
      }
      const px = cx + (sx / maxAbs) * scale
      const py = cy - (sy / maxAbs) * scale
      if (!started) {
        segs.push(`M ${px.toFixed(2)} ${py.toFixed(2)}`)
        started = true
      } else {
        segs.push(`L ${px.toFixed(2)} ${py.toFixed(2)}`)
      }
    }
    return [
      `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#ffffff" stroke="#cdd5d6" stroke-width="0.5" />`,
      `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y0 + h}" stroke="#cdd5d6" stroke-width="0.5" />`,
      `<line x1="${x0}" y1="${cy}" x2="${x0 + w}" y2="${cy}" stroke="#cdd5d6" stroke-width="0.5" />`,
      `<path d="${segs.join(' ')}" fill="none" stroke="${spec.stroke}" stroke-width="1.4" />`,
    ].join('')
  }

  // Cartesian
  const N = 220
  const seriesPaths: string[] = []
  let yMin = Infinity
  let yMax = -Infinity
  const allSeriesSamples: Array<Array<[number, number]>> = []
  for (const s of spec.series) {
    const samples: Array<[number, number]> = []
    for (let i = 0; i <= N; i++) {
      const x = spec.xMin + ((spec.xMax - spec.xMin) * i) / N
      const y = s.f(x)
      samples.push([x, y])
      if (isFiniteNum(y)) {
        // Clip extreme blowups (Γ poles) for plotting only.
        if (y < 50 && y > -50) {
          if (y < yMin) yMin = y
          if (y > yMax) yMax = y
        }
      }
    }
    allSeriesSamples.push(samples)
  }
  if (!isFiniteNum(yMin) || !isFiniteNum(yMax) || yMin === yMax) {
    yMin = -1
    yMax = 1
  }
  // Pad
  const pad = (yMax - yMin) * 0.08
  yMin -= pad
  yMax += pad
  // Clamp samples to [yMin, yMax] visually so poles don't ruin the plot.
  for (const samples of allSeriesSamples) {
    for (const pt of samples) {
      if (pt[1] > yMax) pt[1] = NaN
      if (pt[1] < yMin) pt[1] = NaN
    }
  }
  for (let i = 0; i < spec.series.length; i++) {
    const s = spec.series[i]
    const d = buildPath(allSeriesSamples[i], x0, y0, w, h, spec.xMin, spec.xMax, yMin, yMax)
    seriesPaths.push(`<path d="${d}" fill="none" stroke="${s.stroke}" stroke-width="1.4" />`)
  }
  // Axes through 0 if 0 ∈ ranges.
  const axisLines: string[] = []
  if (yMin < 0 && yMax > 0) {
    const yz = y0 + h - ((0 - yMin) / (yMax - yMin)) * h
    axisLines.push(
      `<line x1="${x0}" y1="${yz.toFixed(2)}" x2="${x0 + w}" y2="${yz.toFixed(2)}" stroke="#cdd5d6" stroke-width="0.5" />`,
    )
  }
  if (spec.xMin < 0 && spec.xMax > 0) {
    const xz = x0 + ((0 - spec.xMin) / (spec.xMax - spec.xMin)) * w
    axisLines.push(
      `<line x1="${xz.toFixed(2)}" y1="${y0}" x2="${xz.toFixed(2)}" y2="${y0 + h}" stroke="#cdd5d6" stroke-width="0.5" />`,
    )
  }
  return [
    `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#ffffff" stroke="#cdd5d6" stroke-width="0.5" />`,
    axisLines.join(''),
    seriesPaths.join(''),
  ].join('')
}

// -- Renderer dispatch ----------------------------------------------------

const COLORS = ['#1a3a3f', '#5b8c5a', '#b89a3a', '#7c5a8c']

function plotSpecForPrimitive(p: Primitive): PlotSpec {
  // Plot is keyed on primitive id; falls back to a flat constant if unknown.
  const id = p.id

  if (id === 'special-function.gamma') {
    return {
      kind: 'cartesian',
      xMin: -4.5,
      xMax: 5,
      series: [{ f: (x) => gammaFn(x), stroke: COLORS[0] }],
    }
  }
  if (id === 'special-function.beta') {
    return {
      kind: 'cartesian',
      xMin: 0.05,
      xMax: 4,
      series: [{ f: (x) => betaFn(x, 2), stroke: COLORS[0] }],
    }
  }
  if (id.startsWith('special-function.bessel.j')) {
    return {
      kind: 'cartesian',
      xMin: 0,
      xMax: 20,
      series: [
        { f: (x) => besselJ(0, x), stroke: COLORS[0] },
        { f: (x) => besselJ(1, x), stroke: COLORS[1] },
        { f: (x) => besselJ(2, x), stroke: COLORS[2] },
      ],
    }
  }
  if (id.startsWith('special-function.bessel.y')) {
    return {
      kind: 'cartesian',
      xMin: 0.5,
      xMax: 20,
      series: [
        { f: (x) => besselY(0, x), stroke: COLORS[0] },
        { f: (x) => besselY(1, x), stroke: COLORS[1] },
      ],
    }
  }
  if (id.startsWith('special-function.bessel.i')) {
    return {
      kind: 'cartesian',
      xMin: 0,
      xMax: 4,
      series: [
        { f: (x) => besselI(0, x), stroke: COLORS[0] },
        { f: (x) => besselI(1, x), stroke: COLORS[1] },
      ],
    }
  }
  if (id.startsWith('special-function.bessel.k')) {
    return {
      kind: 'cartesian',
      xMin: 0.05,
      xMax: 4,
      series: [
        { f: (x) => besselK(0, x), stroke: COLORS[0] },
        { f: (x) => besselK(1, x), stroke: COLORS[1] },
      ],
    }
  }
  if (id === 'special-function.legendre.p') {
    return {
      kind: 'cartesian',
      xMin: -1,
      xMax: 1,
      series: [
        { f: (x) => legendreP(2, x), stroke: COLORS[0] },
        { f: (x) => legendreP(3, x), stroke: COLORS[1] },
        { f: (x) => legendreP(4, x), stroke: COLORS[2] },
      ],
    }
  }
  if (id === 'special-function.legendre.q') {
    return {
      kind: 'cartesian',
      xMin: -0.95,
      xMax: 0.95,
      series: [
        { f: (x) => legendreQ(0, x), stroke: COLORS[0] },
        { f: (x) => legendreQ(1, x), stroke: COLORS[1] },
        { f: (x) => legendreQ(2, x), stroke: COLORS[2] },
      ],
    }
  }
  if (id === 'special-function.legendre.p-assoc') {
    return {
      kind: 'cartesian',
      xMin: -1,
      xMax: 1,
      series: [
        { f: (x) => assocLegendreP(2, 1, x), stroke: COLORS[0] },
        { f: (x) => assocLegendreP(3, 2, x), stroke: COLORS[1] },
      ],
    }
  }
  if (id === 'special-function.hermite') {
    return {
      kind: 'cartesian',
      xMin: -3,
      xMax: 3,
      series: [
        { f: (x) => hermiteH(2, x), stroke: COLORS[0] },
        { f: (x) => hermiteH(3, x), stroke: COLORS[1] },
        { f: (x) => hermiteH(4, x), stroke: COLORS[2] },
      ],
    }
  }
  if (id === 'special-function.laguerre') {
    return {
      kind: 'cartesian',
      xMin: 0,
      xMax: 10,
      series: [
        { f: (x) => laguerreL(1, 0, x), stroke: COLORS[0] },
        { f: (x) => laguerreL(2, 0, x), stroke: COLORS[1] },
        { f: (x) => laguerreL(3, 0, x), stroke: COLORS[2] },
      ],
    }
  }
  if (id === 'special-function.gegenbauer') {
    return {
      kind: 'cartesian',
      xMin: -1,
      xMax: 1,
      series: [
        { f: (x) => gegenbauerC(2, 0.5, x), stroke: COLORS[0] },
        { f: (x) => gegenbauerC(3, 0.5, x), stroke: COLORS[1] },
        { f: (x) => gegenbauerC(4, 0.5, x), stroke: COLORS[2] },
      ],
    }
  }
  if (id === 'special-function.spherical-harmonic') {
    // Polar plot of |Y_2^0(θ)|
    return {
      kind: 'polar',
      thetaSamples: 200,
      r: (theta) => Math.abs(sphericalHarmonicReal(2, 0, theta)),
      stroke: COLORS[0],
    }
  }
  if (id === 'special-function.hypergeometric-2f1') {
    // ₂F₁(0.5, 0.5; 1; z) on z ∈ (-0.95, 0.95)
    return {
      kind: 'cartesian',
      xMin: -0.95,
      xMax: 0.95,
      series: [{ f: (z) => hyper2F1(0.5, 0.5, 1, z), stroke: COLORS[0] }],
    }
  }
  if (id === 'special-function.hypergeometric-1f1') {
    // ₁F₁(1; 2; z)
    return {
      kind: 'cartesian',
      xMin: -3,
      xMax: 3,
      series: [{ f: (z) => hyper1F1(1, 2, z), stroke: COLORS[0] }],
    }
  }
  // Fallback: flat zero — should not occur for shipped primitives.
  return { kind: 'cartesian', xMin: -1, xMax: 1, series: [{ f: () => 0, stroke: COLORS[0] }] }
}

function readEqn(p: Primitive): string | null {
  const a = p.attrs as SpecialFunctionAttrs
  if (a && typeof a === 'object' && typeof a.definingEquation === 'string') {
    return a.definingEquation
  }
  return null
}

export const renderSpecialFunction: Renderer = (primitive, ctx) => {
  const source = ctx.sources.get(primitive.sourceId)
  const sourceLabel = source ? sourceShortLabel(source.id) : sourceShortLabel(primitive.sourceId)
  const symbol = primitive.symbol ?? primitive.id.split('.').pop() ?? ''
  const eqn = readEqn(primitive)
  const plot = renderPlot(plotSpecForPrimitive(primitive))

  return [
    svgOpen(DEFAULT_CARD),
    `<rect class="frame" x="0.75" y="0.75" width="${DEFAULT_CARD.width - 1.5}" height="${DEFAULT_CARD.height - 1.5}" rx="6" />`,
    `<line class="accent-rule" x1="0" y1="42" x2="${DEFAULT_CARD.width}" y2="42" />`,
    `<text class="name" x="20" y="28">${escapeXml(primitive.name)}</text>`,
    `<text class="badge-exact" x="${DEFAULT_CARD.width - 20}" y="28" text-anchor="end">SPECIAL FN</text>`,
    `<text class="symbol" x="24" y="92">${escapeXml(symbol)}</text>`,
    eqn ? `<text class="deriv" x="24" y="120">${escapeXml(eqn)}</text>` : '',
    plot,
    `<text class="source" x="24" y="226">${escapeXml(sourceLabel)}</text>`,
    `<text class="id" x="${DEFAULT_CARD.width - 20}" y="226" text-anchor="end">${escapeXml(primitive.id)}</text>`,
    SVG_CLOSE,
  ].join('')
}

function sourceShortLabel(sourceId: string): string {
  const map: Record<string, string> = {
    'codata-2022': 'CODATA 2022',
    'nist-dlmf': 'NIST DLMF',
    'bransden-joachain-2003': 'Bransden-Joachain 2003',
  }
  return map[sourceId] ?? sourceId.toUpperCase()
}

// -- Back-card plot helpers ------------------------------------------------
//
// The back-card family region is ~440 x 130. We carve it into a 280-wide
// plot panel on the left and a 150-wide stats column on the right. The
// back is achromatic (--ink only) — different curves are distinguished
// by stroke-dasharray and a small in-line label.

const BACK_PLOT_X = 0
const BACK_PLOT_Y = 6
const BACK_PLOT_W = 280
const BACK_PLOT_H = 280

const BACK_DASH_PATTERNS = ['', '4 3', '2 2', '6 2 2 2']

type BackPlotSpec =
  | {
      kind: 'cartesian'
      xMin: number
      xMax: number
      series: Array<{ f: (x: number) => number; label: string }>
    }
  | {
      kind: 'polar'
      thetaSamples: number
      r: (theta: number) => number
      label: string
    }
  | { kind: 'none'; reason: string }

function backPlotSpec(p: Primitive): BackPlotSpec {
  const id = p.id

  if (id === 'special-function.legendre.p') {
    return {
      kind: 'cartesian',
      xMin: -1,
      xMax: 1,
      series: [
        { f: (x) => legendreP(0, x), label: 'P₀' },
        { f: (x) => legendreP(1, x), label: 'P₁' },
        { f: (x) => legendreP(2, x), label: 'P₂' },
        { f: (x) => legendreP(3, x), label: 'P₃' },
      ],
    }
  }
  if (id === 'special-function.legendre.q') {
    return {
      kind: 'cartesian',
      xMin: -0.95,
      xMax: 0.95,
      series: [
        { f: (x) => legendreQ(0, x), label: 'Q₀' },
        { f: (x) => legendreQ(1, x), label: 'Q₁' },
        { f: (x) => legendreQ(2, x), label: 'Q₂' },
      ],
    }
  }
  if (id === 'special-function.legendre.p-assoc') {
    return {
      kind: 'cartesian',
      xMin: -1,
      xMax: 1,
      series: [
        { f: (x) => assocLegendreP(2, 1, x), label: 'P₂¹' },
        { f: (x) => assocLegendreP(3, 2, x), label: 'P₃²' },
      ],
    }
  }
  if (id === 'special-function.hermite') {
    return {
      kind: 'cartesian',
      xMin: -3,
      xMax: 3,
      series: [
        { f: (x) => hermiteH(0, x), label: 'H₀' },
        { f: (x) => hermiteH(1, x), label: 'H₁' },
        { f: (x) => hermiteH(2, x), label: 'H₂' },
        { f: (x) => hermiteH(3, x), label: 'H₃' },
      ],
    }
  }
  if (id === 'special-function.laguerre') {
    return {
      kind: 'cartesian',
      xMin: 0,
      xMax: 10,
      series: [
        { f: (x) => laguerreL(0, 0, x), label: 'L₀' },
        { f: (x) => laguerreL(1, 0, x), label: 'L₁' },
        { f: (x) => laguerreL(2, 0, x), label: 'L₂' },
        { f: (x) => laguerreL(3, 0, x), label: 'L₃' },
      ],
    }
  }
  if (id === 'special-function.gegenbauer') {
    return {
      kind: 'cartesian',
      xMin: -1,
      xMax: 1,
      series: [
        { f: (x) => gegenbauerC(2, 0.5, x), label: 'C₂' },
        { f: (x) => gegenbauerC(3, 0.5, x), label: 'C₃' },
        { f: (x) => gegenbauerC(4, 0.5, x), label: 'C₄' },
      ],
    }
  }
  if (id.startsWith('special-function.bessel.j')) {
    return {
      kind: 'cartesian',
      xMin: 0,
      xMax: 20,
      series: [
        { f: (x) => besselJ(0, x), label: 'J₀' },
        { f: (x) => besselJ(1, x), label: 'J₁' },
        { f: (x) => besselJ(2, x), label: 'J₂' },
      ],
    }
  }
  if (id.startsWith('special-function.bessel.y')) {
    return {
      kind: 'cartesian',
      xMin: 0.5,
      xMax: 20,
      series: [
        { f: (x) => besselY(0, x), label: 'Y₀' },
        { f: (x) => besselY(1, x), label: 'Y₁' },
      ],
    }
  }
  if (id.startsWith('special-function.bessel.i')) {
    return {
      kind: 'cartesian',
      xMin: 0,
      xMax: 4,
      series: [
        { f: (x) => besselI(0, x), label: 'I₀' },
        { f: (x) => besselI(1, x), label: 'I₁' },
      ],
    }
  }
  if (id.startsWith('special-function.bessel.k')) {
    return {
      kind: 'cartesian',
      xMin: 0.05,
      xMax: 4,
      series: [
        { f: (x) => besselK(0, x), label: 'K₀' },
        { f: (x) => besselK(1, x), label: 'K₁' },
      ],
    }
  }
  if (id === 'special-function.gamma') {
    return {
      kind: 'cartesian',
      xMin: -4.5,
      xMax: 5,
      series: [{ f: (x) => gammaFn(x), label: 'Γ(x)' }],
    }
  }
  if (id === 'special-function.beta') {
    return {
      kind: 'cartesian',
      xMin: 0.05,
      xMax: 4,
      series: [{ f: (x) => betaFn(x, 2), label: 'Β(x, 2)' }],
    }
  }
  if (id === 'special-function.spherical-harmonic') {
    return {
      kind: 'polar',
      thetaSamples: 200,
      r: (theta) => Math.abs(sphericalHarmonicReal(2, 0, theta)),
      label: '|Y₂⁰(θ, 0)|',
    }
  }
  if (id === 'special-function.hypergeometric-2f1') {
    return {
      kind: 'cartesian',
      xMin: -0.95,
      xMax: 0.95,
      series: [{ f: (z) => hyper2F1(0.5, 0.5, 1, z), label: '₂F₁(½,½;1;z)' }],
    }
  }
  if (id === 'special-function.hypergeometric-1f1') {
    return {
      kind: 'cartesian',
      xMin: -3,
      xMax: 3,
      series: [{ f: (z) => hyper1F1(1, 2, z), label: '₁F₁(1;2;z)' }],
    }
  }

  return { kind: 'none', reason: '(see source)' }
}

function buildBackPath(
  samples: Array<[number, number]>,
  x0: number,
  y0: number,
  w: number,
  h: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): string {
  const xRange = xMax - xMin || 1
  const yRange = yMax - yMin || 1
  const segments: string[] = []
  let started = false
  for (const [sx, sy] of samples) {
    if (!isFiniteNum(sy)) {
      started = false
      continue
    }
    const px = x0 + ((sx - xMin) / xRange) * w
    const py = y0 + h - ((sy - yMin) / yRange) * h
    if (!started) {
      segments.push(`M ${px.toFixed(2)} ${py.toFixed(2)}`)
      started = true
    } else {
      segments.push(`L ${px.toFixed(2)} ${py.toFixed(2)}`)
    }
  }
  return segments.join(' ')
}

function renderBackPlot(spec: BackPlotSpec): { svg: string; ordersLabel: string } {
  const x0 = BACK_PLOT_X
  const y0 = BACK_PLOT_Y
  const w = BACK_PLOT_W
  const h = BACK_PLOT_H
  const ink = '#0e2a2f'
  const rule = '#d8d3c1'
  const inkSoft = '#4a6c70'

  if (spec.kind === 'none') {
    return {
      svg: [
        `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="none" stroke="${rule}" stroke-width="0.5" />`,
        `<text x="${x0 + w / 2}" y="${y0 + h / 2 + 4}" text-anchor="middle" font-family="ui-serif, Georgia, serif" font-style="italic" font-size="11" fill="${inkSoft}">${escapeXml(spec.reason)}</text>`,
      ].join(''),
      ordersLabel: '',
    }
  }

  if (spec.kind === 'polar') {
    const samples: Array<[number, number]> = []
    for (let i = 0; i <= spec.thetaSamples; i++) {
      const t = (i / spec.thetaSamples) * 2 * Math.PI
      const r = spec.r(t)
      const sx = r * Math.sin(t)
      const sy = r * Math.cos(t)
      samples.push([sx, sy])
    }
    let maxAbs = 0
    for (const [sx, sy] of samples) {
      maxAbs = Math.max(maxAbs, Math.abs(sx), Math.abs(sy))
    }
    if (maxAbs === 0) maxAbs = 1
    const cx = x0 + w / 2
    const cy = y0 + h / 2
    const scale = (Math.min(w, h) / 2) * 0.9
    const segs: string[] = []
    let started = false
    for (const [sx, sy] of samples) {
      if (!isFiniteNum(sx) || !isFiniteNum(sy)) {
        started = false
        continue
      }
      const px = cx + (sx / maxAbs) * scale
      const py = cy - (sy / maxAbs) * scale
      if (!started) {
        segs.push(`M ${px.toFixed(2)} ${py.toFixed(2)}`)
        started = true
      } else {
        segs.push(`L ${px.toFixed(2)} ${py.toFixed(2)}`)
      }
    }
    return {
      svg: [
        `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="none" stroke="${rule}" stroke-width="0.5" />`,
        `<line x1="${cx}" y1="${y0}" x2="${cx}" y2="${y0 + h}" stroke="${rule}" stroke-width="0.5" />`,
        `<line x1="${x0}" y1="${cy}" x2="${x0 + w}" y2="${cy}" stroke="${rule}" stroke-width="0.5" />`,
        `<path d="${segs.join(' ')}" fill="none" stroke="${ink}" stroke-width="1.2" />`,
        `<text x="${x0 + 4}" y="${y0 + 12}" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="10" fill="${inkSoft}">${escapeXml(spec.label)}</text>`,
      ].join(''),
      ordersLabel: spec.label,
    }
  }

  // Cartesian
  const N = 220
  let yMin = Infinity
  let yMax = -Infinity
  const allSeriesSamples: Array<Array<[number, number]>> = []
  for (const s of spec.series) {
    const samples: Array<[number, number]> = []
    for (let i = 0; i <= N; i++) {
      const x = spec.xMin + ((spec.xMax - spec.xMin) * i) / N
      const y = s.f(x)
      samples.push([x, y])
      if (isFiniteNum(y) && y < 50 && y > -50) {
        if (y < yMin) yMin = y
        if (y > yMax) yMax = y
      }
    }
    allSeriesSamples.push(samples)
  }
  if (!isFiniteNum(yMin) || !isFiniteNum(yMax) || yMin === yMax) {
    yMin = -1
    yMax = 1
  }
  const pad = (yMax - yMin) * 0.08
  yMin -= pad
  yMax += pad
  for (const samples of allSeriesSamples) {
    for (const pt of samples) {
      if (pt[1] > yMax) pt[1] = NaN
      if (pt[1] < yMin) pt[1] = NaN
    }
  }
  const seriesPaths: string[] = []
  const legendEntries: string[] = []
  const labels: string[] = []
  for (let i = 0; i < spec.series.length; i++) {
    const s = spec.series[i]
    labels.push(s.label)
    const dash = BACK_DASH_PATTERNS[i % BACK_DASH_PATTERNS.length]
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : ''
    const d = buildBackPath(allSeriesSamples[i], x0, y0, w, h, spec.xMin, spec.xMax, yMin, yMax)
    seriesPaths.push(`<path d="${d}" fill="none" stroke="${ink}" stroke-width="1.2"${dashAttr} />`)
    // Legend swatch + label rows in the top-left of the plot.
    const lx = x0 + 6
    const ly = y0 + 12 + i * 12
    legendEntries.push(
      `<line x1="${lx}" y1="${ly - 3}" x2="${lx + 14}" y2="${ly - 3}" stroke="${ink}" stroke-width="1.2"${dashAttr} />`,
      `<text x="${lx + 18}" y="${ly}" font-family="'Iosevka', ui-monospace, Menlo, monospace" font-size="9" fill="${inkSoft}">${escapeXml(s.label)}</text>`,
    )
  }
  const axisLines: string[] = []
  if (yMin < 0 && yMax > 0) {
    const yz = y0 + h - ((0 - yMin) / (yMax - yMin)) * h
    axisLines.push(
      `<line x1="${x0}" y1="${yz.toFixed(2)}" x2="${x0 + w}" y2="${yz.toFixed(2)}" stroke="${rule}" stroke-width="0.5" />`,
    )
  }
  if (spec.xMin < 0 && spec.xMax > 0) {
    const xz = x0 + ((0 - spec.xMin) / (spec.xMax - spec.xMin)) * w
    axisLines.push(
      `<line x1="${xz.toFixed(2)}" y1="${y0}" x2="${xz.toFixed(2)}" y2="${y0 + h}" stroke="${rule}" stroke-width="0.5" />`,
    )
  }
  return {
    svg: [
      `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="none" stroke="${rule}" stroke-width="0.5" />`,
      axisLines.join(''),
      seriesPaths.join(''),
      legendEntries.join(''),
    ].join(''),
    ordersLabel: labels.join(', '),
  }
}

function readSpecialFnAttrs(p: Primitive): SpecialFunctionAttrs {
  const a = p.attrs
  if (typeof a !== 'object' || a === null) return {}
  const r = a as Record<string, unknown>
  return {
    definingEquation: typeof r.definingEquation === 'string' ? r.definingEquation : undefined,
    recurrence: typeof r.recurrence === 'string' ? r.recurrence : undefined,
    orthogonalityWeight:
      typeof r.orthogonalityWeight === 'string' ? r.orthogonalityWeight : undefined,
    parameters: Array.isArray(r.parameters)
      ? r.parameters.filter((p): p is string => typeof p === 'string')
      : undefined,
  }
}

/**
 * Wrap a long monospace string into ≤ `maxChars` per line, returning
 * up to `maxLines`. Words are kept together when possible.
 */
function wrapMonoLines(s: string, maxChars: number, maxLines: number): string[] {
  const words = s.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (current.length === 0) {
      current = word
    } else if (current.length + 1 + word.length <= maxChars) {
      current = current + ' ' + word
    } else {
      lines.push(current)
      current = word
      if (lines.length >= maxLines) break
    }
  }
  if (current.length > 0 && lines.length < maxLines) lines.push(current)
  return lines.slice(0, maxLines)
}

/**
 * Render the family-specific block on the back of a special-function
 * card. Layout: tiny plot on the left two-thirds, stats column on the
 * right.
 */
function renderSpecialFunctionFamilyBlock(primitive: Primitive): string {
  const a = readSpecialFnAttrs(primitive)
  const spec = backPlotSpec(primitive)
  const { svg: plotSvg, ordersLabel } = renderBackPlot(spec)

  // Stats column to the right of the plot.
  const colX = BACK_PLOT_X + BACK_PLOT_W + 14
  const colW = 440 - (BACK_PLOT_W + 14) // ~146

  const rows: string[] = []
  let y = 14
  const labelH = 14
  const lineH = 13

  function addLabel(label: string): void {
    rows.push(`<text class="back-sf-label" x="${colX}" y="${y}">${escapeXml(label)}</text>`)
    y += labelH
  }
  function addText(text: string, charsPerLine = 18, maxLines = 4): void {
    const wrapped = wrapMonoLines(text, charsPerLine, maxLines)
    for (const line of wrapped) {
      rows.push(`<text class="back-sf-value" x="${colX}" y="${y}">${escapeXml(line)}</text>`)
      y += lineH
    }
    y += 6
  }

  if (a.definingEquation) {
    addLabel('DEFINING')
    addText(a.definingEquation, 18, 5)
  }
  if (a.recurrence) {
    addLabel('RECURRENCE')
    addText(a.recurrence, 18, 4)
  }
  if (a.orthogonalityWeight) {
    addLabel('ORTHOGONALITY')
    addText(a.orthogonalityWeight, 18, 3)
  }
  if (a.parameters && a.parameters.length > 0) {
    addLabel('PARAMETERS')
    addText(a.parameters.join(', '), 18, 2)
  }

  // Orders-shown caption under the plot.
  const ordersCaption =
    spec.kind === 'none'
      ? ''
      : `<text class="back-sf-caption" x="${BACK_PLOT_X}" y="${BACK_PLOT_Y + BACK_PLOT_H + 12}">orders shown: ${escapeXml(ordersLabel)}</text>`

  const style = `<style>
    .back-sf-label { font: 600 9px ui-sans-serif, system-ui, sans-serif; fill: #4a6c70; letter-spacing: 1.4px; }
    .back-sf-value { font: 400 10px 'Iosevka', ui-monospace, Menlo, monospace; fill: #0e2a2f; }
    .back-sf-caption { font: 400 9px 'Iosevka', ui-monospace, Menlo, monospace; fill: #4a6c70; }
  </style>`

  // A thin divider between plot and stats column.
  const divider = `<line x1="${BACK_PLOT_X + BACK_PLOT_W + 6}" y1="${BACK_PLOT_Y + 2}" x2="${BACK_PLOT_X + BACK_PLOT_W + 6}" y2="${BACK_PLOT_Y + BACK_PLOT_H - 2}" stroke="#d8d3c1" stroke-width="0.5" />`

  // Hint that the right-of-plot column is referenced — keeps tsc happy.
  void colW

  return [style, plotSvg, divider, rows.join(''), ordersCaption].join('')
}

/**
 * Back-card renderer for the special-function family.
 */
export const renderBack: BackRenderer = (primitive, ctx) => {
  const familyBlock = renderSpecialFunctionFamilyBlock(primitive)
  return { svg: renderBackSkeleton(buildBackParts(primitive, familyBlock, ctx)) }
}
