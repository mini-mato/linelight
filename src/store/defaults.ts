import { hydrogenAlphaSelection } from '../selection/h-alpha'
import type { State } from '../types'

const hAlpha = hydrogenAlphaSelection()

export const defaultState: State = {
  selection: {
    element: hAlpha.element,
    upper: hAlpha.upper,
    lower: hAlpha.lower,
    line: hAlpha.line,
  },
  conditions: {
    temperature_K: 300,
    pressure_Pa: 101325,
    numberDensity_per_m3: 2.5e25,
    bField_T: 0,
    eField_V_per_m: 0,
    bulkVelocity_m_per_s: 0,
    gravitationalPotential_J_per_kg: 0,
  },
  display: {
    visibleInstruments: new Set(['atom-view', 'grotrian', 'spectrum-bar']),
    layout: 'grid-2x2',
    modes: {
      colorPipeline: 'cie1931',
      wavelengthFrame: 'vacuum',
      energyUnit: 'eV',
      spectrumScale: 'linear',
      fidelityLabel: 'always',
    },
    atomView: {
      mode: 'superposition',
      activePane: 'upper',
      slicePlane: 'xz',
      upperM: 0,
      lowerM: 0,
      isoThreshold: 0.2,
      nodesVisible: true,
      shellMode: 'full',
    },
    clock: {
      speed: 1,
      frozen: false,
      // Real ω₂₁ for visible-band transitions is ~3×10¹⁵ rad/s. Scale down
      // by 5e14 so a "visible-frequency" line oscillates at ~6 Hz on screen.
      displayHzScale: 5e14,
    },
    path: {
      currentStep: 0,
      mathVisible: true,
      knob: {
        0: 2.0, // step 0: electron radius in Bohr
        1: 0.0, // step 1: collapse-time slider [0,1]
        2: 3, // step 2: principal quantum number n
        3: 3, // step 3: principal quantum number n
        4: Math.PI / 4, // step 4: mix angle α (50/50 → max breathing)
        5: Math.PI / 4, // step 5: mix angle α (50/50 → max radiation)
        6: 1, // step 6: pair index 1 = "1s → 2p" (the allowed canonical case)
        7: 0.5, // step 7: decay rate Γ (display units; range [0.05, 5])
        8: 0.5, // step 8: decay rate Γ (display units; range [0.05, 5])
        9: 1.0, // step 9: decay rate Γ for the pole (display units; range [0.2, 8])
        10: 1.5, // step 10: B field in tesla (range [0, 5]) — shows Zeeman split
        11: 0, // step 11: frontier annotation index
      },
    },
  },
}
