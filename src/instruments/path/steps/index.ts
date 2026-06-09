/**
 * Proof-chain step registry. Steps are 0..11.
 */

import type { Step } from '../types'
import { step00Coulomb } from './step-00-coulomb'
import { step01Collapse } from './step-01-collapse'
import { step02Stationary } from './step-02-stationary'
import { step03StaticDensity } from './step-03-static-density'
import { step04Superposition } from './step-04-superposition'
import { step05Radiation } from './step-05-radiation'
import { step06SelectionRules } from './step-06-selection-rules'
import { step07Decay } from './step-07-decay'
import { step08Lineshape } from './step-08-lineshape'
import { step09Pole } from './step-09-pole'
import { step10Fields } from './step-10-fields'
import { step11Frontier } from './step-11-frontier'

export const STEPS: readonly Step[] = [
  step00Coulomb,
  step01Collapse,
  step02Stationary,
  step03StaticDensity,
  step04Superposition,
  step05Radiation,
  step06SelectionRules,
  step07Decay,
  step08Lineshape,
  step09Pole,
  step10Fields,
  step11Frontier,
]
