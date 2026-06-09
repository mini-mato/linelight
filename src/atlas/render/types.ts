/**
 * Render context + result types.
 *
 * Atlas cards are two-sided. The FRONT is rendered by a `Renderer`
 * (returns a complete SVG string). The BACK is rendered by a
 * `BackRenderer` (returns `{ svg }`), which delegates layout to the
 * shared `renderBackSkeleton` helper while authoring only the
 * family-specific block.
 */

import type { EdgeKind, Primitive, PrimitiveFamily, Source } from '../types.js'

export type RenderContext = {
  /** Map source.id -> Source for citation lookup. */
  sources: Map<string, Source>
}

export type RenderResult = {
  primitiveId: string
  family: PrimitiveFamily
  name: string
  symbol: string | undefined
  svg: string
  /** Relative path from dist/atlas/index.html to the SVG file. */
  thumbnailHref: string
  /** Provenance, surfaced in the gallery card-foot as `.ai-detail`. */
  sourceId?: string
  sourceCitation?: string
  retrievedAt?: string
}

export type Renderer = (primitive: Primitive, ctx: RenderContext) => string

/**
 * A single relation surfaced on the back of a card. Reserved for when
 * the edges seed lands; until then the relations block renders empty.
 */
export type RelationRef = {
  kind: EdgeKind
  targetId: string
  targetName?: string
}

/**
 * Composable parts that make up the back of a card. The shared
 * `renderBackSkeleton` consumes this shape and produces a full SVG.
 *
 * `familyBlock` is a raw SVG fragment authored by the family back
 * renderer; the skeleton wraps it inside a positioned `<g>`.
 */
export type BackParts = {
  title: string
  symbol?: string
  description?: string
  family: PrimitiveFamily
  primitiveId: string
  /** Raw SVG fragment authored by the family renderer. */
  familyBlock: string
  /** Optional; reserved for when the edges seed lands. */
  relations?: { in: RelationRef[]; out: RelationRef[] }
  sourceCitation: string
  retrievedAt: string
}

export type BackRenderResult = { svg: string }

export type BackRenderContext = RenderContext & {
  /** id → primitive lookup for relation surfacing. */
  primitives: Map<string, Primitive>
}

export type BackRenderer = (primitive: Primitive, ctx: BackRenderContext) => BackRenderResult
