/**
 * Cockpit — pure derivation helpers.
 *
 * No DOM, no store. These functions take Selection-like inputs and return
 * derived numerical / structural facts (photon λ, ν, fidelity classification,
 * line-data lookup) that the renderer turns into rows of text.
 *
 * The fidelity classification is the heart of the cockpit's value-add: it
 * answers, for the active selection, "what is exact, what is measured, what
 * is schematic?" — see the audit at
 *   kb/linelight/wiki/audits/2026-05-03-go-live-product-coherence-audit.md
 * Recommended Next 3 Work Items §1.
 */

import type { ElementSymbol, LineSelection, Selection, TermState } from '../../types'
import { elements, linesForElement } from '../../data'
import type { EmissionLine } from '../../data/types'

/** Photon-energy → wavelength conversion constant (eV·nm). */
export const HC_EV_NM = 1239.842

/** 1 eV in joules. */
export const EV_TO_J = 1.602176634e-19

/** Speed of light in vacuum (m/s, exact by SI definition). */
export const C_M_PER_S = 2.99792458e8

/** ΔE for a transition: |E_upper − E_lower|, eV. */
export function deltaE_eV(upper: TermState, lower: TermState): number {
  return Math.abs(upper.energy_eV - lower.energy_eV)
}

/** Photon vacuum wavelength (nm) from ΔE in eV. ∞ when ΔE → 0. */
export function photonWavelength_nm(dE_eV: number): number {
  if (dE_eV === 0) return Infinity
  return HC_EV_NM / dE_eV
}

/** Photon frequency (Hz) from photon wavelength (nm). 0 when λ → ∞. */
export function photonFrequency_Hz(lambda_nm: number): number {
  if (!Number.isFinite(lambda_nm) || lambda_nm === 0) return 0
  // λ in m: lambda_nm * 1e-9
  return C_M_PER_S / (lambda_nm * 1e-9)
}

/** Convert eV → joules (sign-preserving). */
export function eV_to_J(eV: number): number {
  return eV * EV_TO_J
}

/** Look up the EmissionLine record for a LineSelection (matches by element + wavelength). */
export function emissionLineFor(line: LineSelection | null): EmissionLine | null {
  if (!line) return null
  const lines = linesForElement(line.element)
  return lines.find((l) => l.wavelength_nm === line.wavelength_nm) ?? null
}

/** Element name lookup; returns null if symbol is outside the v1 registry. */
export function elementName(symbol: ElementSymbol): string | null {
  if (symbol in elements) return elements[symbol as keyof typeof elements].name
  return null
}

/* --------------------------------------------------------------------- */
/* Fidelity classification                                                */
/* --------------------------------------------------------------------- */

export type FidelityKind = 'exact' | 'schematic' | 'measured'

export type FidelityRow = {
  /** Marker class on the leading dot. */
  kind: FidelityKind
  /** "wavefunctions:" or "energies:" or "wavelength:" or "approximations active:". */
  label: string
  /** The descriptor (e.g. "hydrogenic exact (closed-form ψ_nlm, Z=1)"). */
  detail: string
}

export type FidelityReport = {
  /** Top-line classification, drives the leading pill on the panel. */
  topKind: FidelityKind
  rows: readonly FidelityRow[]
}

/**
 * Classify the fidelity of the active selection.
 *
 * Branches:
 *   • H without selection.line       → hydrogenic-exact (closed-form ψ, Z=1).
 *   • H with selection.line          → hydrogenic-exact + wavelength-from-data
 *                                      (NIST-ASD provenance) + Edlén-deferred note.
 *   • multi-electron without line    → schematic Slater-screened wavefunctions,
 *                                      energies-from-line-data, multi-electron tooltip.
 *   • multi-electron with ionized    → hydrogenic-exact at Z = bare nuclear charge
 *                                      (the line's series flips us back into the
 *                                      one-electron regime).
 *   • multi-electron with line       → measured (energies/wavelength from NIST line
 *                                      data) + schematic wavefunctions.
 *
 * The function is total — it returns a sensible report for every legal
 * Selection, including elements outside the registered v1 set.
 */
export function classifyFidelity(selection: Selection): FidelityReport {
  const { element, line } = selection

  // Hydrogen branch.
  if (element === 'H') {
    if (line && line.element === 'H') {
      return {
        topKind: 'exact',
        rows: [
          {
            kind: 'exact',
            label: 'wavefunctions',
            detail: 'hydrogenic exact (closed-form ψ_nlm, Z=1)',
          },
          {
            kind: 'exact',
            label: 'energies',
            detail: 'closed-form −13.6058 eV / n²',
          },
          {
            kind: 'measured',
            label: 'wavelength',
            detail: 'from data/elements/H.ts (NIST-ASD provenance)',
          },
          {
            kind: 'schematic',
            label: 'approximations active',
            detail: 'vacuum=air (Edlén deferred)',
          },
        ],
      }
    }
    return {
      topKind: 'exact',
      rows: [
        {
          kind: 'exact',
          label: 'wavefunctions',
          detail: 'hydrogenic exact (closed-form ψ_nlm, Z=1)',
        },
        {
          kind: 'exact',
          label: 'energies',
          detail: 'closed-form −13.6058 eV / n²',
        },
        {
          kind: 'schematic',
          label: 'approximations active',
          detail: 'vacuum=air (Edlén deferred)',
        },
      ],
    }
  }

  // Multi-electron + ionized series → one-electron regime, exact again.
  // `LineSelection` doesn't carry `series`; look it up from the data record.
  const lineRecord = line ? emissionLineFor(line) : null
  const isIonized = lineRecord?.series === 'ionized'
  if (line && isIonized) {
    const reg = elements[element as keyof typeof elements]
    const Z = reg && typeof reg.z === 'number' ? reg.z : null
    const Zlabel = Z !== null ? `Z=${Z}` : 'Z = bare nuclear charge'
    return {
      topKind: 'exact',
      rows: [
        {
          kind: 'exact',
          label: 'wavefunctions',
          detail: `hydrogenic exact, ${Zlabel} (ionized series)`,
        },
        {
          kind: 'measured',
          label: 'energies',
          detail: 'from line data',
        },
        {
          kind: 'schematic',
          label: 'approximations active',
          detail: 'vacuum=air (Edlén deferred)',
        },
      ],
    }
  }

  // Multi-electron with a non-ionized line: measured energies, schematic ψ.
  if (line) {
    return {
      topKind: 'schematic',
      rows: [
        {
          kind: 'schematic',
          label: 'wavefunctions',
          detail: 'schematic (Slater-screened hydrogenic, effective Z=Z_eff)',
        },
        {
          kind: 'measured',
          label: 'energies',
          detail: 'from line data (NIST-ASD provenance)',
        },
        {
          kind: 'schematic',
          label: 'approximations active',
          detail: 'multi-electron orbital shape, vacuum=air',
        },
      ],
    }
  }

  // Multi-electron without a line.
  return {
    topKind: 'schematic',
    rows: [
      {
        kind: 'schematic',
        label: 'wavefunctions',
        detail: 'schematic (Slater-screened hydrogenic, effective Z=Z_eff)',
      },
      {
        kind: 'schematic',
        label: 'energies',
        detail: 'from line data, approximate',
      },
      {
        kind: 'schematic',
        label: 'approximations active',
        detail: 'multi-electron orbital shape, vacuum=air',
      },
    ],
  }
}
