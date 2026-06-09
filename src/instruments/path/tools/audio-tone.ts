/**
 * Audio tone — plays a sine at the display-scaled ω₂₁.
 *
 * Single global instance; toggled from the top bar. Different transitions
 * emit different pitches. Each step opts in by calling `setAudioFrequency`
 * with the current display ω; calling with 0 silences.
 */

let ctx: AudioContext | null = null
let osc: OscillatorNode | null = null
let gain: GainNode | null = null
let enabled = false

function ensureContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor =
    typeof window !== 'undefined' &&
    ((window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  if (!Ctor) return null
  try {
    ctx = new Ctor()
    return ctx
  } catch {
    return null
  }
}

function startOsc(freq: number): void {
  const c = ensureContext()
  if (!c) return
  if (osc) {
    osc.frequency.setTargetAtTime(freq, c.currentTime, 0.02)
    return
  }
  osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain = c.createGain()
  gain.gain.value = 0
  osc.connect(gain).connect(c.destination)
  osc.start()
  // Soft fade-in to avoid clicks.
  gain.gain.setTargetAtTime(0.05, c.currentTime, 0.08)
}

function stopOsc(): void {
  if (!ctx || !osc || !gain) return
  gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
  // Allow fade-out to complete before disposing.
  const oldOsc = osc
  const oldGain = gain
  osc = null
  gain = null
  setTimeout(() => {
    try {
      oldOsc.stop()
      oldOsc.disconnect()
      oldGain.disconnect()
    } catch {
      // ignore
    }
  }, 300)
}

/** User toggle from the top bar. Wakes/resumes the AudioContext on first enable. */
export function setAudioEnabled(on: boolean): void {
  enabled = on
  if (!on) {
    stopOsc()
    return
  }
  const c = ensureContext()
  if (!c) return
  // Resume context if it was created in suspended state (autoplay policy).
  if (c.state === 'suspended') void c.resume()
}

export function isAudioEnabled(): boolean {
  return enabled
}

/**
 * Set the live display frequency in Hz. Pass `0` (or a negative) to silence.
 * Frequency is clamped to the human-audible band so display-scaled ω stays
 * pleasant.
 */
export function setAudioFrequency(hz: number): void {
  if (!enabled) {
    stopOsc()
    return
  }
  if (!Number.isFinite(hz) || hz <= 0) {
    stopOsc()
    return
  }
  // Clamp to a comfortable audio range. Optical-scaled frequencies are
  // typically a few Hz; we lift them into a musical range.
  let f = hz
  while (f < 110) f *= 2
  while (f > 1760) f /= 2
  startOsc(f)
}

/** Force-stop and dispose the audio context (used on hard teardown). */
export function disposeAudio(): void {
  stopOsc()
  if (ctx) {
    try {
      void ctx.close()
    } catch {
      // ignore
    }
    ctx = null
  }
  enabled = false
}
