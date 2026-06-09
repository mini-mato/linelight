/**
 * Fire bus — a tiny event channel for "fire transition" pulses.
 *
 * The Cockpit's "fire" button emits a pulse. Spectrum Bar, Grotrian, and
 * Atom View subscribe and run their per-instrument animation when a pulse
 * arrives. Independent from the store so a fire doesn't mutate Selection.
 */

export type FireEvent = {
  /** monotonic counter; incremented on each emit */
  seq: number
  /** ms timestamp at emit */
  at: number
}

export type FireSubscriber = (event: FireEvent) => void

export type FireBus = {
  emit: () => FireEvent
  subscribe: (fn: FireSubscriber) => () => void
}

export function createFireBus(): FireBus {
  const subs = new Set<FireSubscriber>()
  let seq = 0
  return {
    emit: () => {
      seq += 1
      const event: FireEvent = { seq, at: Date.now() }
      for (const fn of subs) fn(event)
      return event
    },
    subscribe: (fn) => {
      subs.add(fn)
      return () => {
        subs.delete(fn)
      }
    },
  }
}

/**
 * The default singleton fire bus used by `main.ts` and instruments.
 * Tests may construct their own via `createFireBus()`.
 */
export const fireBus: FireBus = createFireBus()
