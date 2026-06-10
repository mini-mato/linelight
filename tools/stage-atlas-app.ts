/**
 * Copy the interactive atlas-app bundle to dist/atlas/ for deployment at
 * /linelight/atlas/ while preserving dist/atlas/img/ from build:atlas.
 */

import { cp, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = resolve(ROOT, 'dist/atlas-app')
const DEST = resolve(ROOT, 'dist/atlas')

const FILES = ['index.html', 'app.js', 'app.css', 'seed.json', 'manifest.json'] as const

async function main(): Promise<void> {
  if (!existsSync(SRC)) {
    throw new Error('stage-atlas-app: dist/atlas-app missing — run pnpm build:atlas-app first')
  }
  await mkdir(DEST, { recursive: true })
  for (const file of FILES) {
    const from = resolve(SRC, file)
    if (!existsSync(from)) {
      console.warn(`[stage-atlas-app] skip missing ${file}`)
      continue
    }
    await cp(from, resolve(DEST, file))
  }
  // Copy any hashed chunks vite may emit beside app.js.
  const { readdir } = await import('node:fs/promises')
  for (const entry of await readdir(SRC)) {
    if (FILES.includes(entry as (typeof FILES)[number])) continue
    if (/^app-.*\.js$/.test(entry)) {
      await cp(resolve(SRC, entry), resolve(DEST, entry))
    }
  }
  console.log('[stage-atlas-app] interactive atlas staged at dist/atlas/')
}

main().catch((err) => {
  console.error('[stage-atlas-app] failed:', err)
  process.exit(1)
})
