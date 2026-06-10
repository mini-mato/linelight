import type { ElementSymbol } from './types'

/** Elements with a full synced instrument suite in v1. Others are spectrum context only. */
export const SUITE_ELEMENTS: ReadonlySet<ElementSymbol> = new Set(['H'])

export function isSuiteElement(element: ElementSymbol): boolean {
  return SUITE_ELEMENTS.has(element)
}
