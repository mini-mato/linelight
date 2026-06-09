/**
 * linelight atlas — TypeScript types mirroring src/atlas/schema.sql.
 *
 * The atlas is a relational database of physics + geometry primitives
 * connected to observed examples in nature. See
 * kb/linelight/wiki/decisions/2026-05-04-atlas-schema.md for the design.
 *
 * Identity scheme: hierarchical strings.
 *   - constant.codata-2022.alpha
 *   - polytope.regular.4d.600-cell
 *   - coord.3d.parabolic
 *   - lattice.bravais.3d.fcc
 *   - symmetry-group.point.3d.t-d
 *   - special-function.legendre.p
 *
 * Edge kinds are closed:
 *   derives_from | instantiates | restricts | separates_in
 *   | solves | breaks_to | composes | dual_of
 */

export type PrimitiveFamily =
  | 'constant'
  | 'unit'
  | 'identity'
  | 'polytope'
  | 'coord-system'
  | 'lattice'
  | 'tiling'
  | 'curved-space'
  | 'symmetry-group'
  | 'special-function'
  | 'spectral-line'
  | 'energy-level'
  | 'element'
  | 'series'
  | 'transition-type'

export type EdgeKind =
  | 'derives_from'
  | 'instantiates'
  | 'restricts'
  | 'separates_in'
  | 'solves'
  | 'breaks_to'
  | 'composes'
  | 'dual_of'

export const EDGE_KINDS: readonly EdgeKind[] = [
  'derives_from',
  'instantiates',
  'restricts',
  'separates_in',
  'solves',
  'breaks_to',
  'composes',
  'dual_of',
] as const

export type Source = {
  id: string
  citation: string
  doi?: string
  url?: string
  license?:
    | 'public-domain'
    | 'us-gov-work'
    | 'cc-by-4.0'
    | 'cc-by-sa-4.0'
    | 'mit'
    | 'open-access'
    | 'personal-copy'
    | 'fair-use'
    | string
  version?: string
  retrievedAt: string
  notes?: string
}

/**
 * Family-specific attribute shapes (stored in `primitive.attrs` JSON).
 * The DB column is opaque text; this discriminated union is what the
 * build/load code uses on either side.
 */
export type ConstantAttrs = {
  value: number
  unit: string
  relativeUncertainty?: number
  exact: boolean
  derivationLatex?: string
  derivedFromIds?: string[]
}

export type UnitAttrs = {
  dimensionString: string
  siFactor?: number
  reciprocal?: boolean
}

export type PolytopeAttrs = {
  dimension: number | 'n'
  schlafli?: (number | 'n')[]
  coxeter?: string
  vertices?: number
  edges?: number
  faces?: number
  cells?: number
  symmetryGroupId?: string
  formulas?: Record<string, { latex: string; closedForm?: string; reference?: string }>
}

export type CoordSystemAttrs = {
  dimension: number
  separablePdes?: string[]
  basisFunctions?: string[]
  metric?: string
}

export type LatticeAttrs = {
  dimension: number
  bravaisClass?: string
  pointGroup?: string
  spaceGroup?: string
  conventionalCell?: {
    a: number
    b: number
    c: number
    alpha?: number
    beta?: number
    gamma?: number
  }
}

export type SymmetryGroupAttrs = {
  groupType: 'point' | 'lie' | 'finite' | 'space' | 'wallpaper'
  order?: number | 'inf'
  lieAlgebraType?: string
  dynkin?: string
}

export type SpecialFunctionAttrs = {
  definingEquation?: string
  recurrence?: string
  orthogonalityWeight?: string
  parameters?: string[]
}

export type SpectralLineAttrs = {
  wavelengthVacuumNm: number
  wavelengthAirNm?: number
  einsteinAPerS?: number
  oscillatorStrengthF?: number
  upperLevelId?: string
  lowerLevelId?: string
  transitionType?: 'E1' | 'M1' | 'E2' | 'forbidden'
  seriesId?: string
}

export type EnergyLevelAttrs = {
  n?: number
  l?: number
  s?: number
  j?: number
  energyEV?: number
  energyCm1?: number
  termSymbol?: string
  electronConfig?: string
  schematic?: boolean
}

export type ElementAttrs = {
  z: number
  groundConfig?: string
  groundTerm?: string
  ionizationEnergyEV?: number
  atomicMassU?: number
  isotopes?: { massNumber: number; abundancePct?: number; halfLife?: string }[]
}

export type AnyAttrs =
  | ConstantAttrs
  | UnitAttrs
  | PolytopeAttrs
  | CoordSystemAttrs
  | LatticeAttrs
  | SymmetryGroupAttrs
  | SpecialFunctionAttrs
  | SpectralLineAttrs
  | EnergyLevelAttrs
  | ElementAttrs
  | Record<string, unknown>

export type Primitive = {
  id: string
  family: PrimitiveFamily
  name: string
  symbol?: string
  dimension?: number
  attrs: AnyAttrs
  sourceId: string
  retrievedAt: string
  notes?: string
  /**
   * Long-form prose describing the primitive. Optional and authored by
   * reviewers (never auto-generated). Distinct from `notes`, which is a
   * short provenance/footnote field. When present, the back of the atlas
   * card surfaces this text in the description block; when absent, the
   * description block renders blank.
   */
  description?: string
  /** Relative URI to the rendered thumbnail (emitted by tools/build-atlas-thumbnails). */
  thumbnailUri?: string
}

export type InstanceConditions = {
  temperature_K?: number
  pressure_Pa?: number
  bField_T?: number
  eField_V_per_m?: number
  numberDensity_per_m3?: number
  bulkVelocity_m_per_s?: number
  [k: string]: number | string | undefined
}

export type Instance = {
  id: string
  primitiveId: string
  system: string
  conditions?: InstanceConditions
  citationSourceId: string
  witness?: string
  observedAt?: string
  magnitudeValue?: number
  magnitudeUnit?: string
  notes?: string
}

export type Edge = {
  fromId: string
  toId: string
  kind: EdgeKind
  sourceId?: string
  notes?: string
}
