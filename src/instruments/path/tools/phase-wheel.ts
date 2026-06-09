/**
 * Phase wheel — a small SVG unit-circle in the corner of the 3D viewport.
 *
 * A hand rotates at ω_display, making the abstract phase factor `e^(−iωt)`
 * concrete and visually tied to the breathing orbital next to it.
 *
 * Lifetime: created by a step's `enter()`, mounted into the stage's
 * `toolsDock` HTML region, ticked from the same rAF loop, removed when
 * the step exits (the stage clears `toolsDock` on step change).
 */

const SIZE = 64
const CX = SIZE / 2
const CY = SIZE / 2
const R = SIZE / 2 - 6
const SVG_NS = 'http://www.w3.org/2000/svg'

export type PhaseWheel = {
  el: SVGSVGElement
  /** Set the angle in radians. 0 = right, π/2 = up. */
  setAngle: (theta: number) => void
}

/**
 * Build a phase-wheel widget. Caller appends `wheel.el` to the tools dock
 * and calls `setAngle(ω·t)` each tick.
 */
export function createPhaseWheel(): PhaseWheel {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('width', String(SIZE))
  svg.setAttribute('height', String(SIZE))
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`)
  svg.setAttribute('aria-label', 'Phase wheel — rotating phase factor exp(-iωt)')
  svg.style.cssText = [
    'background: rgba(20, 20, 20, 0.65)',
    'border: 1px solid rgba(255, 224, 102, 0.4)',
    'border-radius: 4px',
    'backdrop-filter: blur(4px)',
  ].join(';')

  // Outer circle.
  const circle = document.createElementNS(SVG_NS, 'circle')
  circle.setAttribute('cx', String(CX))
  circle.setAttribute('cy', String(CY))
  circle.setAttribute('r', String(R))
  circle.setAttribute('fill', 'none')
  circle.setAttribute('stroke', 'rgba(255, 224, 102, 0.6)')
  circle.setAttribute('stroke-width', '1')
  svg.appendChild(circle)

  // Tick marks at 0, π/2, π, 3π/2.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    const x1 = CX + Math.cos(a) * (R - 3)
    const y1 = CY - Math.sin(a) * (R - 3)
    const x2 = CX + Math.cos(a) * R
    const y2 = CY - Math.sin(a) * R
    const tick = document.createElementNS(SVG_NS, 'line')
    tick.setAttribute('x1', String(x1))
    tick.setAttribute('y1', String(y1))
    tick.setAttribute('x2', String(x2))
    tick.setAttribute('y2', String(y2))
    tick.setAttribute('stroke', 'rgba(255, 224, 102, 0.5)')
    tick.setAttribute('stroke-width', '1')
    svg.appendChild(tick)
  }

  // Re-axis label.
  const reLabel = document.createElementNS(SVG_NS, 'text')
  reLabel.setAttribute('x', String(SIZE - 8))
  reLabel.setAttribute('y', String(CY + 4))
  reLabel.setAttribute('text-anchor', 'end')
  reLabel.setAttribute('font-family', "'JetBrains Mono', monospace")
  reLabel.setAttribute('font-size', '7')
  reLabel.setAttribute('fill', 'rgba(255, 224, 102, 0.7)')
  reLabel.textContent = 'Re'
  svg.appendChild(reLabel)

  // Center dot.
  const center = document.createElementNS(SVG_NS, 'circle')
  center.setAttribute('cx', String(CX))
  center.setAttribute('cy', String(CY))
  center.setAttribute('r', '1.5')
  center.setAttribute('fill', 'rgba(255, 224, 102, 0.9)')
  svg.appendChild(center)

  // Rotating hand.
  const hand = document.createElementNS(SVG_NS, 'line')
  hand.setAttribute('x1', String(CX))
  hand.setAttribute('y1', String(CY))
  hand.setAttribute('x2', String(CX + R))
  hand.setAttribute('y2', String(CY))
  hand.setAttribute('stroke', '#ffe066')
  hand.setAttribute('stroke-width', '1.8')
  hand.setAttribute('stroke-linecap', 'round')
  svg.appendChild(hand)

  // Hand tip dot.
  const tip = document.createElementNS(SVG_NS, 'circle')
  tip.setAttribute('cx', String(CX + R))
  tip.setAttribute('cy', String(CY))
  tip.setAttribute('r', '2.8')
  tip.setAttribute('fill', '#ffe066')
  svg.appendChild(tip)

  function setAngle(theta: number): void {
    // Convention: in physics, e^(-iωt) rotates clockwise. SVG y is flipped,
    // so a positive sine should rotate counterclockwise visually if we
    // negate. We want the user to SEE the rotation; either direction is fine
    // as long as it's monotonic.
    const x = CX + Math.cos(theta) * R
    const y = CY - Math.sin(theta) * R
    hand.setAttribute('x2', String(x))
    hand.setAttribute('y2', String(y))
    tip.setAttribute('cx', String(x))
    tip.setAttribute('cy', String(y))
  }

  return { el: svg, setAngle }
}
