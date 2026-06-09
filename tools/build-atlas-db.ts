import { createHash } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import type {
  ConstantAttrs,
  CoordSystemAttrs,
  Edge,
  ElementAttrs,
  EnergyLevelAttrs,
  Instance,
  LatticeAttrs,
  PolytopeAttrs,
  Primitive,
  Source,
  SpecialFunctionAttrs,
  SpectralLineAttrs,
  SymmetryGroupAttrs,
  UnitAttrs,
} from '../src/atlas/types.js'
import { ROOT, loadAtlasSeeds, type AtlasSeeds } from './atlas-seeds.js'

const SCHEMA_PATH = resolve(ROOT, 'src/atlas/schema.sql')
const DATA_DIR = resolve(ROOT, 'data')
const OUT_DB = resolve(DATA_DIR, 'atlas.sqlite')
const OUT_REPORT = resolve(DATA_DIR, 'atlas-validation.json')
const DIST_IMG_DIR = resolve(ROOT, 'dist/atlas/img')

export type NotationRow = {
  primitiveId: string
  unicodeSymbol: string | null
  texSymbol: string | null
  asciiSymbol: string | null
  codepoints: string[]
  verified: boolean
  issue: string | null
}

export type ValidationRow = {
  id: string
  checkName: string
  primitiveId: string | null
  status: 'pass' | 'warn' | 'fail'
  severity: 'info' | 'warning' | 'error'
  expected: string | null
  observed: string | null
  message: string
  createdAt: string
}

type RenderArtifactRow = {
  primitiveId: string
  artifactKind: 'front' | 'back'
  svgPath: string
  svgSha256: string | null
  svgBytes: number | null
  hasTitle: boolean
  hasRoleImg: boolean
  galleryAlt: string
  pdfPage: number | null
}

type ClaimRow = {
  id: string
  primitiveId: string
  claimType: string
  path: string
  valueJson: string
  unit: string | null
  sourceId: string
  retrievedAt: string
  confidence: 'source' | 'derived' | 'schematic' | 'curated'
  notes: string | null
}

const SUBSCRIPT_TO_ASCII: Record<string, string> = {
  '₀': '_0',
  '₁': '_1',
  '₂': '_2',
  '₃': '_3',
  '₄': '_4',
  '₅': '_5',
  '₆': '_6',
  '₇': '_7',
  '₈': '_8',
  '₉': '_9',
  '₊': '_+',
  '₋': '_-',
  ₐ: '_a',
  ₑ: '_e',
  ₕ: '_h',
  ᵢ: '_i',
  ⱼ: '_j',
  ₖ: '_k',
  ₗ: '_l',
  ₘ: '_m',
  ₙ: '_n',
  ₒ: '_o',
  ₚ: '_p',
  ᵣ: '_r',
  ₛ: '_s',
  ₜ: '_t',
  ᵤ: '_u',
  ᵥ: '_v',
  ₓ: '_x',
}

const SUPERSCRIPT_TO_ASCII: Record<string, string> = {
  '⁰': '^0',
  '¹': '^1',
  '²': '^2',
  '³': '^3',
  '⁴': '^4',
  '⁵': '^5',
  '⁶': '^6',
  '⁷': '^7',
  '⁸': '^8',
  '⁹': '^9',
  '⁺': '^+',
  '⁻': '^-',
}

const GREEK_TO_ASCII: Record<string, string> = {
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  Γ: 'Gamma',
  Δ: 'Delta',
  ε: 'epsilon',
  θ: 'theta',
  λ: 'lambda',
  μ: 'mu',
  ν: 'nu',
  π: 'pi',
  σ: 'sigma',
  φ: 'phi',
  ψ: 'psi',
  Ω: 'Omega',
}

const GREEK_TO_TEX: Record<string, string> = {
  alpha: '\\alpha',
  beta: '\\beta',
  gamma: '\\gamma',
  Gamma: '\\Gamma',
  Delta: '\\Delta',
  epsilon: '\\epsilon',
  theta: '\\theta',
  lambda: '\\lambda',
  mu: '\\mu',
  nu: '\\nu',
  pi: '\\pi',
  sigma: '\\sigma',
  phi: '\\phi',
  psi: '\\psi',
  Omega: '\\Omega',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function sql(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${String(value).replace(/'/g, "''")}'`
}

function normalizeForCompare(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function toAsciiSymbol(symbol: string): string {
  let out = ''
  for (const ch of symbol) {
    out += SUBSCRIPT_TO_ASCII[ch] ?? SUPERSCRIPT_TO_ASCII[ch] ?? GREEK_TO_ASCII[ch] ?? ch
  }
  return out
}

function toTexSymbol(symbol: string): string {
  let ascii = toAsciiSymbol(symbol)
  let previous: string
  do {
    previous = ascii
    ascii = ascii.replace(/_([A-Za-z0-9+\-/]+)_([A-Za-z0-9+\-/]+)/g, '_$1$2')
  } while (ascii !== previous)
  for (const [name, tex] of Object.entries(GREEK_TO_TEX)) {
    ascii = ascii.replace(new RegExp(`\\b${name}\\b`, 'g'), tex)
  }
  return ascii.replace(/_([A-Za-z0-9+\-/]+)/g, '_{$1}').replace(/\^([A-Za-z0-9+\-/]+)/g, '^{$1}')
}

function leadingNotationToken(name: string): string | null {
  const token = name.trim().match(/^[A-Za-z][A-Za-z0-9_+-]*/)
  return token?.[0] ?? null
}

export function deriveNotation(primitive: Primitive): NotationRow {
  const unicodeSymbol = primitive.symbol ?? null
  const asciiSymbol = unicodeSymbol ? toAsciiSymbol(unicodeSymbol) : null
  const texSymbol = unicodeSymbol ? toTexSymbol(unicodeSymbol) : null
  const codepoints = unicodeSymbol
    ? [...unicodeSymbol].map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase()}`)
    : []

  let issue: string | null = null
  const nameToken = leadingNotationToken(primitive.name)
  if (nameToken?.includes('_') && asciiSymbol) {
    const expected = normalizeForCompare(nameToken)
    const observed = normalizeForCompare(asciiSymbol)
    if (expected !== observed && observed.startsWith(expected[0] ?? '')) {
      issue = `symbol '${asciiSymbol}' does not match leading name token '${nameToken}'`
    }
  }

  return {
    primitiveId: primitive.id,
    unicodeSymbol,
    texSymbol,
    asciiSymbol,
    codepoints,
    verified: Boolean(unicodeSymbol) && issue === null,
    issue,
  }
}

function topLevelAttr(path: string): string {
  return (
    path
      .replace(/^attrs\./, '')
      .split(/[.[\]]/)
      .filter(Boolean)[0] ?? 'attrs'
  )
}

function inferUnit(path: string, attrs: Record<string, unknown>): string | null {
  if (path === 'attrs.value' && typeof attrs.unit === 'string') return attrs.unit
  if (path.endsWith('wavelengthVacuumNm') || path.endsWith('seriesLimitWavelengthNm')) return 'nm'
  if (path.endsWith('energyEV') || path.endsWith('ionizationEnergyEV')) return 'eV'
  if (path.endsWith('energyCm1')) return 'cm^-1'
  if (path.endsWith('atomicMassU')) return 'u'
  return null
}

/**
 * Per-claim confidence. Most overrides are primitive-level (schematic flag,
 * derived family) but a few paths get path-specific labels — e.g. the
 * uncertainty fields of an SI-2019-exact constant are derived (=0 by
 * definition) even though the constant's value is source-confidence.
 */
function confidenceFor(primitive: Primitive, path: string): ClaimRow['confidence'] {
  const attrs: Record<string, unknown> = isRecord(primitive.attrs) ? primitive.attrs : {}
  if (
    attrs.exact === true &&
    (path.endsWith('relativeUncertainty') || path.endsWith('absoluteUncertainty'))
  ) {
    return 'derived'
  }
  if (attrs.schematic === true) return 'schematic'
  if (primitive.family === 'identity' || Array.isArray(attrs.derivedFromIds)) return 'derived'
  return 'source'
}

function claimRowsFor(primitive: Primitive): ClaimRow[] {
  const attrs: Record<string, unknown> = isRecord(primitive.attrs) ? primitive.attrs : {}
  const rows: ClaimRow[] = []

  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`))
      return
    }
    if (isRecord(value)) {
      for (const key of Object.keys(value).sort()) walk(value[key], `${path}.${key}`)
      return
    }
    rows.push({
      id: `claim.${primitive.id}.${path.replace(/[^a-zA-Z0-9]+/g, '.')}`,
      primitiveId: primitive.id,
      claimType: `${primitive.family}.${topLevelAttr(path)}`,
      path,
      valueJson: JSON.stringify(value),
      unit: inferUnit(path, attrs),
      sourceId: primitive.sourceId,
      retrievedAt: primitive.retrievedAt,
      confidence: confidenceFor(primitive, path),
      notes: null,
    })
  }

  walk(attrs, 'attrs')
  return rows
}

function artifactRowsFor(primitive: Primitive): RenderArtifactRow[] {
  return (['front', 'back'] as const).map((artifactKind) => {
    const filename = artifactKind === 'front' ? `${primitive.id}.svg` : `${primitive.id}.back.svg`
    const path = resolve(DIST_IMG_DIR, filename)
    const relPath = `dist/atlas/img/${filename}`
    if (!existsSync(path)) {
      return {
        primitiveId: primitive.id,
        artifactKind,
        svgPath: relPath,
        svgSha256: null,
        svgBytes: null,
        hasTitle: false,
        hasRoleImg: false,
        galleryAlt: `${primitive.name} (${artifactKind})`,
        pdfPage: null,
      }
    }

    const svg = readFileSyncText(path)
    return {
      primitiveId: primitive.id,
      artifactKind,
      svgPath: relPath,
      svgSha256: sha256(svg),
      svgBytes: Buffer.byteLength(svg),
      hasTitle: /<title\b/.test(svg),
      hasRoleImg: /\brole="img"/.test(svg),
      galleryAlt: `${primitive.name} (${artifactKind})`,
      pdfPage: null,
    }
  })
}

function readFileSyncText(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8') : ''
}

function validationId(checkName: string, primitiveId: string | null, suffix = ''): string {
  return `validation.${checkName}.${primitiveId ?? 'global'}${suffix ? `.${suffix}` : ''}`.replace(
    /[^a-zA-Z0-9_.-]/g,
    '.',
  )
}

function makeValidation(params: Omit<ValidationRow, 'id'>): ValidationRow {
  return {
    ...params,
    id: validationId(
      params.checkName,
      params.primitiveId,
      params.expected ?? params.observed ?? '',
    ),
  }
}

export function collectValidationResults(
  seeds: AtlasSeeds,
  primitives: Primitive[],
  createdAt: string,
): ValidationRow[] {
  const rows: ValidationRow[] = []
  const seen = new Set<string>()
  const duplicateIds = new Set<string>()
  for (const primitive of seeds.primitives) {
    if (seen.has(primitive.id)) duplicateIds.add(primitive.id)
    seen.add(primitive.id)
  }

  for (const duplicateId of duplicateIds) {
    rows.push(
      makeValidation({
        checkName: 'primitive.unique_id',
        primitiveId: duplicateId,
        status: 'fail',
        severity: 'error',
        expected: 'unique primitive id',
        observed: duplicateId,
        message: `Duplicate primitive id '${duplicateId}'`,
        createdAt,
      }),
    )
  }

  for (const primitive of primitives) {
    const source = seeds.sources.get(primitive.sourceId)
    rows.push(
      makeValidation({
        checkName: 'primitive.source_exists',
        primitiveId: primitive.id,
        status: source ? 'pass' : 'fail',
        severity: source ? 'info' : 'error',
        expected: 'sourceId present in source seed',
        observed: primitive.sourceId,
        message: source
          ? `source '${primitive.sourceId}' exists`
          : `source '${primitive.sourceId}' is missing`,
        createdAt,
      }),
    )

    const retrievedAt = primitive.retrievedAt
    rows.push(
      makeValidation({
        checkName: 'primitive.retrieved_at',
        primitiveId: primitive.id,
        status: /^\d{4}-\d{2}-\d{2}$/.test(retrievedAt) ? 'pass' : 'fail',
        severity: /^\d{4}-\d{2}-\d{2}$/.test(retrievedAt) ? 'info' : 'error',
        expected: 'YYYY-MM-DD',
        observed: retrievedAt,
        message: `primitive retrievedAt is '${retrievedAt}'`,
        createdAt,
      }),
    )

    const notation = deriveNotation(primitive)
    rows.push(
      makeValidation({
        checkName: 'notation.symbol_matches_name',
        primitiveId: primitive.id,
        status: notation.issue ? 'fail' : 'pass',
        severity: notation.issue ? 'error' : 'info',
        expected: leadingNotationToken(primitive.name),
        observed: notation.asciiSymbol,
        message: notation.issue ?? 'symbol is mechanically consistent with name token',
        createdAt,
      }),
    )

    for (const artifact of artifactRowsFor(primitive)) {
      rows.push(
        makeValidation({
          checkName: 'render.svg_exists',
          primitiveId: primitive.id,
          status: artifact.svgBytes === null ? 'warn' : 'pass',
          severity: artifact.svgBytes === null ? 'warning' : 'info',
          expected: artifact.svgPath,
          observed: artifact.svgBytes === null ? 'missing' : `${artifact.svgBytes} bytes`,
          message:
            artifact.svgBytes === null
              ? `${artifact.artifactKind} SVG is missing`
              : `${artifact.artifactKind} SVG exists`,
          createdAt,
        }),
      )
      rows.push(
        makeValidation({
          checkName: 'render.svg_accessible_title',
          primitiveId: primitive.id,
          status: artifact.hasTitle ? 'pass' : 'warn',
          severity: artifact.hasTitle ? 'info' : 'warning',
          expected: `${artifact.artifactKind}:<title>`,
          observed: artifact.hasTitle ? '<title>' : 'missing',
          message: artifact.hasTitle
            ? `${artifact.artifactKind} SVG has a title`
            : `${artifact.artifactKind} SVG lacks a title`,
          createdAt,
        }),
      )
    }
  }

  return rows
}

function uniquePrimitives(primitives: Primitive[]): Primitive[] {
  const out: Primitive[] = []
  const seen = new Set<string>()
  for (const primitive of primitives) {
    if (seen.has(primitive.id)) continue
    seen.add(primitive.id)
    out.push(primitive)
  }
  return out
}

function insertSource(source: Source): string {
  return `INSERT INTO source (id, citation, doi, url, license, version, retrieved_at, notes) VALUES (${[
    source.id,
    source.citation,
    source.doi,
    source.url,
    source.license,
    source.version,
    source.retrievedAt,
    source.notes,
  ]
    .map(sql)
    .join(', ')});`
}

function primitiveDimension(primitive: Primitive): number | null {
  if (typeof primitive.dimension === 'number') return primitive.dimension
  const attrs: Record<string, unknown> = isRecord(primitive.attrs) ? primitive.attrs : {}
  return typeof attrs.dimension === 'number' ? attrs.dimension : null
}

function insertPrimitive(primitive: Primitive): string {
  return `INSERT INTO primitive (id, family, name, symbol, dimension, attrs, source_id, retrieved_at, notes, thumbnail_uri) VALUES (${[
    primitive.id,
    primitive.family,
    primitive.name,
    primitive.symbol,
    primitiveDimension(primitive),
    stableJson(primitive.attrs),
    primitive.sourceId,
    primitive.retrievedAt,
    primitive.notes,
    `img/${primitive.id}.svg`,
  ]
    .map(sql)
    .join(', ')});`
}

function insertPrimitiveFts(primitive: Primitive): string {
  return `INSERT INTO primitive_fts (id, family, name, symbol, notes, attrs) VALUES (${[
    primitive.id,
    primitive.family,
    primitive.name,
    primitive.symbol,
    primitive.notes,
    stableJson(primitive.attrs),
  ]
    .map(sql)
    .join(', ')});`
}

function insertInstance(instance: Instance): string {
  return `INSERT INTO instance (id, primitive_id, system, conditions, citation_source_id, witness, observed_at, magnitude_value, magnitude_unit, notes) VALUES (${[
    instance.id,
    instance.primitiveId,
    instance.system,
    instance.conditions ? stableJson(instance.conditions) : null,
    instance.citationSourceId,
    instance.witness,
    instance.observedAt,
    instance.magnitudeValue,
    instance.magnitudeUnit,
    instance.notes,
  ]
    .map(sql)
    .join(', ')});`
}

function insertEdge(edge: Edge): string {
  return `INSERT INTO edge (from_id, to_id, kind, source_id, notes) VALUES (${[
    edge.fromId,
    edge.toId,
    edge.kind,
    edge.sourceId,
    edge.notes,
  ]
    .map(sql)
    .join(', ')});`
}

function insertNotation(row: NotationRow): string {
  return `INSERT INTO notation (primitive_id, unicode_symbol, tex_symbol, ascii_symbol, codepoints, verified, issue) VALUES (${[
    row.primitiveId,
    row.unicodeSymbol,
    row.texSymbol,
    row.asciiSymbol,
    stableJson(row.codepoints),
    row.verified,
    row.issue,
  ]
    .map(sql)
    .join(', ')});`
}

function insertSeedRecord(primitive: Primitive, seedFile: string | undefined): string {
  return `INSERT INTO seed_record (primitive_id, seed_file, source_id, retrieved_at, attrs_sha256) VALUES (${[
    primitive.id,
    seedFile ?? 'unknown',
    primitive.sourceId,
    primitive.retrievedAt,
    sha256(stableJson(primitive.attrs)),
  ]
    .map(sql)
    .join(', ')});`
}

function insertClaim(row: ClaimRow): string {
  return `INSERT INTO claim (id, primitive_id, claim_type, path, value_json, unit, source_id, retrieved_at, confidence, notes) VALUES (${[
    row.id,
    row.primitiveId,
    row.claimType,
    row.path,
    row.valueJson,
    row.unit,
    row.sourceId,
    row.retrievedAt,
    row.confidence,
    row.notes,
  ]
    .map(sql)
    .join(', ')});`
}

function insertRenderArtifact(row: RenderArtifactRow): string {
  return `INSERT INTO render_artifact (primitive_id, artifact_kind, svg_path, svg_sha256, svg_bytes, has_title, has_role_img, gallery_alt, pdf_page) VALUES (${[
    row.primitiveId,
    row.artifactKind,
    row.svgPath,
    row.svgSha256,
    row.svgBytes,
    row.hasTitle,
    row.hasRoleImg,
    row.galleryAlt,
    row.pdfPage,
  ]
    .map(sql)
    .join(', ')});`
}

function insertValidation(row: ValidationRow): string {
  return `INSERT OR REPLACE INTO validation_result (id, check_name, primitive_id, status, severity, expected, observed, message, created_at) VALUES (${[
    row.id,
    row.checkName,
    row.primitiveId,
    row.status,
    row.severity,
    row.expected,
    row.observed,
    row.message,
    row.createdAt,
  ]
    .map(sql)
    .join(', ')});`
}

function insertFamilyProjection(primitive: Primitive): string[] {
  const attrs = isRecord(primitive.attrs) ? primitive.attrs : {}
  switch (primitive.family) {
    case 'spectral-line': {
      const a = attrs as SpectralLineAttrs
      if (typeof a.wavelengthVacuumNm !== 'number') return []
      return [
        `INSERT INTO spectral_transition (primitive_id, wavelength_vacuum_nm, upper_level_id, lower_level_id, transition_type, series_id) VALUES (${[
          primitive.id,
          a.wavelengthVacuumNm,
          a.upperLevelId,
          a.lowerLevelId,
          a.transitionType,
          a.seriesId,
        ]
          .map(sql)
          .join(', ')});`,
      ]
    }
    case 'energy-level': {
      const a = attrs as EnergyLevelAttrs
      return [
        `INSERT INTO energy_level (primitive_id, n, l, j, term_symbol, energy_ev, energy_cm1, schematic) VALUES (${[
          primitive.id,
          a.n,
          a.l,
          a.j,
          a.termSymbol,
          a.energyEV,
          a.energyCm1,
          a.schematic === true,
        ]
          .map(sql)
          .join(', ')});`,
      ]
    }
    case 'polytope': {
      const a = attrs as PolytopeAttrs
      return [
        `INSERT INTO polytope_invariant (primitive_id, dimension, schlafli, coxeter, vertices, edge_count, faces, cells) VALUES (${[
          primitive.id,
          a.dimension,
          a.schlafli ? stableJson(a.schlafli) : null,
          a.coxeter,
          a.vertices,
          a.edges,
          a.faces,
          a.cells,
        ]
          .map(sql)
          .join(', ')});`,
      ]
    }
    case 'symmetry-group': {
      const a = attrs as SymmetryGroupAttrs
      return [
        `INSERT INTO group_invariant (primitive_id, group_type, group_order, lie_algebra_type, dynkin) VALUES (${[
          primitive.id,
          a.groupType,
          a.order === undefined ? null : String(a.order),
          a.lieAlgebraType,
          a.dynkin,
        ]
          .map(sql)
          .join(', ')});`,
      ]
    }
    case 'lattice': {
      const a = attrs as LatticeAttrs
      return [
        `INSERT INTO lattice_invariant (primitive_id, dimension, bravais_class, point_group, conventional_cell_json) VALUES (${[
          primitive.id,
          a.dimension,
          a.bravaisClass,
          a.pointGroup,
          a.conventionalCell ? stableJson(a.conventionalCell) : null,
        ]
          .map(sql)
          .join(', ')});`,
      ]
    }
    case 'coord-system': {
      const a = attrs as CoordSystemAttrs
      const pdes = a.separablePdes ?? []
      const basis = a.basisFunctions ?? []
      const max = Math.max(pdes.length, basis.length)
      return Array.from({ length: max }, (_, index) => {
        return `INSERT INTO coordinate_system_pde (primitive_id, pde, basis_function) VALUES (${[
          primitive.id,
          pdes[index],
          basis[index],
        ]
          .map(sql)
          .join(', ')});`
      })
    }
    case 'constant': {
      const a = attrs as ConstantAttrs & { absoluteUncertainty?: number }
      return [
        `INSERT INTO constant_value (primitive_id, value, unit, exact, relative_uncertainty, absolute_uncertainty, derivation_latex, derived_from_ids_json) VALUES (${[
          primitive.id,
          typeof a.value === 'number' ? a.value : null,
          a.unit,
          a.exact === true,
          a.relativeUncertainty,
          a.absoluteUncertainty,
          a.derivationLatex,
          a.derivedFromIds ? stableJson(a.derivedFromIds) : null,
        ]
          .map(sql)
          .join(', ')});`,
      ]
    }
    case 'unit': {
      const a = attrs as UnitAttrs
      return [
        `INSERT INTO unit_invariant (primitive_id, dimension_string, si_factor, reciprocal) VALUES (${[
          primitive.id,
          a.dimensionString,
          a.siFactor,
          a.reciprocal === true,
        ]
          .map(sql)
          .join(', ')});`,
      ]
    }
    case 'identity': {
      const a = attrs as Record<string, unknown>
      return [
        `INSERT INTO identity_invariant (primitive_id, equation, dimension, numeric_json, where_json) VALUES (${[
          primitive.id,
          typeof a.equation === 'string' ? a.equation : null,
          typeof a.dimension === 'string' ? a.dimension : null,
          a.numeric !== undefined ? stableJson(a.numeric) : null,
          a.where !== undefined ? stableJson(a.where) : null,
        ]
          .map(sql)
          .join(', ')});`,
      ]
    }
    case 'tiling': {
      const a = attrs as Record<string, unknown>
      return [
        `INSERT INTO tiling_invariant (primitive_id, dimension, schlafli, vertex_figure, geometry, dual_id) VALUES (${[
          primitive.id,
          typeof a.dimension === 'number' ? a.dimension : null,
          a.schlafli !== undefined ? stableJson(a.schlafli) : null,
          typeof a.vertexFigure === 'string' ? a.vertexFigure : null,
          typeof a.geometry === 'string' ? a.geometry : null,
          typeof a.dual === 'string' ? a.dual : null,
        ]
          .map(sql)
          .join(', ')});`,
      ]
    }
    case 'curved-space': {
      const a = attrs as Record<string, unknown>
      return [
        `INSERT INTO curved_space_invariant (primitive_id, dimension, curvature_k, model, isotropy, isometry_group_order, line_element) VALUES (${[
          primitive.id,
          a.dimension !== undefined ? String(a.dimension) : null,
          typeof a.curvatureK === 'number' ? a.curvatureK : null,
          typeof a.model === 'string' ? a.model : null,
          typeof a.isotropy === 'string' ? a.isotropy : null,
          a.isometryGroupOrder !== undefined ? String(a.isometryGroupOrder) : null,
          typeof a.lineElement === 'string' ? a.lineElement : null,
        ]
          .map(sql)
          .join(', ')});`,
      ]
    }
    case 'special-function': {
      const a = attrs as SpecialFunctionAttrs
      return [
        `INSERT INTO special_function_invariant (primitive_id, defining_equation, recurrence, orthogonality_weight, parameters_json) VALUES (${[
          primitive.id,
          a.definingEquation,
          a.recurrence,
          a.orthogonalityWeight,
          a.parameters ? stableJson(a.parameters) : null,
        ]
          .map(sql)
          .join(', ')});`,
      ]
    }
    case 'element': {
      const a = attrs as ElementAttrs
      return [
        `INSERT INTO element_invariant (primitive_id, z, ground_config, ground_term, ionization_energy_ev, atomic_mass_u) VALUES (${[
          primitive.id,
          a.z,
          a.groundConfig,
          a.groundTerm,
          a.ionizationEnergyEV,
          a.atomicMassU,
        ]
          .map(sql)
          .join(', ')});`,
      ]
    }
    case 'series': {
      const a = attrs as Record<string, unknown>
      return [
        `INSERT INTO series_invariant (primitive_id, element_id, lower_n, region, series_limit_wavelength_nm, named_after) VALUES (${[
          primitive.id,
          typeof a.elementId === 'string' ? a.elementId : null,
          typeof a.lowerN === 'number' ? a.lowerN : null,
          typeof a.region === 'string' ? a.region : null,
          typeof a.seriesLimitWavelengthNm === 'number' ? a.seriesLimitWavelengthNm : null,
          typeof a.namedAfter === 'string' ? a.namedAfter : null,
        ]
          .map(sql)
          .join(', ')});`,
      ]
    }
    case 'transition-type': {
      const a = attrs as Record<string, unknown>
      return [
        `INSERT INTO transition_type_invariant (primitive_id, multipole_order, parity, selection_rules_json, lifetime_order_of_magnitude_s, schematic) VALUES (${[
          primitive.id,
          typeof a.multipoleOrder === 'string' ? a.multipoleOrder : null,
          typeof a.parity === 'string' ? a.parity : null,
          a.selectionRules !== undefined ? stableJson(a.selectionRules) : null,
          typeof a.lifetimeOrderOfMagnitudeS === 'number' ? a.lifetimeOrderOfMagnitudeS : null,
          a.schematic === true,
        ]
          .map(sql)
          .join(', ')});`,
      ]
    }
    default:
      return []
  }
}

export function buildAtlasSql(
  schemaSql: string,
  seeds: AtlasSeeds,
  createdAt: string,
): { sqlText: string; validationRows: ValidationRow[] } {
  const primitives = uniquePrimitives(seeds.primitives)
  const validationRows = collectValidationResults(seeds, primitives, createdAt)
  const lines: string[] = [schemaSql, 'BEGIN;']

  for (const source of [...seeds.sources.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(insertSource(source))
  }

  for (const primitive of primitives) {
    lines.push(insertPrimitive(primitive))
    lines.push(insertPrimitiveFts(primitive))
    lines.push(insertNotation(deriveNotation(primitive)))
    lines.push(insertSeedRecord(primitive, seeds.seedFileByPrimitiveId.get(primitive.id)))
    for (const claim of claimRowsFor(primitive)) lines.push(insertClaim(claim))
    for (const artifact of artifactRowsFor(primitive)) lines.push(insertRenderArtifact(artifact))
    lines.push(...insertFamilyProjection(primitive))
  }

  for (const instance of seeds.instances) {
    lines.push(insertInstance(instance))
    lines.push(
      `INSERT INTO instance_fts (id, primitive_id, system, witness, notes) VALUES (${[
        instance.id,
        instance.primitiveId,
        instance.system,
        instance.witness,
        instance.notes,
      ]
        .map(sql)
        .join(', ')});`,
    )
  }
  for (const edge of seeds.edges) lines.push(insertEdge(edge))
  for (const row of validationRows) lines.push(insertValidation(row))

  lines.push('COMMIT;')
  return { sqlText: lines.join('\n') + '\n', validationRows }
}

function validationSummary(rows: ValidationRow[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1
    return acc
  }, {})
}

export async function buildAtlasDatabase(): Promise<void> {
  const seeds = await loadAtlasSeeds()
  const schemaSql = await readFile(SCHEMA_PATH, 'utf-8')
  const createdAt = new Date().toISOString()
  const { sqlText, validationRows } = buildAtlasSql(schemaSql, seeds, createdAt)

  await mkdir(DATA_DIR, { recursive: true })
  if (existsSync(OUT_DB)) unlinkSync(OUT_DB)

  const result = spawnSync('sqlite3', [OUT_DB], {
    input: sqlText,
    encoding: 'utf-8',
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'sqlite3 failed')
  }
  for (const sidecar of [`${OUT_DB}-shm`, `${OUT_DB}-wal`]) {
    if (existsSync(sidecar)) unlinkSync(sidecar)
  }

  const report = {
    generatedAt: createdAt,
    database: OUT_DB,
    primitives: uniquePrimitives(seeds.primitives).length,
    sources: seeds.sources.size,
    instances: seeds.instances.length,
    edges: seeds.edges.length,
    validation: validationSummary(validationRows),
    failures: validationRows.filter((row) => row.status === 'fail'),
    warnings: validationRows.filter((row) => row.status === 'warn'),
  }
  await writeFile(OUT_REPORT, JSON.stringify(report, null, 2) + '\n', 'utf-8')

  console.log(`[atlas-db] wrote ${OUT_DB}`)
  console.log(`[atlas-db] wrote ${OUT_REPORT}`)
  console.log(`[atlas-db] validation ${JSON.stringify(report.validation)}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  buildAtlasDatabase().catch((err) => {
    console.error('[atlas-db] build failed:', err)
    process.exit(1)
  })
}
