/**
 * Atlas-app seed bundle — the JSON the v4 app reads at runtime.
 *
 * Shape is deliberately separate from the v3 build's manifest because the
 * app needs per-card render output (front/back SVG inlined) plus enough
 * physics-relevant metadata to drive the 4D spectral-line animation
 * without re-running the renderers in the browser. The static v3 build
 * still emits its own files unchanged; this seed is consumed only by the
 * `dist/atlas-app/` bundle.
 *
 * All physics math lives in `src/physics/atomic/`. This module only
 * passes structural data through; nothing here invents a number.
 */

import type { PrimitiveFamily } from '../atlas/types.js'

/** A single transition state participating in a spectral-line animation. */
export type AnimState = {
  /** Principal quantum number. */
  n: number
  /** Orbital angular momentum quantum number (s=0, p=1, ...). */
  l: number
  /** Magnetic quantum number used for the slice (representative). */
  m: number
  /** Spectroscopic label, e.g. "3p" or "2s". */
  label: string
}

/** Per-card payload — driven by the family-specific SVG renderers. */
export type AppCard = {
  id: string
  family: PrimitiveFamily
  name: string
  symbol?: string
  /** Inline SVG string for the front face. */
  frontSvg: string
  /** Inline SVG string for the back face (static fallback when no live anim). */
  backSvg: string
  /** Section number (1-based) of the family this card belongs to. */
  sectionNumber: number
  /** Act number (1-based). */
  actNumber: number
  sourceLabel?: string
  retrievedAt?: string

  /**
   * Optional 4D-animation payload — present for spectral-line cards whose
   * transition resolves to a closed-form hydrogenic pair, or for
   * multi-electron lines that should fall back to a schematic interp.
   */
  animation?:
    | {
        kind: 'hydrogen-orbital-pair'
        /** Bare-Z used for ψ sampling (Z=1 for hydrogen, Z=2 for He II). */
        Z: number
        upper: AnimState
        lower: AnimState
        /** Branch resolution notes for the caption — e.g. "3p → 2s (E1 representative branch of n=3 → 2)". */
        branchLabel: string
        /** ω_fi in rad/s (computed from level energies via physics module). */
        omegaFi: number
        /** λ in nm (from the line's wavelengthVacuumNm). */
        lambdaNm: number
        /** Frequency ν in Hz (c/λ). */
        nuHz: number
      }
    | {
        kind: 'schematic-interp'
        upperLabel: string
        lowerLabel: string
        omegaFi: number
        lambdaNm: number
        nuHz: number
      }
}

/** A family section inside an act (title-bar context). */
export type AppFamilySection = {
  family: PrimitiveFamily
  sectionNumber: number
  title: string
  intro: string
  cardIds: string[]
}

/** One act in the seed. */
export type AppAct = {
  actNumber: number
  title: string
  subtitle: string
  intro: string
  families: AppFamilySection[]
}

/** Top-level seed shape. */
export type AppSeed = {
  schemaVersion: string
  generatedAt: string
  gitRev: string
  title: string
  subtitle: string
  intro: string
  closing?: { title: string; intro: string }
  acts: AppAct[]
  /** Flat lookup keyed by primitive id. Order is unspecified. */
  cards: Record<string, AppCard>
}
