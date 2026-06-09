/**
 * Pole physics for the propagator view.
 *
 * An emission line appears as a pole in the complex frequency plane:
 *   Re ω = 2πc/λ              (transition frequency)
 *   Im ω = −(Γ_natural + Γ_pressure) / 2   (half total linewidth)
 *
 * Zeeman splitting (schematic): each line splits into two poles at
 *   ω± = ω₀ ± ½ g_J μ_B B / ħ   (g_J = 1, schematic)
 *
 * Pressure broadening (schematic):
 *   Γ_pressure = γ_coll × n = γ_coll × P / (k_B T)
 *
 * Natural linewidth (exact for H, n ≤ 7):
 *   Γ_natural = A_einstein (computed from 48³ dipole grid)
 *
 * Fidelity:
 *   'exact'    — hydrogen, n ≤ 7, A coefficient from grid (non-null, >0)
 *   'schematic' — everything else, or when B > 0 (Zeeman g_J is schematic)
 */

import type { EmissionLine } from '../../data/types'
import type { Conditions } from '../../types'
import { einsteinA, naturalLinewidth_rad_per_s } from '../../physics/atomic/einstein'

const TWO_PI_C = 2 * Math.PI * 299792458
const K_B = 1.380649e-23
const MU_B = 9.2740100657e-24
const HBAR = 1.0545718176461565e-34

const SCHEMATIC_GAMMA = 1e8
const GAMMA_COLL = 1e-15
const MAX_EINSTEIN_N = 7
const G_J_SCHEMATIC = 1.0

export type PoleInput = {
  line: EmissionLine
  conditions: Conditions
}

export type Pole = {
  /** Transition angular frequency ω₀ (or Zeeman-shifted ω±) in rad/s. */
  reOmega_rad_per_s: number
  /** Im ω = −(Γ_natural + Γ_pressure)/2, always ≤ 0. */
  imOmega_rad_per_s: number
  /** Short display label (parent line label + Zeeman suffix if split). */
  label: string
  /** Zeeman sublevel label e.g. "mⱼ = +½ (schematic g_J)". Undefined for B=0. */
  subLabel?: string
  parent: EmissionLine
  fidelity: 'exact' | 'schematic'
  gamma_natural_rad_per_s: number
  gamma_pressure_rad_per_s: number
}

/**
 * Compute poles for a single emission line under the given conditions.
 *
 * B = 0 → one pole at ω₀.
 * B > 0 → two schematic Zeeman poles at ω₀ ± Δω.
 */
export function computePoles(input: PoleInput): Pole[] {
  const { line, conditions } = input
  const { bField_T, pressure_Pa, temperature_K } = conditions

  const omega0 = TWO_PI_C / (line.wavelength_nm * 1e-9)
  if (omega0 < 1e11) return []

  let gamma_natural = SCHEMATIC_GAMMA
  let fidelity: 'exact' | 'schematic' = 'schematic'

  const isHydrogen = line.element === 'H'
  const upperN = line.upper
  const lowerN = line.lower
  const canCompute =
    isHydrogen &&
    typeof upperN === 'number' &&
    typeof lowerN === 'number' &&
    upperN <= MAX_EINSTEIN_N &&
    lowerN <= MAX_EINSTEIN_N

  if (canCompute) {
    const A = einsteinA(
      { n: upperN as number, l: 1, m: 0 },
      { n: lowerN as number, l: 0, m: 0 },
      omega0,
    )
    if (A !== null && A > 0) {
      gamma_natural = naturalLinewidth_rad_per_s(A)
      fidelity = 'exact'
    }
  }

  const T = temperature_K > 0 ? temperature_K : 300
  const gamma_pressure = (GAMMA_COLL * pressure_Pa) / (K_B * T)

  const imOmega = -(gamma_natural + gamma_pressure) / 2

  if (bField_T !== 0) {
    const deltaOmega = (0.5 * G_J_SCHEMATIC * MU_B * Math.abs(bField_T)) / HBAR

    return [
      {
        reOmega_rad_per_s: omega0 + deltaOmega,
        imOmega_rad_per_s: imOmega,
        label: line.label,
        subLabel: 'mⱼ = +½ (schematic g_J)',
        parent: line,
        fidelity: 'schematic',
        gamma_natural_rad_per_s: gamma_natural,
        gamma_pressure_rad_per_s: gamma_pressure,
      },
      {
        reOmega_rad_per_s: omega0 - deltaOmega,
        imOmega_rad_per_s: imOmega,
        label: line.label,
        subLabel: 'mⱼ = −½ (schematic g_J)',
        parent: line,
        fidelity: 'schematic',
        gamma_natural_rad_per_s: gamma_natural,
        gamma_pressure_rad_per_s: gamma_pressure,
      },
    ]
  }

  return [
    {
      reOmega_rad_per_s: omega0,
      imOmega_rad_per_s: imOmega,
      label: line.label,
      parent: line,
      fidelity,
      gamma_natural_rad_per_s: gamma_natural,
      gamma_pressure_rad_per_s: gamma_pressure,
    },
  ]
}
