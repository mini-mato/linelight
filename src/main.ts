/**
 * linelight — lab bench entry (index.html).
 */

import './styles/shell.css'
import { createStore } from './store'
import { mountLab } from './app/mount-lab'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('linelight: #app mount missing from index.html')

const store = createStore(undefined, { withBrowserBindings: true })
mountLab(root, store)
