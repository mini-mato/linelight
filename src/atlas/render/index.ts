/**
 * Atlas thumbnail render dispatcher.
 *
 * Routes a primitive to its family-specific renderer. Falls back to the
 * stub for any family without a registered renderer — better an honest
 * typeset card than a fake visual.
 *
 * Each family ships two renderers:
 *   - front (`Renderer`)        — the existing single-sided card
 *   - back  (`BackRenderer`)    — v1 stub; reviewers fill the family
 *                                  block in a follow-up
 */

import type { Primitive, PrimitiveFamily } from '../types.js'
import type {
  BackRenderContext,
  BackRenderResult,
  BackRenderer,
  Renderer,
  RenderContext,
  RenderResult,
} from './types.js'

import { renderConstant, renderBack as renderBackConstant } from './constant.js'
import { renderUnit, renderBack as renderBackUnit } from './unit.js'
import { renderIdentity, renderBack as renderBackIdentity } from './identity.js'
import {
  renderSpecialFunction,
  renderBack as renderBackSpecialFunction,
} from './special-function.js'
import { renderSpectralLine, renderBack as renderBackSpectralLine } from './spectral-line.js'
import { renderEnergyLevel, renderBack as renderBackEnergyLevel } from './energy-level.js'
import { renderElement, renderBack as renderBackElement } from './element.js'
import { renderSeries, renderBack as renderBackSeries } from './series.js'
import { renderTransitionType, renderBack as renderBackTransitionType } from './transition-type.js'
import { renderPolytope, renderBack as renderBackPolytope } from './polytope.js'
import { renderLattice, renderBack as renderBackLattice } from './lattice.js'
import { renderTiling, renderBack as renderBackTiling } from './tiling.js'
import { renderCoordSystem, renderBack as renderBackCoordSystem } from './coord-system.js'
import { renderCurvedSpace, renderBack as renderBackCurvedSpace } from './curved-space.js'
import { renderSymmetryGroup, renderBack as renderBackSymmetryGroup } from './symmetry-group.js'
import { renderStub } from './stub.js'
import { makeTbdBackRenderer, resolveSourceCitation } from './back-helpers.js'
import { addAccessibleTitle } from './svg.js'

const RENDERERS: Partial<Record<PrimitiveFamily, Renderer>> = {
  constant: renderConstant,
  unit: renderUnit,
  identity: renderIdentity,
  'special-function': renderSpecialFunction,
  'spectral-line': renderSpectralLine,
  'energy-level': renderEnergyLevel,
  element: renderElement,
  series: renderSeries,
  'transition-type': renderTransitionType,
  polytope: renderPolytope,
  lattice: renderLattice,
  tiling: renderTiling,
  'coord-system': renderCoordSystem,
  'curved-space': renderCurvedSpace,
  'symmetry-group': renderSymmetryGroup,
}

const BACK_RENDERERS: Partial<Record<PrimitiveFamily, BackRenderer>> = {
  constant: renderBackConstant,
  unit: renderBackUnit,
  identity: renderBackIdentity,
  'special-function': renderBackSpecialFunction,
  'spectral-line': renderBackSpectralLine,
  'energy-level': renderBackEnergyLevel,
  element: renderBackElement,
  series: renderBackSeries,
  'transition-type': renderBackTransitionType,
  polytope: renderBackPolytope,
  lattice: renderBackLattice,
  tiling: renderBackTiling,
  'coord-system': renderBackCoordSystem,
  'curved-space': renderBackCurvedSpace,
  'symmetry-group': renderBackSymmetryGroup,
}

export function renderPrimitive(primitive: Primitive, ctx: RenderContext): RenderResult {
  const renderer = RENDERERS[primitive.family] ?? renderStub
  const svg = addAccessibleTitle(renderer(primitive, ctx), primitive.name, primitive.id)
  const source = ctx.sources.get(primitive.sourceId)
  return {
    primitiveId: primitive.id,
    family: primitive.family,
    name: primitive.name,
    symbol: primitive.symbol,
    svg,
    thumbnailHref: `img/${primitive.id}.svg`,
    sourceId: source?.id ?? primitive.sourceId,
    sourceCitation: resolveSourceCitation(source?.id ?? primitive.sourceId),
    retrievedAt: primitive.retrievedAt,
  }
}

/**
 * Render the back of a primitive. Falls back to a generic TBD block
 * when no family back renderer is registered (which shouldn't happen
 * in v1 — every family ships at minimum a stub).
 */
export function renderPrimitiveBack(
  primitive: Primitive,
  ctx: BackRenderContext,
): BackRenderResult {
  const renderer = BACK_RENDERERS[primitive.family] ?? makeTbdBackRenderer(primitive.family)
  const result = renderer(primitive, ctx)
  return {
    svg: addAccessibleTitle(result.svg, `${primitive.name} details`, `${primitive.id}-back`),
  }
}

export {
  renderConstant,
  renderCoordSystem,
  renderCurvedSpace,
  renderElement,
  renderEnergyLevel,
  renderIdentity,
  renderLattice,
  renderPolytope,
  renderSeries,
  renderSpecialFunction,
  renderSpectralLine,
  renderStub,
  renderSymmetryGroup,
  renderTiling,
  renderTransitionType,
  renderUnit,
}
export type {
  Renderer,
  RenderContext,
  RenderResult,
  BackRenderer,
  BackRenderContext,
  BackRenderResult,
}
