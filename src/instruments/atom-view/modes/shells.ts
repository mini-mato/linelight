/**
 * Atom View — shell occupancy mode.
 *
 * DOM-only renderer for compact K/L/M/N... shell diagrams. The parser is
 * intentionally conservative: it reads ordinary electron-configuration
 * fragments and expands bracketed noble-gas cores when the core is known.
 */

import type { Store } from '../../../store'
import type { State, TermState } from '../../../types'

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const SHELL_NAMES = ['', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'] as const
const MAX_PIPS_PER_SHELL = 24

const SUBSHELL_CAPACITY = {
  s: 2,
  p: 6,
  d: 10,
  f: 14,
  g: 18,
  h: 22,
  i: 26,
} as const

const CORE_CONFIGS: Readonly<Record<string, string>> = {
  He: '1s²',
  Ne: '1s² 2s² 2p⁶',
  Ar: '1s² 2s² 2p⁶ 3s² 3p⁶',
  Kr: '1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d¹⁰ 4p⁶',
  Xe: '1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d¹⁰ 4p⁶ 5s² 4d¹⁰ 5p⁶',
  Rn: '1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d¹⁰ 4p⁶ 5s² 4d¹⁰ 5p⁶ 6s² 4f¹⁴ 5d¹⁰ 6p⁶',
}

export type SubshellLetter = keyof typeof SUBSHELL_CAPACITY

export type SubshellOccupancy = {
  n: number
  letter: SubshellLetter
  electrons: number
  capacity: number
  token: string
}

export type ShellOccupancy = {
  n: number
  name: string
  electrons: number
  capacity: number
  subshells: readonly SubshellOccupancy[]
}

type Role = 'upper' | 'lower'

function shellName(n: number): string {
  return SHELL_NAMES[n] ?? `n=${n}`
}

function superscriptToAscii(raw: string): string {
  let out = ''
  for (const ch of raw) {
    const digit = SUPERSCRIPT_DIGITS.indexOf(ch)
    out += digit >= 0 ? String(digit) : ch
  }
  return out
}

function expandCores(config: string): string {
  return config.replace(/\[([A-Z][a-z]?)\]/g, (match, core: string) => {
    const expanded = CORE_CONFIGS[core]
    return expanded ? `${expanded} ` : match
  })
}

function parseElectronCount(
  asciiDigits: string | undefined,
  superscriptDigits: string | undefined,
): number {
  const raw = asciiDigits ?? (superscriptDigits ? superscriptToAscii(superscriptDigits) : undefined)
  if (!raw) return 1
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function addSubshell(
  byKey: Map<string, SubshellOccupancy>,
  n: number,
  letter: SubshellLetter,
  electrons: number,
  token: string,
): void {
  const key = `${n}${letter}`
  const existing = byKey.get(key)
  if (existing) {
    byKey.set(key, {
      ...existing,
      electrons: existing.electrons + electrons,
      token: `${existing.token} ${token}`,
    })
    return
  }

  byKey.set(key, {
    n,
    letter,
    electrons,
    capacity: SUBSHELL_CAPACITY[letter],
    token,
  })
}

export function parseElectronConfiguration(config: string): readonly ShellOccupancy[] {
  const byKey = new Map<string, SubshellOccupancy>()
  const expanded = expandCores(config)
  const tokenRe = /(\d+)\s*([spdfghi])(?:\^?(\d+)|([⁰¹²³⁴⁵⁶⁷⁸⁹]+))?/gi

  for (const match of expanded.matchAll(tokenRe)) {
    const n = Number.parseInt(match[1], 10)
    const letter = match[2].toLowerCase() as SubshellLetter
    if (!Number.isInteger(n) || n < 1 || SUBSHELL_CAPACITY[letter] === undefined) continue
    const electrons = parseElectronCount(match[3], match[4])
    addSubshell(byKey, n, letter, electrons, match[0].trim())
  }

  const byShell = new Map<number, SubshellOccupancy[]>()
  for (const subshell of byKey.values()) {
    const current = byShell.get(subshell.n) ?? []
    current.push(subshell)
    byShell.set(subshell.n, current)
  }

  return Array.from(byShell.entries())
    .sort(([a], [b]) => a - b)
    .map(([n, subshells]) => {
      const sortedSubshells = subshells.slice().sort((a, b) => a.letter.localeCompare(b.letter))
      return {
        n,
        name: shellName(n),
        electrons: sortedSubshells.reduce((sum, subshell) => sum + subshell.electrons, 0),
        capacity: 2 * n * n,
        subshells: sortedSubshells,
      }
    })
}

function formatSubshells(shell: ShellOccupancy): string {
  return shell.subshells
    .map((subshell) => `${subshell.n}${subshell.letter}${subshell.electrons}`)
    .join(' · ')
}

function createRing(shell: ShellOccupancy, index: number, total: number): HTMLDivElement {
  const ring = document.createElement('div')
  ring.dataset.shellRing = String(shell.n)
  ring.dataset.shellName = shell.name
  ring.dataset.shellElectrons = String(shell.electrons)
  ring.dataset.shellCapacity = String(shell.capacity)

  const size = 48 + index * 30
  const inset = (48 + (total - 1) * 30 - size) / 2
  const fraction = Math.max(0, Math.min(1, shell.electrons / shell.capacity))
  ring.style.cssText = `
    position: absolute;
    width: ${size}px;
    height: ${size}px;
    left: ${inset}px;
    top: ${inset}px;
    border-radius: 50%;
    border: 1px solid rgba(124, 132, 148, 0.75);
    background:
      radial-gradient(circle, rgba(255,255,255,0.05) 0 38%, transparent 39%),
      conic-gradient(rgba(115, 198, 255, 0.24) 0 ${fraction * 360}deg, transparent ${fraction * 360}deg 360deg);
    box-sizing: border-box;
  `

  const pipCount = Math.min(shell.electrons, MAX_PIPS_PER_SHELL)
  const center = size / 2
  const radius = size / 2
  for (let i = 0; i < pipCount; i += 1) {
    const pip = document.createElement('span')
    pip.dataset.electronPip = shell.name
    const angle = -Math.PI / 2 + (i / Math.max(1, pipCount)) * Math.PI * 2
    const x = center + Math.cos(angle) * radius - 3
    const y = center + Math.sin(angle) * radius - 3
    pip.style.cssText = `
      position: absolute;
      width: 6px;
      height: 6px;
      left: ${x}px;
      top: ${y}px;
      border-radius: 50%;
      background: #d8f3ff;
      box-shadow: 0 0 6px rgba(115, 198, 255, 0.75);
    `
    ring.appendChild(pip)
  }

  return ring
}

function createShellDiagram(shells: readonly ShellOccupancy[]): HTMLDivElement {
  const diagram = document.createElement('div')
  diagram.dataset.role = 'shell-diagram'

  if (shells.length === 0) {
    diagram.style.cssText =
      'display: grid; place-items: center; min-height: 96px; color: #777; font-size: 11px; border: 1px solid #242424;'
    diagram.textContent = 'configuration not parsed'
    return diagram
  }

  const size = 48 + (shells.length - 1) * 30
  diagram.style.cssText = `
    position: relative;
    width: ${size}px;
    height: ${size}px;
    min-width: ${size}px;
    margin: 0 auto;
  `

  shells
    .slice()
    .reverse()
    .forEach((shell, reverseIndex) => {
      const index = shells.length - reverseIndex - 1
      diagram.appendChild(createRing(shell, index, shells.length))
    })

  return diagram
}

function createLegend(shells: readonly ShellOccupancy[]): HTMLDivElement {
  const legend = document.createElement('div')
  legend.dataset.role = 'shell-legend'
  legend.style.cssText = 'display: grid; gap: 4px; min-width: 112px;'

  if (shells.length === 0) {
    const empty = document.createElement('div')
    empty.style.cssText = 'color: #777; font-size: 11px;'
    empty.textContent = 'no shell occupancy'
    legend.appendChild(empty)
    return legend
  }

  for (const shell of shells) {
    const row = document.createElement('div')
    row.dataset.shellLegend = shell.name
    row.style.cssText =
      'display: flex; justify-content: space-between; gap: 10px; font-size: 11px; color: #cfcfcf;'

    const label = document.createElement('span')
    label.textContent = `${shell.name} (${formatSubshells(shell)})`

    const count = document.createElement('span')
    count.dataset.shellLegendCount = shell.name
    count.style.cssText = "font-family: 'JetBrains Mono', monospace; color: #8fbfe8;"
    count.textContent = `${shell.electrons}/${shell.capacity}`

    row.appendChild(label)
    row.appendChild(count)
    legend.appendChild(row)
  }

  return legend
}

function createPanel(role: Role, element: string, term: TermState): HTMLElement {
  const shells = parseElectronConfiguration(term.electronConfig)
  const panel = document.createElement('section')
  panel.dataset.shellPanel = role
  panel.style.cssText = `
    display: grid;
    grid-template-columns: max-content minmax(112px, 1fr);
    gap: 12px;
    align-items: center;
    padding: 10px;
    border: 1px solid #242424;
    background: #101010;
  `

  const meta = document.createElement('div')
  meta.style.cssText =
    'grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 12px;'

  const label = document.createElement('div')
  label.dataset.shellActiveLabel = role
  label.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: #8fbfe8;"
  label.textContent = `${role} active`

  const config = document.createElement('div')
  config.dataset.shellConfig = role
  config.style.cssText = 'font-size: 12px; color: #d8d8d8;'
  config.textContent = `${element} ${term.electronConfig}`

  meta.appendChild(label)
  meta.appendChild(config)
  panel.appendChild(meta)
  panel.appendChild(createShellDiagram(shells))
  panel.appendChild(createLegend(shells))

  return panel
}

function render(root: HTMLElement, state: State): void {
  const header = document.createElement('div')
  header.style.cssText =
    'display: flex; justify-content: space-between; gap: 12px; align-items: baseline;'

  const title = document.createElement('div')
  title.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b;"
  title.textContent = 'instrument · atom view shells'

  const element = document.createElement('div')
  element.dataset.shellElement = state.selection.element
  element.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #cfcfcf;"
  element.textContent = `element · ${state.selection.element}`

  header.appendChild(title)
  header.appendChild(element)

  const grid = document.createElement('div')
  grid.style.cssText =
    'display: grid; grid-template-columns: repeat(2, minmax(210px, 1fr)); gap: 12px;'
  grid.appendChild(createPanel('upper', state.selection.element, state.selection.upper))
  grid.appendChild(createPanel('lower', state.selection.element, state.selection.lower))

  root.replaceChildren(header, grid)
}

export function mountAtomViewShells(container: HTMLElement, store: Store): () => void {
  const root = document.createElement('div')
  root.className = 'linelight-atomview-shells'
  root.style.cssText = 'display: grid; gap: 12px; color: #d0d0d0;'
  container.appendChild(root)

  render(root, store.getState())
  const unsubscribe = store.subscribe((state) => render(root, state))

  return function teardown(): void {
    unsubscribe()
    root.remove()
  }
}
