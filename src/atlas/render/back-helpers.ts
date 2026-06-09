/**
 * Helpers shared across family back renderers.
 *
 * The shell (this file + back-skeleton.ts) owns layout. Family
 * renderers own only the family-specific block. Both pieces stay
 * decoupled so the four parallel agents authoring the family blocks
 * can work independently.
 */

import type { Primitive, PrimitiveFamily } from '../types.js'
import type { BackParts, BackRenderContext, BackRenderer } from './types.js'
import { renderBackSkeleton } from './back-skeleton.js'

const SOURCE_LABEL: Record<string, string> = {
  'codata-2022': 'CODATA 2022',
  'codata-2018': 'CODATA 2018',
  'nist-asd-v5.10': 'NIST ASD v5.10',
  'nist-dlmf': 'NIST DLMF',
  'cie-015-2018': 'CIE 015:2018',
  'iec-61966-2-1': 'IEC 61966-2-1',
  'ciddor-1996': 'Ciddor 1996',
  'edlen-1966': 'Edlen 1966',
  'coxeter-1973': 'Coxeter 1973',
  'itc-vol-a': 'ITC Vol A',
  'morse-feshbach-1953': 'Morse-Feshbach 1953',
  'sansonetti-martin-2005': 'Sansonetti-Martin 2005',
}

/** Resolve a source.id to a human label, falling back to the id itself. */
export function resolveSourceCitation(sourceId: string): string {
  return SOURCE_LABEL[sourceId] ?? sourceId
}

/**
 * Build the standard `BackParts` from a primitive — everything except
 * `familyBlock`, which the family renderer authors. Use this from
 * inside a family `renderBack` so all backs share the same metadata
 * shape.
 */
export function buildBackParts(
  primitive: Primitive,
  familyBlock: string,
  ctx: BackRenderContext,
): BackParts {
  const source = ctx.sources.get(primitive.sourceId)
  const sourceCitation = resolveSourceCitation(source?.id ?? primitive.sourceId)
  return {
    title: primitive.name,
    symbol: primitive.symbol,
    description: primitive.description,
    family: primitive.family,
    primitiveId: primitive.id,
    familyBlock,
    sourceCitation,
    retrievedAt: primitive.retrievedAt,
  }
}

/**
 * Standard placeholder family block emitted by every v1 stub. The
 * three other agents will replace this fragment per family without
 * touching the skeleton.
 */
export function tbdFamilyBlock(family: PrimitiveFamily): string {
  return `<text x="0" y="20" class="muted">TBD — back content pending for ${family}</text>`
}

/**
 * Convenience for v1 stubs: produce a `BackRenderer` that emits the
 * skeleton with a TBD family block.
 */
export function makeTbdBackRenderer(family: PrimitiveFamily): BackRenderer {
  return (primitive, ctx) => ({
    svg: renderBackSkeleton(buildBackParts(primitive, tbdFamilyBlock(family), ctx)),
  })
}
