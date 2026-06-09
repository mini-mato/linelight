/**
 * Step 11 — The frontier.
 *
 * Same complex frequency plane, with annotation overlays for the regions
 * where current QED is open or contested. Toggle through:
 *
 *   0. Lamb shift — radiative correction to Re ω from vacuum fluctuations
 *   1. Proton-radius puzzle — residual e/μ discrepancy as a Re-ω band
 *   2. g-2 anomaly — muon magnetic-moment tension w/ Standard Model
 *   3. Schwinger limit — non-perturbative regime at extreme field strength
 *
 * Each annotation tags a region of the plane with a `(frontier)` fidelity
 * label, a short prose explanation, and an HTML-styled callout.
 */

import type { Step, StepHandle } from '../types'

const W = 640
const H = 220
const PAD = 28

type Annotation = {
  title: string
  brief: string
  /** Region to highlight: bounding box in (Re ω, Im ω) display units. */
  region: { reMin: number; reMax: number; imMin: number; imMax: number }
  color: string
}

const OMEGA0_DISPLAY = 18

const ANNOTATIONS: readonly Annotation[] = [
  {
    title: 'Lamb shift',
    brief:
      'Vacuum-fluctuation correction to Re ω. Theory and experiment agree at the ~10⁻¹² level for hydrogen — and disagree by a tiny but real amount once you bring in the proton radius. Discovered 1947 (Lamb–Retherford), founding observation of QED.',
    region: { reMin: OMEGA0_DISPLAY - 0.4, reMax: OMEGA0_DISPLAY + 0.4, imMin: -1, imMax: 0 },
    color: 'rgba(120, 200, 120, 0.35)',
  },
  {
    title: 'Proton-radius residual',
    brief:
      'Muonic vs. electronic hydrogen Lamb-shift measurements disagreed by ~7σ for a decade. Post-2018 measurements largely converged on r_p ≈ 0.84 fm, but residual ~1–2σ tensions remain. New physics or experimental systematics?',
    region: { reMin: OMEGA0_DISPLAY - 0.15, reMax: OMEGA0_DISPLAY + 0.15, imMin: -0.3, imMax: 0 },
    color: 'rgba(255, 160, 80, 0.35)',
  },
  {
    title: 'Muon g − 2',
    brief:
      'Spectrum of a single Landau level. Fermilab measures 4.2σ above the Standard Model — but BMW lattice calculation (2021, 2024) softens the tension, and CMD-3 e⁺e⁻ → ππ data deepens it. Theory–experiment status as of 2025: unresolved.',
    region: { reMin: OMEGA0_DISPLAY + 3, reMax: OMEGA0_DISPLAY + 5, imMin: -2, imMax: 0 },
    color: 'rgba(180, 120, 240, 0.35)',
  },
  {
    title: 'Schwinger pair production',
    brief:
      'At E_c ≈ 1.3 × 10¹⁸ V/m the vacuum becomes nonlinear: photons scatter off photons, the vacuum becomes birefringent, and electron-positron pairs nucleate. IXPE 2022 saw evidence in magnetar fields; direct Schwinger-rate measurement: never.',
    region: { reMin: OMEGA0_DISPLAY - 6, reMax: OMEGA0_DISPLAY - 3, imMin: -3, imMax: -1 },
    color: 'rgba(80, 160, 240, 0.35)',
  },
]

export const step11Frontier: Step = {
  id: 11,
  title: 'The frontier',
  claim: 'Where current QED stops, and where new physics could enter.',
  caption:
    'The same complex frequency plane, with overlays where the theory has open questions. Slide the knob to cycle through four frontier regions: the Lamb shift, the proton-radius residual, the muon <em>g</em>−2 anomaly, and the Schwinger limit. Each tag the same plane with a "(frontier)" fidelity label. Every spectroscopy experiment at the 10⁻¹⁸ level is now a sensor for physics beyond the Standard Model.',
  math: '',
  enter(ctx): StepHandle {
    ctx.setAux2DVisible(true)
    ctx.setKnobConfig({
      label: 'Frontier annotation',
      min: 0,
      max: ANNOTATIONS.length - 1,
      step: 1,
      default: 0,
      format: (v) => ANNOTATIONS[Math.round(v)].title,
    })

    function draw(idx: number): void {
      const c = ctx.aux2D.getContext('2d')
      if (!c) return
      c.fillStyle = '#fafafa'
      c.fillRect(0, 0, W, H)

      const omegaMin = OMEGA0_DISPLAY - 7
      const omegaMax = OMEGA0_DISPLAY + 7
      const imRange = 4
      const realY = 70

      function xOf(omega: number): number {
        return PAD + ((omega - omegaMin) / (omegaMax - omegaMin)) * (W - 2 * PAD)
      }
      function yOf(imOmega: number): number {
        return realY + (-imOmega / imRange) * (H - realY - PAD)
      }

      // Real axis.
      c.strokeStyle = '#999'
      c.lineWidth = 0.5
      c.beginPath()
      c.moveTo(PAD, realY)
      c.lineTo(W - PAD, realY)
      c.stroke()
      c.fillStyle = '#666'
      c.font = "10px 'JetBrains Mono', monospace"
      c.fillText('Re ω →', W - PAD - 50, realY - 6)
      c.fillText('Im ω ↓', PAD + 6, H - 8)

      // All frontier regions, but only the selected one is opaque.
      const selectedIdx = Math.max(0, Math.min(ANNOTATIONS.length - 1, Math.round(idx)))
      for (let i = 0; i < ANNOTATIONS.length; i++) {
        const a = ANNOTATIONS[i]
        const x0 = xOf(a.region.reMin)
        const x1 = xOf(a.region.reMax)
        const y0 = yOf(a.region.imMax)
        const y1 = yOf(a.region.imMin)
        c.fillStyle = i === selectedIdx ? a.color : a.color.replace(/0\.35/, '0.1')
        c.fillRect(x0, y0, x1 - x0, y1 - y0)
        c.strokeStyle = i === selectedIdx ? '#0a0a0a' : 'rgba(0,0,0,0.2)'
        c.lineWidth = i === selectedIdx ? 1 : 0.5
        c.strokeRect(x0, y0, x1 - x0, y1 - y0)

        c.fillStyle = i === selectedIdx ? '#0a0a0a' : 'rgba(0,0,0,0.4)'
        c.font =
          i === selectedIdx ? "11px 'JetBrains Mono', monospace" : "9px 'JetBrains Mono', monospace"
        c.fillText(a.title, x0 + 4, y0 - 4)
      }

      // Reference pole.
      c.setLineDash([3, 3])
      c.strokeStyle = 'rgba(255, 80, 80, 0.6)'
      c.lineWidth = 0.8
      const px = xOf(OMEGA0_DISPLAY)
      const py = yOf(-0.4)
      c.beginPath()
      c.moveTo(px, realY)
      c.lineTo(px, py)
      c.stroke()
      c.setLineDash([])
      c.fillStyle = '#ff5050'
      c.beginPath()
      c.arc(px, py, 5, 0, 2 * Math.PI)
      c.fill()
      c.strokeStyle = '#0a0a0a'
      c.lineWidth = 1
      c.stroke()

      const sel = ANNOTATIONS[selectedIdx]
      ctx.setMath(
        [`<strong style="color:#ffe066;">(frontier) ${sel.title}</strong>`, ``, sel.brief].join(
          '\n',
        ),
      )
    }

    draw(ctx.getKnob())

    return {
      onKnob(v: number): void {
        draw(v)
      },
      exit(): void {
        ctx.setAux2DVisible(false)
      },
    }
  },
}
