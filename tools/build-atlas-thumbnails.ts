/**
 * Build-time entrypoint: walk every JSON file under src/data/_relations/,
 * collect sources + primitives, render front + back thumbnails per
 * primitive, emit `dist/atlas/img/{id}.svg` (front) and
 * `dist/atlas/img/{id}.back.svg` (back), the family key cards
 * (`dist/atlas/img/_key.{family}.{front,back}.svg`), the gallery at
 * `dist/atlas/index.html`, and a `dist/atlas/manifest.json` with
 * version metadata.
 *
 * Run: pnpm build:atlas  (uses tsx to execute this .ts file directly)
 *
 * Convention:
 *   - Files containing { sources: [...] }     → merged into the sources Map.
 *   - Files containing { primitives: [...] } → appended to the primitive list.
 *   - Files containing { constants: [...] }  → backward-compat alias for primitives.
 *   - Anything else under _relations/ (e.g. README) is ignored.
 */

import { execSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { Primitive, PrimitiveFamily, Source } from '../src/atlas/types.js'
import { renderPrimitive, renderPrimitiveBack } from '../src/atlas/render/index.js'
import {
  renderGalleryHtml,
  type GlossaryFile,
  type SectionsFile,
} from '../src/atlas/render/gallery.js'
import { renderFamilyKeyCard } from '../src/atlas/render/key-card.js'
import type { BackRenderContext, RenderContext, RenderResult } from '../src/atlas/render/types.js'
import { ROOT, loadAtlasSeeds } from './atlas-seeds.js'

const OUT_DIR = resolve(ROOT, 'dist/atlas')
const IMG_DIR = resolve(OUT_DIR, 'img')

// v1.1: additive — sections.json + glossary.json + hidden-AI-cruft
// toggle. Existing readers of v1.0 manifests stay compatible.
const SCHEMA_VERSION = '1.1'

const DATA_DIR = resolve(ROOT, 'src/atlas/data')

/**
 * Read an authored JSON content file, returning `undefined` when the
 * file is absent or malformed. The atlas build must never fail because
 * the content agent is still drafting — instead the renderer falls
 * back to v2 family order.
 */
async function readOptionalJson<T>(path: string, label: string): Promise<T | undefined> {
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as T
  } catch (err: unknown) {
    const code = (err as { code?: string }).code
    if (code === 'ENOENT') {
      console.warn(`[atlas] ${label} not found at ${path}; falling back to v2 behavior.`)
      return undefined
    }
    console.warn(
      `[atlas] ${label} could not be parsed (${(err as Error).message}); using fallback.`,
    )
    return undefined
  }
}

function maxRetrievedAt(primitives: Primitive[], sources: Iterable<Source>): string {
  let max = ''
  for (const p of primitives) {
    if (p.retrievedAt && p.retrievedAt > max) max = p.retrievedAt
  }
  for (const s of sources) {
    if (s.retrievedAt && s.retrievedAt > max) max = s.retrievedAt
  }
  return max || 'unknown'
}

function readGitRev(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

async function main(): Promise<void> {
  const { sources, primitives } = await loadAtlasSeeds()
  const ctx: RenderContext = { sources }

  // De-duplicate primitives once so both passes (front/back, manifest) agree.
  const uniquePrimitives: Primitive[] = []
  const primitivesById = new Map<string, Primitive>()
  for (const p of primitives) {
    if (primitivesById.has(p.id)) continue
    primitivesById.set(p.id, p)
    uniquePrimitives.push(p)
  }

  const backCtx: BackRenderContext = { sources, primitives: primitivesById }

  await mkdir(IMG_DIR, { recursive: true })

  const results: RenderResult[] = []
  const familyCounts = new Map<PrimitiveFamily, number>()
  for (const p of uniquePrimitives) {
    const front = renderPrimitive(p, ctx)
    await writeFile(resolve(IMG_DIR, `${p.id}.svg`), front.svg, 'utf-8')

    const back = renderPrimitiveBack(p, backCtx)
    await writeFile(resolve(IMG_DIR, `${p.id}.back.svg`), back.svg, 'utf-8')

    results.push(front)
    familyCounts.set(p.family, (familyCounts.get(p.family) ?? 0) + 1)
  }

  // Emit a key card for each family that has at least one primitive.
  const KNOWN_FAMILIES: PrimitiveFamily[] = [
    'constant',
    'unit',
    'identity',
    'polytope',
    'coord-system',
    'lattice',
    'tiling',
    'curved-space',
    'symmetry-group',
    'special-function',
    'spectral-line',
    'energy-level',
    'element',
    'series',
    'transition-type',
  ]
  for (const family of KNOWN_FAMILIES) {
    const count = familyCounts.get(family) ?? 0
    if (count === 0) continue
    const { frontSvg, backSvg } = renderFamilyKeyCard(family, { count })
    await writeFile(resolve(IMG_DIR, `_key.${family}.front.svg`), frontSvg, 'utf-8')
    await writeFile(resolve(IMG_DIR, `_key.${family}.back.svg`), backSvg, 'utf-8')
  }

  const generatedAt = new Date().toISOString().replace('T', ' ').replace(/\..+$/, ' UTC')
  const seedDate = maxRetrievedAt(uniquePrimitives, sources.values())
  const gitRev = readGitRev()

  // Authored content for v3 pedagogical ordering. Both files are
  // optional — the renderer falls back to v2 family order when absent.
  const sections = await readOptionalJson<SectionsFile>(
    resolve(DATA_DIR, 'sections.json'),
    'sections.json',
  )
  const glossary = await readOptionalJson<GlossaryFile>(
    resolve(DATA_DIR, 'glossary.json'),
    'glossary.json',
  )

  const html = renderGalleryHtml(results, {
    generatedAt,
    totalPrimitives: results.length,
    totalSources: sources.size,
    schemaVersion: SCHEMA_VERSION,
    seedDate,
    gitRev,
    sections,
    glossary,
  })
  await writeFile(resolve(OUT_DIR, 'index.html'), html, 'utf-8')

  const manifest = {
    schema_version: SCHEMA_VERSION,
    seed_date: seedDate,
    git_rev: gitRev,
    built_at: new Date().toISOString(),
    primitives_total: results.length,
    families_total: familyCounts.size,
  }
  await writeFile(
    resolve(OUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8',
  )

  console.log(`[atlas] rendered ${results.length} primitives across ${familyCounts.size} families`)
  for (const [family, count] of [...familyCounts.entries()].sort()) {
    console.log(`  ${family.padEnd(20)} ${count}`)
  }
  console.log(`[atlas] gallery: ${resolve(OUT_DIR, 'index.html')}`)
  console.log(`[atlas] manifest: ${resolve(OUT_DIR, 'manifest.json')}`)
}

main().catch((err) => {
  console.error('[atlas] build failed:', err)
  process.exit(1)
})
