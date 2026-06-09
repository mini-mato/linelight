/**
 * Volumetric signed-thermal colormap and front-to-back compositor.
 *
 * Same convention as the 2D xz-slice (see `cloud-2d/colormap.ts`):
 *   • +ψ → red emission   (POS_COLOR)
 *   • −ψ → blue emission  (NEG_COLOR)
 *   • |ψ| → brightness via gamma curve (ALPHA_GAMMA = 0.7)
 *
 * The 3D volumetric path differs from the 2D slice path in how amplitude maps
 * to opacity. In 2D we paint a single pixel; in 3D we composite N steps of a
 * march, so each step contributes a small alpha. The brightness curve is
 *
 *     stepAlpha = pow(|ψ| / peakAbs, ALPHA_GAMMA) * DENSITY_SCALE
 *
 * with DENSITY_SCALE chosen so a fully-saturated lobe accumulates to ~unity
 * over a typical march (~60 active steps).
 *
 * `compositeAlongRay` mirrors the GLSL shader exactly so we can unit-test
 * the color logic without a WebGL context. Sampling pattern is "front-to-back
 * over-operator" with early-out at α ≥ 0.95.
 */

export const ALPHA_GAMMA = 0.7
export const DENSITY_SCALE = 0.04
export const EARLY_OUT_ALPHA = 0.95

/** Red — the +ψ endpoint. Tuned to feel bright on dark backgrounds. */
export const POS_COLOR = { r: 1.0, g: 0.18, b: 0.32 } as const
/** Blue — the −ψ endpoint. */
export const NEG_COLOR = { r: 0.18, g: 0.5, b: 1.0 } as const

export type RGBA = { r: number; g: number; b: number; a: number }

/**
 * Compute the per-step volumetric color contribution for a single signed
 * sample. Returns linear-RGB premultiplied by alpha — i.e. (r*α, g*α, b*α, α).
 *
 * `psiSample` is the signed amplitude as stored in the 3D grid.
 * `peakAbs` is the per-state max |ψ| precomputed at grid build time.
 */
export function stepColor(psiSample: number, peakAbs: number): RGBA {
  if (!Number.isFinite(psiSample) || peakAbs <= 0) {
    return { r: 0, g: 0, b: 0, a: 0 }
  }
  const t = Math.max(-1, Math.min(1, psiSample / peakAbs))
  const mag = Math.pow(Math.abs(t), ALPHA_GAMMA)
  const alpha = mag * DENSITY_SCALE
  const c = t >= 0 ? POS_COLOR : NEG_COLOR
  return { r: c.r * alpha, g: c.g * alpha, b: c.b * alpha, a: alpha }
}

/**
 * Composite an array of signed ψ samples (in march order, front to back)
 * into a final RGBA pixel using the over-operator with early-out at
 * α ≥ EARLY_OUT_ALPHA.
 *
 * Returns the accumulator (r, g, b, a all in [0, 1]).
 */
export function compositeAlongRay(samples: ArrayLike<number>, peakAbs: number): RGBA {
  let r = 0
  let g = 0
  let b = 0
  let a = 0
  for (let i = 0; i < samples.length; i++) {
    const step = stepColor(samples[i], peakAbs)
    const inv = 1 - a
    r += step.r * inv
    g += step.g * inv
    b += step.b * inv
    a += step.a * inv
    if (a >= EARLY_OUT_ALPHA) break
  }
  return { r, g, b, a }
}
