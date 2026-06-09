/**
 * Atlas gallery page generator — v3 (pedagogical reorder).
 *
 * Walks the rendered primitives and emits a single static HTML page.
 * v3 organises primitives into pedagogical Acts driven by an
 * authored `sections.json`; when that file is absent the page falls
 * back to the v2 family order so the build never breaks.
 *
 * The page is static HTML. The ONLY JavaScript in the file is a tiny
 * (≤5-line) inline reader that flips a `body.dev` class when
 * `?dev=1` is in the URL — used to reveal all `.ai-detail` content at
 * once. Everything else (per-card detail toggle, ToC highlighting,
 * glossary tooltips) is pure CSS.
 *
 * v1 cards remain two-sided: each card-cell stacks the front image
 * (img/{id}.svg) above the back image (img/{id}.back.svg). Each
 * family within an act leads with a "key card" whose front shows the
 * family glyph + label and whose back is a region legend.
 */

import type { PrimitiveFamily } from '../types.js'
import type { RenderResult } from './types.js'

/* ------------------------------------------------------------------ */
/* Authored content schemas (see content agent)                       */
/* ------------------------------------------------------------------ */

export type SectionsFile = {
  title: string
  subtitle: string
  intro: string
  acts: Act[]
  closing: { title: string; intro: string }
}

export type Act = {
  actNumber: number
  title: string
  subtitle: string
  intro: string
  families: FamilySection[]
}

export type FamilySection = {
  family: PrimitiveFamily
  sectionNumber: number
  title: string
  intro: string
  prereqs: string[]
  glossaryTerms: string[]
  primitiveOrder?: string[]
}

export type GlossaryFile = {
  entries: Record<string, GlossaryEntry>
}

export type GlossaryEntry = {
  term: string
  short: string
  long?: string
  source?: string
}

/* ------------------------------------------------------------------ */
/* Styling                                                            */
/* ------------------------------------------------------------------ */

const STYLE = `
  :root {
    --bg: #f7f6f1;
    --card-bg: #fdfdfd;
    --ink: #0e2a2f;
    --ink-soft: #4a6c70;
    --accent: #1a3a3f;
    --rule: #d8d3c1;
    --toc-w: 220px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--ink); }
  body { font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  a { color: inherit; }

  /* AI-cruft hidden by default; revealed per-card via the toggle, or
     globally via ?dev=1 which adds .dev to <body>. */
  .ai-detail { display: none; }
  body.dev .ai-detail { display: revert; }

  /* Layout: title page + closing page + acts use the same content
     column. The ToC is a sticky left rail on wide viewports only. */
  .layout { display: block; max-width: 1280px; margin: 0 auto; padding: 40px 32px 80px; }
  .layout-grid { display: block; }
  @media (min-width: 1024px) {
    .layout-grid {
      display: grid;
      grid-template-columns: var(--toc-w) 1fr;
      gap: 32px;
      align-items: start;
    }
  }
  .toc { display: none; }
  @media (min-width: 1024px) {
    .toc {
      display: block;
      position: sticky;
      top: 24px;
      align-self: start;
      max-height: calc(100vh - 48px);
      overflow-y: auto;
      font-size: 13px;
      color: var(--ink-soft);
      border-right: 1px solid var(--rule);
      padding-right: 16px;
    }
  }
  .toc h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--accent); margin: 0 0 8px; }
  .toc ol { list-style: none; margin: 0 0 16px; padding: 0; }
  .toc .toc-act { font-weight: 600; color: var(--ink); margin: 10px 0 4px; }
  .toc .toc-family { padding: 2px 0 2px 12px; }
  .toc a { text-decoration: none; color: inherit; }
  .toc a:hover { color: var(--accent); }
  .toc .toc-family:target,
  .toc a:target { color: var(--accent); font-weight: 600; }
  /* :target highlight: when the URL fragment matches a family section,
     a sibling-combinator rule colours its ToC entry. */

  .title-page, .closing-page { padding: 24px 0 48px; }
  .title-page h1 { font-size: 36px; font-weight: 600; margin: 0 0 4px; letter-spacing: 0.2px; }
  .title-page .subtitle { color: var(--ink-soft); font-size: 16px; margin: 0 0 20px; }
  .title-page .intro, .closing-page .intro { font-size: 16px; line-height: 1.6; max-width: 64ch; color: var(--ink); }
  .title-page .cta { margin-top: 24px; font-size: 13px; color: var(--ink-soft); font-family: ui-monospace, Menlo, monospace; }
  .closing-page h2 { font-size: 26px; font-weight: 600; margin: 0 0 12px; }
  .closing-page .meta-line { margin-top: 24px; font-size: 12px; color: var(--ink-soft); font-family: ui-monospace, Menlo, monospace; }

  .act { padding: 24px 0; border-top: 1px solid var(--rule); }
  .act .act-eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--ink-soft); margin: 0 0 4px; }
  .act h2 { font-size: 24px; font-weight: 600; color: var(--accent); margin: 0 0 4px; letter-spacing: 0.2px; }
  .act .act-subtitle { color: var(--ink-soft); font-size: 14px; margin: 0 0 12px; }
  .act .act-intro { max-width: 64ch; margin: 0 0 16px; }
  .act .prereqs { font-size: 12px; color: var(--ink-soft); font-family: ui-monospace, Menlo, monospace; margin: 0 0 16px; }
  .act .prereqs .prereqs-label { letter-spacing: 1.2px; text-transform: uppercase; margin-right: 6px; }

  .family { margin: 28px 0 8px; }
  .family h3 { font-size: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: var(--accent); margin: 0 0 6px; padding-bottom: 6px; border-bottom: 1px solid var(--rule); }
  .family h3 .section-number { color: var(--ink-soft); margin-right: 8px; font-weight: 500; }
  .family h3 .count { font-weight: 400; color: var(--ink-soft); }
  .family .family-intro { max-width: 64ch; margin: 0 0 14px; color: var(--ink); }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: 18px; }
  .card-cell {
    background: var(--card-bg);
    border-radius: 6px;
    box-shadow: 0 1px 2px rgba(14,42,47,0.06), 0 0 0 1px rgba(14,42,47,0.05);
    overflow: hidden;
    transition: box-shadow 120ms ease;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .card-cell:hover { box-shadow: 0 2px 8px rgba(14,42,47,0.12), 0 0 0 1px rgba(14,42,47,0.1); }
  .card-cell img, .card-cell svg { display: block; width: 100%; height: auto; }
  .card-cell .face-front, .card-cell .face-back { display: block; }
  .card-cell .face-divider { height: 0; border-top: 1px solid var(--rule); margin: 0; }
  .card-cell.is-key-card { background: #fafaf3; box-shadow: 0 1px 2px rgba(14,42,47,0.04), 0 0 0 1px rgba(91,140,90,0.25); }

  .card-foot { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--ink-soft); padding: 8px 12px; border-top: 1px solid var(--rule); display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .card-foot .card-symbol { white-space: nowrap; }
  .card-foot .card-detail-block { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .card-foot .id, .card-foot .retrieved, .card-foot .source-long { color: var(--ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }

  /* Per-card [i] toggle: a hidden checkbox toggles a sibling
     .card-detail-block's visibility. No JS. */
  .card-detail-toggle { position: absolute; opacity: 0; pointer-events: none; }
  .card-detail-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px; height: 18px;
    border: 1px solid var(--rule);
    border-radius: 3px;
    font: 500 11px ui-monospace, Menlo, monospace;
    color: var(--ink-soft);
    cursor: pointer;
    user-select: none;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  }
  .card-detail-label:hover { color: var(--accent); border-color: var(--accent); }
  .card-detail-toggle:checked ~ .card-foot .card-detail-label { background: var(--accent); color: #fdfdfd; border-color: var(--accent); }
  /* When the per-card checkbox is checked, reveal the .ai-detail
     elements inside this card's foot only. */
  .card-detail-toggle:checked ~ .card-foot .ai-detail { display: block; }

  .empty-family { color: var(--ink-soft); font-style: italic; padding: 20px 0; }

  /* Glossary tooltips: a hover-revealed floating panel positioned
     above the term. Pure CSS via :hover and an absolutely positioned
     child <span class="gloss-pop">. */
  .gloss {
    position: relative;
    border-bottom: 1px dotted var(--accent);
    cursor: help;
  }
  .gloss .gloss-pop {
    position: absolute;
    left: 0;
    bottom: calc(100% + 6px);
    background: var(--ink);
    color: #fdfdfd;
    padding: 8px 10px;
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.4;
    width: max-content;
    max-width: 280px;
    box-shadow: 0 2px 8px rgba(14,42,47,0.25);
    opacity: 0;
    visibility: hidden;
    transition: opacity 120ms ease;
    z-index: 10;
    pointer-events: none;
  }
  .gloss .gloss-pop strong { display: block; color: #fdfdfd; margin-bottom: 2px; font-size: 11px; letter-spacing: 0.4px; }
  .gloss .gloss-pop .gloss-long { display: block; margin-top: 4px; color: rgba(253,253,253,0.85); }
  .gloss:hover .gloss-pop, .gloss:focus-within .gloss-pop { opacity: 1; visibility: visible; }

  footer { margin-top: 60px; padding-top: 16px; border-top: 1px solid var(--rule); color: var(--ink-soft); font-size: 12px; }
  footer a { color: var(--ink-soft); }

  @media (max-width: 480px) {
    .layout { padding: 28px 16px 56px; }
    .title-page h1 { font-size: 28px; }
    .act h2 { font-size: 20px; }
    .card-foot { align-items: flex-start; flex-direction: column; }
  }
`

/* ------------------------------------------------------------------ */
/* Tiny script: ONLY JavaScript in the whole atlas page               */
/* ------------------------------------------------------------------ */

// Reads ?dev=1 and adds `.dev` to <body>. Five-ish lines, no
// framework, no external deps. Documented per spec E.
const DEV_FLAG_SCRIPT = `
  // ai-detail visibility: ?dev=1 reveals all .ai-detail at once.
  try {
    var p = new URLSearchParams(window.location.search);
    if (p.get('dev') === '1') document.body.classList.add('dev');
  } catch (e) { /* old browser; ignore */ }
`

/* ------------------------------------------------------------------ */
/* Family labels + fallback v2 order                                  */
/* ------------------------------------------------------------------ */

const FALLBACK_FAMILY_ORDER: readonly PrimitiveFamily[] = [
  'constant',
  'unit',
  'identity',
  'special-function',
  'spectral-line',
  'energy-level',
  'element',
  'series',
  'transition-type',
  'polytope',
  'coord-system',
  'lattice',
  'tiling',
  'curved-space',
  'symmetry-group',
] as const

const FAMILY_LABEL: Record<string, string> = {
  constant: 'Fundamental constants',
  unit: 'Units',
  identity: 'Identities',
  'special-function': 'Special functions',
  'spectral-line': 'Spectral lines',
  'energy-level': 'Energy levels',
  element: 'Elements',
  series: 'Series',
  'transition-type': 'Transition types',
  polytope: 'Polytopes',
  'coord-system': 'Coordinate systems',
  lattice: 'Lattices',
  tiling: 'Tilings',
  'curved-space': 'Curved spaces',
  'symmetry-group': 'Symmetry groups',
}

/* ------------------------------------------------------------------ */
/* Options                                                            */
/* ------------------------------------------------------------------ */

export type GalleryOptions = {
  generatedAt: string
  totalPrimitives: number
  totalSources: number
  /** Atlas schema/format version, surfaced in the version footer line. */
  schemaVersion: string
  /** Max retrievedAt across all loaded seeds. */
  seedDate: string
  /** Short git rev (or "unknown" when not in a repo). */
  gitRev: string
  /** Authored pedagogical content; falls back to v2 family order when absent. */
  sections?: SectionsFile
  /** Authored glossary; tooltips degrade to bold styling when absent. */
  glossary?: GlossaryFile
}

/* ------------------------------------------------------------------ */
/* Card rendering                                                     */
/* ------------------------------------------------------------------ */

function renderCardCell(opts: {
  frontHref: string
  backHref: string
  alt: string
  symbol: string
  idLabel: string
  family: string
  sourceId?: string
  sourceLabel?: string
  retrievedAt?: string
  toggleId: string
  isKey?: boolean
}): string {
  const klass = opts.isKey ? 'card-cell is-key-card' : 'card-cell'
  // Hidden detail block exposes every piece of provenance in HTML so it
  // is ⌘-F-searchable and queryable from devtools, while staying
  // invisible by default. data-* attributes mirror the same info.
  const dataAttrs = [
    `data-primitive-id="${escapeAttr(opts.idLabel)}"`,
    `data-family="${escapeAttr(opts.family)}"`,
    opts.sourceId ? `data-source-id="${escapeAttr(opts.sourceId)}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const detailLines: string[] = []
  detailLines.push(
    `<span class="id ai-detail" title="${escapeAttr(opts.idLabel)}">${escapeText(opts.idLabel)}</span>`,
  )
  if (opts.sourceLabel) {
    detailLines.push(`<span class="source-long ai-detail">${escapeText(opts.sourceLabel)}</span>`)
  }
  if (opts.retrievedAt) {
    detailLines.push(
      `<span class="retrieved ai-detail">retrieved ${escapeText(opts.retrievedAt)}</span>`,
    )
  }
  return `
      <div class="${klass}" ${dataAttrs}>
        <input class="card-detail-toggle" type="checkbox" id="${escapeAttr(opts.toggleId)}" />
        <img class="face-front" src="${escapeAttr(opts.frontHref)}" alt="${escapeAttr(opts.alt)} (front)" width="480" height="240" loading="lazy" />
        <hr class="face-divider" />
        <img class="face-back" src="${escapeAttr(opts.backHref)}" alt="${escapeAttr(opts.alt)} (back)" width="480" height="240" loading="lazy" />
        <div class="card-foot">
          <span class="card-symbol">${escapeText(opts.symbol)}</span>
          <span class="card-detail-block">
            ${detailLines.join('\n            ')}
          </span>
          <label class="card-detail-label" for="${escapeAttr(opts.toggleId)}" title="show / hide identifiers">i</label>
        </div>
      </div>`
}

/* ------------------------------------------------------------------ */
/* Glossary tooltip rewriter                                          */
/* ------------------------------------------------------------------ */

/**
 * Replace `**term-key**` markdown bolds with glossary tooltip spans.
 * When the term key is absent from the glossary, fall back to a plain
 * `<strong>` so the bold survives but no tooltip renders.
 */
function applyGlossary(text: string, glossary?: GlossaryFile): string {
  // Split-and-rejoin so we escape the non-bold portions but emit raw
  // HTML for the matched spans.
  const parts: string[] = []
  let cursor = 0
  const re = /\*\*([^*]+)\*\*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) parts.push(escapeText(text.slice(cursor, m.index)))
    const key = m[1].trim()
    const entry = glossary?.entries[key]
    if (entry) {
      const long = entry.long ? `<span class="gloss-long">${escapeText(entry.long)}</span>` : ''
      parts.push(
        `<span class="gloss" data-term="${escapeAttr(key)}" tabindex="0">${escapeText(entry.term)}<span class="gloss-pop" role="tooltip"><strong>${escapeText(entry.term)}</strong>${escapeText(entry.short)}${long}</span></span>`,
      )
    } else {
      parts.push(`<strong>${escapeText(key)}</strong>`)
    }
    cursor = m.index + m[0].length
  }
  if (cursor < text.length) parts.push(escapeText(text.slice(cursor)))
  return parts.join('')
}

/* ------------------------------------------------------------------ */
/* Order resolution                                                   */
/* ------------------------------------------------------------------ */

type ResolvedFamilyOrder = {
  family: PrimitiveFamily
  section?: FamilySection
  actNumber?: number
}[]

/**
 * Compute the family rendering order. When `sections` is present and
 * well-formed, families render in the order they appear across acts.
 * When absent or malformed, we fall back to the v2 hardcoded order.
 */
function resolveOrder(sections?: SectionsFile): {
  ordered: ResolvedFamilyOrder
  usedSections: boolean
} {
  if (!sections || !Array.isArray(sections.acts)) {
    if (sections) {
      console.warn(
        '[atlas] sections.json missing or malformed `acts` array; falling back to v2 family order.',
      )
    }
    return {
      ordered: FALLBACK_FAMILY_ORDER.map((family) => ({ family })),
      usedSections: false,
    }
  }
  const ordered: ResolvedFamilyOrder = []
  const seen = new Set<PrimitiveFamily>()
  for (const act of sections.acts) {
    if (!Array.isArray(act.families)) continue
    for (const fam of act.families) {
      if (!fam || !fam.family || seen.has(fam.family)) continue
      seen.add(fam.family)
      ordered.push({ family: fam.family, section: fam, actNumber: act.actNumber })
    }
  }
  // Any family not mentioned by sections.json still renders, at the
  // tail in v2 order, so the gallery never silently loses primitives.
  for (const family of FALLBACK_FAMILY_ORDER) {
    if (!seen.has(family)) ordered.push({ family })
  }
  return { ordered, usedSections: true }
}

/* ------------------------------------------------------------------ */
/* Main entrypoint                                                    */
/* ------------------------------------------------------------------ */

export function renderGalleryHtml(results: RenderResult[], opts: GalleryOptions): string {
  const byFamily = new Map<PrimitiveFamily, RenderResult[]>()
  for (const r of results) {
    if (!byFamily.has(r.family)) byFamily.set(r.family, [])
    byFamily.get(r.family)!.push(r)
  }

  const { ordered, usedSections } = resolveOrder(opts.sections)

  // Pre-index sections by actNumber so we can group families by act.
  const familyToSection = new Map<PrimitiveFamily, FamilySection>()
  for (const entry of ordered) {
    if (entry.section) familyToSection.set(entry.family, entry.section)
  }

  /* ToC */
  const tocActs: string[] = []
  if (usedSections && opts.sections) {
    for (const act of opts.sections.acts) {
      const familyLinks = (act.families ?? [])
        .filter((fs) => (byFamily.get(fs.family)?.length ?? 0) > 0)
        .map(
          (fs) =>
            `<li class="toc-family"><a href="#section-${fs.sectionNumber}">${escapeText(String(fs.sectionNumber))}. ${escapeText(fs.title)}</a></li>`,
        )
        .join('')
      tocActs.push(
        `<li class="toc-act"><a href="#act-${act.actNumber}">Act ${escapeText(String(act.actNumber))}. ${escapeText(act.title)}</a></li>${familyLinks}`,
      )
    }
  } else {
    // Fallback ToC: list families only, in v2 order.
    let n = 0
    for (const entry of ordered) {
      const items = byFamily.get(entry.family)
      if (!items || items.length === 0) continue
      n += 1
      tocActs.push(
        `<li class="toc-family"><a href="#section-${n}">${escapeText(String(n))}. ${escapeText(FAMILY_LABEL[entry.family] ?? entry.family)}</a></li>`,
      )
    }
  }
  const tocHtml = `
    <nav class="toc" aria-label="Table of contents">
      <h3>Contents</h3>
      <ol>${tocActs.join('')}</ol>
    </nav>`

  /* Title page */
  const titleHtml = renderTitlePage(opts)

  /* Acts + families */
  let toggleSeq = 0
  const actHtml: string[] = []
  if (usedSections && opts.sections) {
    for (const act of opts.sections.acts) {
      const familiesHtml: string[] = []
      for (const fs of act.families ?? []) {
        const items = byFamily.get(fs.family)
        if (!items || items.length === 0) continue
        familiesHtml.push(renderFamilySection(fs, items, opts, () => `card-toggle-${toggleSeq++}`))
      }
      if (familiesHtml.length === 0) continue
      const prereqs = act.families.flatMap((f) => f.prereqs ?? [])
      const prereqsLine =
        prereqs.length > 0
          ? `<p class="prereqs"><span class="prereqs-label">prereqs</span>${escapeText(Array.from(new Set(prereqs)).join(', '))}</p>`
          : ''
      actHtml.push(`
    <section class="act act--${act.actNumber}" id="act-${escapeAttr(String(act.actNumber))}">
      <p class="act-eyebrow">Act ${escapeText(String(act.actNumber))}</p>
      <h2>${escapeText(act.title)}</h2>
      <p class="act-subtitle">${escapeText(act.subtitle ?? '')}</p>
      <div class="act-intro">${applyGlossary(act.intro ?? '', opts.glossary)}</div>
      ${prereqsLine}
      ${familiesHtml.join('\n')}
    </section>`)
    }
  } else {
    // Fallback: synthesize a single "act" wrapper-less rendering.
    let n = 0
    const familiesHtml: string[] = []
    for (const entry of ordered) {
      const items = byFamily.get(entry.family)
      if (!items || items.length === 0) continue
      n += 1
      familiesHtml.push(
        renderFamilySectionFallback(entry.family, n, items, () => `card-toggle-${toggleSeq++}`),
      )
    }
    actHtml.push(`<section class="act act--fallback">${familiesHtml.join('\n')}</section>`)
  }

  /* Closing page */
  const closingHtml = renderClosingPage(opts)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>linelight atlas — primitive gallery</title>
<style>${STYLE}</style>
</head>
<body>
<script>${DEV_FLAG_SCRIPT}</script>
<div class="layout">
  <div class="layout-grid">
    ${tocHtml}
    <main>
      ${titleHtml}
      ${actHtml.join('\n')}
      ${closingHtml}
      <p class="ai-detail" style="margin-top:24px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--ink-soft);">
        atlas v${escapeText(opts.schemaVersion)} · seed ${escapeText(opts.seedDate)} · build ${escapeText(opts.gitRev)}
      </p>
      <footer>
        ${opts.totalPrimitives} primitives across ${byFamily.size} ${byFamily.size === 1 ? 'family' : 'families'} · ${opts.totalSources} sources · generated ${escapeText(opts.generatedAt)}
        <span class="ai-detail"> · Schema: <a href="../../src/atlas/schema.sql" rel="noopener">src/atlas/schema.sql</a> · Decision-of-record: kb/linelight/wiki/decisions/2026-05-04-atlas-schema.md.</span>
      </footer>
    </main>
  </div>
</div>
</body>
</html>
`
}

function renderTitlePage(opts: GalleryOptions): string {
  const title = opts.sections?.title ?? 'linelight atlas'
  const subtitle = opts.sections?.subtitle ?? 'Physics & geometry primitives, with provenance.'
  const intro = opts.sections?.intro
  return `
      <section class="title-page" id="title">
        <h1>${escapeText(title)}</h1>
        <p class="subtitle">${escapeText(subtitle)}</p>
        ${intro ? `<div class="intro">${applyGlossary(intro, opts.glossary)}</div>` : ''}
        <p class="cta">start at section 1 below ↓</p>
      </section>`
}

function renderClosingPage(opts: GalleryOptions): string {
  if (!opts.sections?.closing) return ''
  const closing = opts.sections.closing
  return `
      <section class="closing-page" id="closing">
        <h2>${escapeText(closing.title ?? "What you've seen")}</h2>
        ${closing.intro ? `<div class="intro">${applyGlossary(closing.intro, opts.glossary)}</div>` : ''}
        <p class="meta-line">schema v${escapeText(opts.schemaVersion)} · seed ${escapeText(opts.seedDate)} · build ${escapeText(opts.gitRev)}</p>
      </section>`
}

function renderFamilySection(
  fs: FamilySection,
  items: RenderResult[],
  opts: GalleryOptions,
  nextToggleId: () => string,
): string {
  // Order primitives: explicit primitiveOrder first, then alphabetical.
  const sorted = [...items]
  if (fs.primitiveOrder && fs.primitiveOrder.length > 0) {
    const idx = new Map<string, number>()
    fs.primitiveOrder.forEach((id, i) => idx.set(id, i))
    sorted.sort((a, b) => {
      const ai = idx.get(a.primitiveId)
      const bi = idx.get(b.primitiveId)
      if (ai !== undefined && bi !== undefined) return ai - bi
      if (ai !== undefined) return -1
      if (bi !== undefined) return 1
      return a.primitiveId.localeCompare(b.primitiveId)
    })
  } else {
    sorted.sort((a, b) => a.primitiveId.localeCompare(b.primitiveId))
  }

  const familyLabel = FAMILY_LABEL[fs.family] ?? fs.family
  const keyCard = renderCardCell({
    frontHref: `img/_key.${fs.family}.front.svg`,
    backHref: `img/_key.${fs.family}.back.svg`,
    alt: `${familyLabel} key`,
    symbol: '◇ key',
    idLabel: `_key.${fs.family}`,
    family: fs.family,
    toggleId: nextToggleId(),
    isKey: true,
  })
  const cards = sorted.map((r) =>
    renderCardCell({
      frontHref: r.thumbnailHref,
      backHref: `img/${r.primitiveId}.back.svg`,
      alt: r.name,
      symbol: r.symbol ?? '',
      idLabel: r.primitiveId,
      family: r.family,
      sourceId: r.sourceId,
      sourceLabel: r.sourceCitation,
      retrievedAt: r.retrievedAt,
      toggleId: nextToggleId(),
    }),
  )
  return `
      <section class="family family--${escapeAttr(fs.family)}" id="section-${escapeAttr(String(fs.sectionNumber))}">
        <h3><span class="section-number">${escapeText(String(fs.sectionNumber))}.</span>${escapeText(fs.title)} <span class="count">(${sorted.length})</span></h3>
        ${fs.intro ? `<div class="family-intro">${applyGlossary(fs.intro, opts.glossary)}</div>` : ''}
        <div class="grid">${keyCard}${cards.join('')}</div>
      </section>`
}

function renderFamilySectionFallback(
  family: PrimitiveFamily,
  sectionNumber: number,
  items: RenderResult[],
  nextToggleId: () => string,
): string {
  const sorted = [...items].sort((a, b) => a.primitiveId.localeCompare(b.primitiveId))
  const familyLabel = FAMILY_LABEL[family] ?? family
  const keyCard = renderCardCell({
    frontHref: `img/_key.${family}.front.svg`,
    backHref: `img/_key.${family}.back.svg`,
    alt: `${familyLabel} key`,
    symbol: '◇ key',
    idLabel: `_key.${family}`,
    family,
    toggleId: nextToggleId(),
    isKey: true,
  })
  const cards = sorted.map((r) =>
    renderCardCell({
      frontHref: r.thumbnailHref,
      backHref: `img/${r.primitiveId}.back.svg`,
      alt: r.name,
      symbol: r.symbol ?? '',
      idLabel: r.primitiveId,
      family: r.family,
      sourceId: r.sourceId,
      sourceLabel: r.sourceCitation,
      retrievedAt: r.retrievedAt,
      toggleId: nextToggleId(),
    }),
  )
  return `
      <section class="family family--${escapeAttr(family)}" id="section-${escapeAttr(String(sectionNumber))}">
        <h3><span class="section-number">${escapeText(String(sectionNumber))}.</span>${escapeText(familyLabel)} <span class="count">(${sorted.length})</span></h3>
        <div class="grid">${keyCard}${cards.join('')}</div>
      </section>`
}

/* ------------------------------------------------------------------ */
/* Escape helpers                                                     */
/* ------------------------------------------------------------------ */

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;')
}
