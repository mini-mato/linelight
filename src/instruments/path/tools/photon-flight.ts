/**
 * Photon flight — animated emission events along the spectrum strip.
 *
 * Called by step 5 (radiation). Each `emit()` launches a glowing dot from
 * an x-position above the spectrum strip; the dot falls into the spectrum
 * at the wavelength's spectral position, glows briefly, and fades.
 *
 * Closes the conceptual loop: orbital breathing → photon → spectrum line.
 */

const VISIBLE_NM_MIN = 380
const VISIBLE_NM_MAX = 750

function xPercentForWavelength(nm: number): number {
  // Map visible band [380, 750] nm to [0%, 100%] across the strip.
  const clamped = Math.max(VISIBLE_NM_MIN, Math.min(VISIBLE_NM_MAX, nm))
  return ((clamped - VISIBLE_NM_MIN) / (VISIBLE_NM_MAX - VISIBLE_NM_MIN)) * 100
}

export type PhotonFlight = {
  /** Launch a photon at wavelength `nm`. */
  emit: (nm: number) => void
  /** Stop emitting (used on step exit). */
  dispose: () => void
}

/**
 * Bind to the stage's spectrum strip. Each emit() injects a momentary marker
 * + a falling dot above the strip.
 */
export function createPhotonFlight(strip: HTMLDivElement): PhotonFlight {
  let disposed = false

  function emit(nm: number): void {
    if (disposed) return
    if (nm < VISIBLE_NM_MIN || nm > VISIBLE_NM_MAX) return
    const xPct = xPercentForWavelength(nm)

    // Falling dot — above the strip.
    const dot = document.createElement('div')
    dot.style.cssText = [
      'position: absolute',
      `left: calc(${xPct}% - 4px)`,
      'top: -22px',
      'width: 8px',
      'height: 8px',
      'border-radius: 50%',
      'background: #ffe066',
      'box-shadow: 0 0 12px 2px rgba(255, 224, 102, 0.8)',
      'pointer-events: none',
      'transition: top 600ms ease-in, opacity 200ms 600ms ease-out',
    ].join(';')
    strip.appendChild(dot)

    // Spectrum-line marker on the strip itself.
    const marker = document.createElement('div')
    marker.style.cssText = [
      'position: absolute',
      `left: calc(${xPct}% - 1px)`,
      'top: 0',
      'bottom: 0',
      'width: 2px',
      'background: rgba(255, 255, 255, 0.9)',
      'box-shadow: 0 0 6px 1px rgba(255, 255, 255, 0.7)',
      'pointer-events: none',
      'opacity: 0',
      'transition: opacity 200ms ease-in',
    ].join(';')
    strip.appendChild(marker)

    // Trigger the animation on next frame.
    requestAnimationFrame(() => {
      dot.style.top = '6px'
      requestAnimationFrame(() => {
        // Reveal the marker as the dot lands.
        setTimeout(() => {
          if (!disposed) marker.style.opacity = '1'
        }, 500)
      })
    })

    // Fade and remove the dot + marker.
    setTimeout(() => {
      dot.style.opacity = '0'
    }, 700)
    setTimeout(() => {
      dot.remove()
    }, 1100)
    setTimeout(() => {
      marker.style.opacity = '0'
    }, 1800)
    setTimeout(() => {
      marker.remove()
    }, 2300)
  }

  return {
    emit,
    dispose(): void {
      disposed = true
    },
  }
}
