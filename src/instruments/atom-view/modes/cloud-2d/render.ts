/**
 * Paint a sampled ψ field to a Canvas2D context.
 *
 * Pipeline:
 *   1. Build an ImageData of size pixelsW × pixelsH whose pixels are the
 *      signed-thermal colormap of (sample / peak).
 *   2. putImageData onto the canvas at (0, 0).
 *   3. Overlay 1-px crosshair axes and a subtle ring at r = halfExtent.
 *
 * Caller is responsible for sizing the canvas backing-store to a
 * devicePixelRatio multiple of CSS px and scaling the ImageData accordingly.
 * For simplicity here the renderer expects the field's pixelsW/pixelsH to
 * already match the canvas backing-store dimensions; CSS px-to-DPR scaling
 * happens at mount time.
 */

import type { FieldSample } from './field'
import { signedThermal } from './colormap'

export type RenderOptions = {
  /** Whether to draw crisp 1-pixel axes (x=0 and z=0 lines). Default: true. */
  drawAxes?: boolean
  /** Whether to draw the box-extent ring at r = halfExtent. Default: true. */
  drawRing?: boolean
  /** Colors for axis and ring overlays. Defaults are subtle gray. */
  axisColor?: string
  ringColor?: string
}

/**
 * Render the field into the given context. The context's canvas dimensions
 * (.width / .height in device pixels) must match `field.pixelsW`/`pixelsH`.
 */
export function renderField(
  ctx: CanvasRenderingContext2D,
  field: FieldSample,
  options: RenderOptions = {},
): void {
  const { drawAxes = true, drawRing = true, axisColor = '#bdbdbd', ringColor = '#dcdcdc' } = options
  const { data, peak, pixelsW, pixelsH } = field
  const canvas = ctx.canvas
  if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
    throw new Error(
      `renderField: canvas backing-store ${canvas.width}×${canvas.height} ≠ field ${pixelsW}×${pixelsH}`,
    )
  }

  const image = ctx.createImageData(pixelsW, pixelsH)
  const out = image.data
  // If peak is zero (degenerate / vanishing ψ), fill with white.
  const inv = peak > 0 ? 1 / peak : 0

  for (let idx = 0, p = 0; idx < data.length; idx++, p += 4) {
    const t = data[idx] * inv
    const c = signedThermal(t)
    out[p] = c.r
    out[p + 1] = c.g
    out[p + 2] = c.b
    out[p + 3] = c.a
  }
  ctx.putImageData(image, 0, 0)

  if (drawAxes) {
    ctx.save()
    ctx.strokeStyle = axisColor
    ctx.lineWidth = 1
    // Crisp 1-px lines: align to pixel centers (×.5)
    const cx = Math.floor(pixelsW / 2) + 0.5
    const cy = Math.floor(pixelsH / 2) + 0.5
    ctx.beginPath()
    ctx.moveTo(0, cy)
    ctx.lineTo(pixelsW, cy)
    ctx.moveTo(cx, 0)
    ctx.lineTo(cx, pixelsH)
    ctx.stroke()
    ctx.restore()
  }

  if (drawRing) {
    ctx.save()
    ctx.strokeStyle = ringColor
    ctx.lineWidth = 1
    const cx = pixelsW / 2
    const cy = pixelsH / 2
    // Ring radius matches the box half-extent in pixel units, which is just
    // half the smaller image dimension (the field maps [-h,+h] to [0, pixels]).
    const radius = Math.min(pixelsW, pixelsH) / 2 - 0.5
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}
