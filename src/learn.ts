/**
 * Learn — 12-step Path derivation (standalone entry at learn.html).
 */

import './styles/shell.css'
import { createStore } from './store'
import { mountPath } from './instruments/path'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('linelight learn: #app missing')

const store = createStore(undefined, { withBrowserBindings: true })

root.innerHTML = `
  <header class="ll-header">
    <div class="ll-header__inner">
      <a class="ll-brand" href="./">linelight</a>
      <nav class="ll-nav" aria-label="linelight sections">
        <a href="./">Lab</a>
        <a href="./learn.html" aria-current="page">Learn</a>
        <a href="./atlas/">Atlas</a>
      </nav>
    </div>
  </header>
  <main class="ll-learn-main">
    <p class="ll-hero__lede" style="margin:0 0 20px">
      Twelve steps from Coulomb attraction to spectral lines as propagator poles.
      When you want hands-on instruments, open the <a href="./">hydrogen lab</a>.
    </p>
    <div id="path-mount"></div>
  </main>
`

const pathMount = root.querySelector<HTMLDivElement>('#path-mount')
if (!pathMount) throw new Error('linelight learn: path mount missing')

mountPath(pathMount, store)
