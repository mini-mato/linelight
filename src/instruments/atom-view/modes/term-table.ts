/**
 * Atom View — term table mode.
 *
 * DOM-only renderer for the selected upper/lower term states. This module is
 * intentionally standalone so `main.ts` can mount it later without changing
 * the store contract.
 */

import type { Store } from '../../../store'
import type { State, TermState } from '../../../types'

type Role = 'upper' | 'lower'

export function formatTermEnergy(energy_eV: number): string {
  if (!Number.isFinite(energy_eV)) return 'schematic'
  return `${energy_eV.toFixed(3)} eV`
}

function createCell(text: string, field: string): HTMLTableCellElement {
  const cell = document.createElement('td')
  cell.dataset.termField = field
  cell.style.cssText = 'padding: 7px 8px; border-top: 1px solid #242424; vertical-align: top;'
  cell.textContent = text
  return cell
}

function createRoleCell(role: Role): HTMLTableCellElement {
  const cell = createCell('', `${role}-role`)
  const badge = document.createElement('span')
  badge.dataset.termActiveLabel = role
  badge.style.cssText = `
    display: inline-block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #8fbfe8;
    border: 1px solid rgba(143, 191, 232, 0.35);
    padding: 2px 5px;
  `
  badge.textContent = `${role} active`
  cell.appendChild(badge)
  return cell
}

function createHeaderCell(text: string): HTMLTableCellElement {
  const cell = document.createElement('th')
  cell.scope = 'col'
  cell.style.cssText =
    "padding: 0 8px 6px; text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #6b6b6b;"
  cell.textContent = text
  return cell
}

function termQuantumLabel(term: TermState): string {
  const mj = term.mJ === undefined ? '' : `, mJ=${term.mJ}`
  return `n=${term.n}, l=${term.l}, S=${term.s}, J=${term.j}${mj}`
}

function createRow(role: Role, term: TermState): HTMLTableRowElement {
  const row = document.createElement('tr')
  row.dataset.termRow = role
  row.dataset.termConfig = term.electronConfig
  row.dataset.termSymbol = term.termSymbol
  row.dataset.termEnergyEv = String(term.energy_eV)
  row.style.cssText = 'color: #d8d8d8;'

  row.appendChild(createRoleCell(role))
  row.appendChild(createCell(term.electronConfig, `${role}-config`))
  row.appendChild(createCell(term.termSymbol, `${role}-symbol`))
  row.appendChild(createCell(formatTermEnergy(term.energy_eV), `${role}-energy`))
  row.appendChild(createCell(termQuantumLabel(term), `${role}-quanta`))

  return row
}

function createLineSummary(state: State): HTMLDivElement {
  const summary = document.createElement('div')
  summary.dataset.termLineLabel = state.selection.line?.label ?? ''
  summary.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #cfcfcf;"

  if (state.selection.line) {
    summary.textContent = `line · ${state.selection.line.label} · ${state.selection.line.wavelength_nm.toFixed(3)} nm`
  } else {
    summary.textContent = 'line · none'
  }

  return summary
}

function render(root: HTMLElement, state: State): void {
  const header = document.createElement('div')
  header.style.cssText =
    'display: flex; justify-content: space-between; gap: 12px; align-items: baseline;'

  const title = document.createElement('div')
  title.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b;"
  title.textContent = 'instrument · atom view term table'

  const element = document.createElement('div')
  element.dataset.termElement = state.selection.element
  element.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #cfcfcf;"
  element.textContent = `element · ${state.selection.element}`

  header.appendChild(title)
  header.appendChild(element)

  const table = document.createElement('table')
  table.dataset.atomTermTable = 'true'
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    background: #101010;
    border: 1px solid #242424;
  `

  const head = document.createElement('thead')
  const headRow = document.createElement('tr')
  for (const column of ['state', 'config', 'term', 'energy', 'quanta']) {
    headRow.appendChild(createHeaderCell(column))
  }
  head.appendChild(headRow)

  const body = document.createElement('tbody')
  body.appendChild(createRow('upper', state.selection.upper))
  body.appendChild(createRow('lower', state.selection.lower))

  table.appendChild(head)
  table.appendChild(body)

  root.replaceChildren(header, createLineSummary(state), table)
}

export function mountAtomViewTermTable(container: HTMLElement, store: Store): () => void {
  const root = document.createElement('div')
  root.className = 'linelight-atomview-term-table'
  root.style.cssText = 'display: grid; gap: 10px; color: #d0d0d0;'
  container.appendChild(root)

  render(root, store.getState())
  const unsubscribe = store.subscribe((state) => render(root, state))

  return function teardown(): void {
    unsubscribe()
    root.remove()
  }
}
