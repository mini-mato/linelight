import { readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Edge, Instance, Primitive, Source } from '../src/atlas/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(__dirname, '..')
export const SEED_DIR = resolve(ROOT, 'src/data/_relations')

type AnySeed = {
  sources?: Source[]
  primitives?: Primitive[]
  constants?: Primitive[]
  instances?: Instance[]
  edges?: Edge[]
}

export type AtlasSeeds = {
  sources: Map<string, Source>
  primitives: Primitive[]
  instances: Instance[]
  edges: Edge[]
  seedFileByPrimitiveId: Map<string, string>
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, 'utf-8')
  return JSON.parse(raw) as T
}

export async function loadAtlasSeeds(seedDir = SEED_DIR): Promise<AtlasSeeds> {
  const sources = new Map<string, Source>()
  const primitives: Primitive[] = []
  const instances: Instance[] = []
  const edges: Edge[] = []
  const seedFileByPrimitiveId = new Map<string, string>()

  const entries = await readdir(seedDir)
  const sortedEntries = entries
    .filter((entry) => entry.endsWith('.json'))
    .sort((a, b) => {
      const aIsSources = a.startsWith('sources')
      const bIsSources = b.startsWith('sources')
      if (aIsSources && !bIsSources) return -1
      if (!aIsSources && bIsSources) return 1
      return a.localeCompare(b)
    })

  for (const file of sortedEntries) {
    let data: AnySeed
    try {
      data = await readJson<AnySeed>(resolve(seedDir, file))
    } catch (err) {
      console.warn(`[atlas] skipping malformed JSON: ${file} (${(err as Error).message})`)
      continue
    }

    if (Array.isArray(data.sources)) {
      for (const source of data.sources) sources.set(source.id, source)
    }

    const filePrimitives = [
      ...(Array.isArray(data.primitives) ? data.primitives : []),
      ...(Array.isArray(data.constants) ? data.constants : []),
    ]
    for (const primitive of filePrimitives) {
      primitives.push(primitive)
      seedFileByPrimitiveId.set(primitive.id, file)
    }

    if (Array.isArray(data.instances)) instances.push(...data.instances)
    if (Array.isArray(data.edges)) edges.push(...data.edges)
  }

  return { sources, primitives, instances, edges, seedFileByPrimitiveId }
}
