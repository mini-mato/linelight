/**
 * One side of the dual-pane Atom View 3D.
 *
 * A pane owns:
 *   • A canvas + WebGLRenderer (or a stub if WebGL is unavailable, e.g. JSDOM).
 *   • A scene, perspective camera, OrbitControls.
 *   • Two render branches:
 *       - 'volumetric'  → BoxGeometry + RawShaderMaterial raymarcher.
 *       - 'iso-surface' → two MarchingCubes meshes (red +iso, blue −iso).
 *   • A render-on-demand loop driven by OrbitControls' change events.
 *
 * The pane reads from a `TermStateRef`-shaped object so the host can switch
 * which selection (`upper` / `lower`) feeds it. On selection or quanta change
 * the pane rebuilds the ψ grid, the Data3DTexture, and the iso-surface field.
 *
 * Teardown disposes every WebGL resource it owns and removes the canvas.
 */

import {
  BoxGeometry,
  Color,
  Data3DTexture,
  FloatType,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  RawShaderMaterial,
  RedFormat,
  Scene,
  Vector3,
  WebGLRenderer,
  ClampToEdgeWrapping,
  GLSL3,
  BackSide,
  DoubleSide,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js'
import { buildPsiGrid3D, GRID_RESOLUTION_3D, type PsiGrid3D, type Quanta } from './grid'
import { ALPHA_GAMMA, DENSITY_SCALE, NEG_COLOR, POS_COLOR } from './colormap'
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders'

/** Per-pane render mode. Default is volumetric. */
export type PaneMode = 'volumetric' | 'iso-surface'

/** What the pane needs to render — pure inputs, no DOM coupling. */
export type PaneInput = {
  quanta: Quanta
  halfExtent_Bohr: number
  /** Caption text (state label, element, term symbol, energy). */
  caption: string
}

/** Default iso-surface tuning — fraction of peak |ψ| at which to draw shells. */
const DEFAULT_ISO_THRESHOLD_FRACTION = 0.2
const MIN_ISO_THRESHOLD_FRACTION = 0.02
const MAX_ISO_THRESHOLD_FRACTION = 0.5
const ISO_THRESHOLD_STEP = 0.01

/** MarchingCubes resolution — coarser than the volumetric grid (mc.update is O(res³)). */
const ISO_RESOLUTION = 64

/** Default volumetric march step count — see research memo §6. */
const VOLUMETRIC_STEPS = 128

export type Pane = {
  /** The host element, owned by the pane. Removed on teardown. */
  root: HTMLDivElement
  canvas: HTMLCanvasElement
  /** True when WebGL was actually available — false in JSDOM/headless. */
  hasGL: boolean
  setMode: (mode: PaneMode) => void
  setInput: (input: PaneInput) => void
  /** Camera view sync hook — copy quaternion+position+target from `other`. */
  syncFrom: (other: Pane) => void
  getCameraSnapshot: () => CameraSnapshot
  applyCameraSnapshot: (snap: CameraSnapshot) => void
  requestRender: () => void
  dispose: () => void
}

export type CameraSnapshot = {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  target: [number, number, number]
}

export type PaneOptions = {
  /** CSS pixel size of the canvas. Default 480. */
  size?: number
  /** Initial mode. Default 'volumetric'. */
  initialMode?: PaneMode
  /** Initial pane input. */
  initialInput: PaneInput
  /** Called any time the user moves the camera (so the host can sync if linked). */
  onCameraChange?: (snap: CameraSnapshot) => void
}

/**
 * Try to construct a WebGLRenderer. JSDOM has no WebGL, so we want this to
 * fail gracefully — the rest of the pane (DOM, captions) should still mount.
 *
 * We probe `getContext('webgl2')` first and silently bail if the environment
 * doesn't actually support it — this avoids JSDOM's `not-implemented` warning
 * spam during tests, while still letting the real-browser path run normally.
 */
function tryCreateRenderer(canvas: HTMLCanvasElement): WebGLRenderer | null {
  // Skip outright in JSDOM-style environments: their `getContext` stub writes
  // a "not implemented" line to stderr regardless of try/catch, polluting
  // test output. The User-Agent string is the cheapest reliable signal.
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.userAgent === 'string' &&
    navigator.userAgent.toLowerCase().includes('jsdom')
  ) {
    return null
  }

  let probe: RenderingContext | null = null
  try {
    if (typeof canvas.getContext !== 'function') return null
    probe = canvas.getContext('webgl2') as RenderingContext | null
  } catch {
    return null
  }
  if (!probe) return null
  try {
    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      context: probe as WebGL2RenderingContext,
    })
    renderer.setPixelRatio(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    renderer.setClearColor(0x0a0a0a, 1)
    return renderer
  } catch {
    return null
  }
}

/**
 * Upload a signed ψ grid as a Three.js `Data3DTexture` (RedFormat, FloatType).
 * Returns the texture; caller is responsible for disposing it.
 */
function gridToTexture3D(grid: PsiGrid3D): Data3DTexture {
  // TS 5.7 generic-narrowed Float32Array<ArrayBufferLike> doesn't satisfy
  // Data3DTexture's `BufferSource` (ArrayBuffer-strict) parameter type.
  // The runtime is identical; cast through `unknown` at this boundary only.
  const tex = new Data3DTexture(grid.field as unknown as BufferSource, grid.N, grid.N, grid.N)
  tex.format = RedFormat
  tex.type = FloatType
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.wrapS = ClampToEdgeWrapping
  tex.wrapT = ClampToEdgeWrapping
  tex.wrapR = ClampToEdgeWrapping
  tex.unpackAlignment = 1
  tex.needsUpdate = true
  return tex
}

/**
 * Write |ψ|² (positive iso) or −|ψ|·sign(ψ) trick into a MarchingCubes field.
 *
 * For the +ψ shell we want cells where ψ ≥ +iso, so we write `psi`.
 * For the −ψ shell we want cells where ψ ≤ −iso, so we write `−psi` and
 * use the same `mc.isolation` value — that flips which lobe gets meshed.
 *
 * We resample the source N³ grid into mcRes³ via nearest-neighbor (cheap,
 * and the mc resolution is the limiting factor anyway).
 */
function writeMarchingCubesField(mc: MarchingCubes, grid: PsiGrid3D, signFlip: boolean): void {
  const N = grid.N
  const M = mc.size
  for (let kz = 0; kz < M; kz++) {
    const sz = Math.min(N - 1, Math.floor((kz / M) * N))
    for (let ky = 0; ky < M; ky++) {
      const sy = Math.min(N - 1, Math.floor((ky / M) * N))
      for (let kx = 0; kx < M; kx++) {
        const sx = Math.min(N - 1, Math.floor((kx / M) * N))
        const v = grid.field[sz * N * N + sy * N + sx]
        const dst = kz * M * M + ky * M + kx
        mc.field[dst] = signFlip ? -v : v
      }
    }
  }
}

/**
 * Build (or rebuild) one pane's GL state from a freshly-sampled grid.
 * Pure side-effect — mutates the references on `state`.
 */
type GLState = {
  scene: Scene
  camera: PerspectiveCamera
  controls: OrbitControls
  renderer: WebGLRenderer
  // Volumetric.
  volMesh: Mesh<BoxGeometry, RawShaderMaterial> | null
  volTexture: Data3DTexture | null
  // Iso-surface.
  isoGroup: Group | null
  isoPos: MarchingCubes | null
  isoNeg: MarchingCubes | null
  // Mode tracker.
  currentMode: PaneMode
}

function rebuildVolumetric(state: GLState, grid: PsiGrid3D): void {
  // Tear down previous volumetric resources.
  if (state.volMesh) {
    state.scene.remove(state.volMesh)
    state.volMesh.geometry.dispose()
    state.volMesh.material.dispose()
    state.volMesh = null
  }
  if (state.volTexture) {
    state.volTexture.dispose()
    state.volTexture = null
  }

  const tex = gridToTexture3D(grid)
  const side = 2 * grid.halfExtent_Bohr
  const geom = new BoxGeometry(side, side, side)
  const mat = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: BackSide,
    uniforms: {
      uPsi: { value: tex },
      uPeakAbs: { value: grid.peakAbs },
      uHalfExtent: { value: grid.halfExtent_Bohr },
      uCameraPosObj: { value: new Vector3() },
      uSteps: { value: VOLUMETRIC_STEPS },
      uDensityScale: { value: DENSITY_SCALE },
      uAlphaGamma: { value: ALPHA_GAMMA },
      uPosColor: { value: new Vector3(POS_COLOR.r, POS_COLOR.g, POS_COLOR.b) },
      uNegColor: { value: new Vector3(NEG_COLOR.r, NEG_COLOR.g, NEG_COLOR.b) },
    },
  })
  const mesh = new Mesh(geom, mat)
  mesh.frustumCulled = false
  state.volMesh = mesh
  state.volTexture = tex
  if (state.currentMode === 'volumetric') state.scene.add(mesh)
}

function clampIsoThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ISO_THRESHOLD_FRACTION
  return Math.min(MAX_ISO_THRESHOLD_FRACTION, Math.max(MIN_ISO_THRESHOLD_FRACTION, value))
}

function formatIsoThreshold(value: number): string {
  return value.toFixed(2)
}

function rebuildIsoSurface(state: GLState, grid: PsiGrid3D, isoThresholdFraction: number): void {
  if (state.isoGroup) {
    state.scene.remove(state.isoGroup)
    if (state.isoPos) {
      ;(state.isoPos.material as MeshBasicMaterial).dispose()
      state.isoPos.geometry.dispose()
    }
    if (state.isoNeg) {
      ;(state.isoNeg.material as MeshBasicMaterial).dispose()
      state.isoNeg.geometry.dispose()
    }
    state.isoGroup = null
    state.isoPos = null
    state.isoNeg = null
  }

  const isoLevel = isoThresholdFraction * grid.peakAbs
  const matPos = new MeshBasicMaterial({
    color: new Color(POS_COLOR.r, POS_COLOR.g, POS_COLOR.b),
    transparent: true,
    opacity: 0.85,
    side: DoubleSide,
  })
  const matNeg = new MeshBasicMaterial({
    color: new Color(NEG_COLOR.r, NEG_COLOR.g, NEG_COLOR.b),
    transparent: true,
    opacity: 0.85,
    side: DoubleSide,
  })

  const side = 2 * grid.halfExtent_Bohr

  const mcPos = new MarchingCubes(ISO_RESOLUTION, matPos, false, false, 200000)
  mcPos.isolation = isoLevel
  mcPos.scale.setScalar(side / 2)
  writeMarchingCubesField(mcPos, grid, false)
  mcPos.update()

  const mcNeg = new MarchingCubes(ISO_RESOLUTION, matNeg, false, false, 200000)
  mcNeg.isolation = isoLevel
  mcNeg.scale.setScalar(side / 2)
  writeMarchingCubesField(mcNeg, grid, true)
  mcNeg.update()

  const group = new Group()
  group.add(mcPos)
  group.add(mcNeg)
  state.isoGroup = group
  state.isoPos = mcPos
  state.isoNeg = mcNeg
  if (state.currentMode === 'iso-surface') state.scene.add(group)
}

/**
 * Mount one pane (DOM + GL) into a freshly-created div.
 * The returned object owns its DOM root — the host appends `pane.root`.
 */
export function createPane(opts: PaneOptions): Pane {
  const size = opts.size ?? 480
  const initialMode: PaneMode = opts.initialMode ?? 'volumetric'

  const root = document.createElement('div')
  root.className = 'linelight-atomview3d-pane'
  root.style.cssText = 'display: flex; flex-direction: column; gap: 8px; align-items: center;'

  const canvasWrap = document.createElement('div')
  canvasWrap.style.cssText = `position: relative; width: ${size}px; height: ${size}px; background: #0a0a0a;`
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.style.cssText = `width: ${size}px; height: ${size}px; display: block;`
  canvasWrap.appendChild(canvas)
  root.appendChild(canvasWrap)

  const caption = document.createElement('div')
  caption.className = 'linelight-atomview3d-caption'
  caption.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #d0d0d0; text-align: center; min-height: 16px;"
  caption.textContent = opts.initialInput.caption
  root.appendChild(caption)

  const controlsRow = document.createElement('div')
  controlsRow.className = 'linelight-atomview3d-controls'
  controlsRow.style.cssText =
    'display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 28px;'

  const modePill = document.createElement('button')
  modePill.className = 'linelight-atomview3d-modepill'
  modePill.style.cssText =
    "font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.06em; padding: 4px 10px; border: 1px solid #6b6b6b; background: #1a1a1a; color: #d0d0d0; cursor: pointer;"
  modePill.textContent = `mode · ${initialMode}`
  controlsRow.appendChild(modePill)

  const isoControl = document.createElement('label')
  isoControl.className = 'linelight-atomview3d-isothreshold-control'
  isoControl.style.cssText =
    "display: flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.04em; color: #a8a8a8;"

  const isoText = document.createElement('span')
  isoText.textContent = 'iso'
  isoControl.appendChild(isoText)

  const isoRange = document.createElement('input')
  isoRange.className = 'linelight-atomview3d-isothreshold'
  isoRange.type = 'range'
  isoRange.min = String(MIN_ISO_THRESHOLD_FRACTION)
  isoRange.max = String(MAX_ISO_THRESHOLD_FRACTION)
  isoRange.step = String(ISO_THRESHOLD_STEP)
  isoRange.value = String(DEFAULT_ISO_THRESHOLD_FRACTION)
  isoRange.setAttribute('aria-label', 'iso threshold')
  isoRange.style.cssText = 'width: 110px; accent-color: #d0d0d0;'
  isoControl.appendChild(isoRange)

  const isoValue = document.createElement('span')
  isoValue.className = 'linelight-atomview3d-isothreshold-value'
  isoValue.style.cssText =
    'display: inline-block; min-width: 3.2em; text-align: right; color: #d0d0d0;'
  isoValue.textContent = formatIsoThreshold(DEFAULT_ISO_THRESHOLD_FRACTION)
  isoControl.appendChild(isoValue)

  controlsRow.appendChild(isoControl)
  root.appendChild(controlsRow)

  const maybeRenderer = tryCreateRenderer(canvas)

  // Track current pane input so a mode-flip doesn't lose it.
  let currentInput: PaneInput = opts.initialInput
  let currentMode: PaneMode = initialMode
  let currentIsoThreshold = DEFAULT_ISO_THRESHOLD_FRACTION

  function readIsoThresholdControl(): void {
    currentIsoThreshold = clampIsoThreshold(isoRange.valueAsNumber)
    isoRange.value = String(currentIsoThreshold)
    isoValue.textContent = formatIsoThreshold(currentIsoThreshold)
  }

  // No-GL fast path (JSDOM): keep DOM-only pane.
  if (!maybeRenderer) {
    const noop: Pane = {
      root,
      canvas,
      hasGL: false,
      setMode: (mode) => {
        currentMode = mode
        modePill.textContent = `mode · ${mode}`
      },
      setInput: (input) => {
        currentInput = input
        caption.textContent = input.caption
      },
      syncFrom: () => {},
      getCameraSnapshot: () => ({
        position: [0, 0, 0],
        quaternion: [0, 0, 0, 1],
        target: [0, 0, 0],
      }),
      applyCameraSnapshot: () => {},
      requestRender: () => {},
      dispose: () => {
        root.remove()
      },
    }
    modePill.addEventListener('click', () => {
      noop.setMode(currentMode === 'volumetric' ? 'iso-surface' : 'volumetric')
    })
    isoRange.addEventListener('input', readIsoThresholdControl)
    // Keep `currentInput` referenced — useful if a future refactor re-mounts.
    void currentInput
    return noop
  }

  // Narrow the renderer to non-null for the rest of the function — the
  // closures below capture this binding without losing the narrowing.
  const renderer: WebGLRenderer = maybeRenderer
  renderer.setSize(size, size, false)

  const scene = new Scene()
  scene.background = new Color(0x0a0a0a)

  const camera = new PerspectiveCamera(50, 1, 0.01, 1000)
  // Position the camera at a distance proportional to the box half-extent,
  // along the +z direction so we look down -z (right-handed convention).
  const initialDist = 3.2 * opts.initialInput.halfExtent_Bohr
  camera.position.set(initialDist, initialDist * 0.6, initialDist)
  camera.lookAt(0, 0, 0)

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(0, 0, 0)
  controls.update()

  const state: GLState = {
    scene,
    camera,
    controls,
    renderer,
    volMesh: null,
    volTexture: null,
    isoGroup: null,
    isoPos: null,
    isoNeg: null,
    currentMode,
  }

  // Build initial GL data.
  let currentGrid = buildPsiGrid3D(
    opts.initialInput.quanta,
    opts.initialInput.halfExtent_Bohr,
    GRID_RESOLUTION_3D,
  )
  rebuildVolumetric(state, currentGrid)
  rebuildIsoSurface(state, currentGrid, currentIsoThreshold)

  // Render-on-demand loop. We render once after any change (input, mode,
  // camera). With damping, we keep ticking briefly until the controls settle.
  let renderRequested = false
  let dampTicksRemaining = 0
  const DAMP_TICKS_AFTER_CHANGE = 30

  function draw(): void {
    renderRequested = false
    if (state.volMesh && state.currentMode === 'volumetric') {
      const objCam = state.volMesh.worldToLocal(camera.position.clone())
      ;(state.volMesh.material.uniforms.uCameraPosObj.value as Vector3).copy(objCam)
    }
    renderer.render(scene, camera)
  }

  function tick(): void {
    const moved = controls.update()
    if (moved || dampTicksRemaining > 0) {
      dampTicksRemaining = Math.max(0, dampTicksRemaining - 1)
      draw()
      requestAnimationFrame(tick)
      return
    }
    if (renderRequested) {
      draw()
      requestAnimationFrame(tick)
      return
    }
    // Idle — let the loop go quiet until next requestRender / change event.
  }

  function requestRender(): void {
    if (renderRequested) return
    renderRequested = true
    dampTicksRemaining = DAMP_TICKS_AFTER_CHANGE
    requestAnimationFrame(tick)
  }

  isoRange.addEventListener('input', readIsoThresholdControl)
  isoRange.addEventListener('change', () => {
    readIsoThresholdControl()
    rebuildIsoSurface(state, currentGrid, currentIsoThreshold)
    requestRender()
  })

  controls.addEventListener('change', () => {
    requestRender()
    if (opts.onCameraChange) opts.onCameraChange(getCameraSnapshot())
  })

  // First draw.
  requestRender()

  function getCameraSnapshot(): CameraSnapshot {
    return {
      position: [camera.position.x, camera.position.y, camera.position.z],
      quaternion: [
        camera.quaternion.x,
        camera.quaternion.y,
        camera.quaternion.z,
        camera.quaternion.w,
      ],
      target: [controls.target.x, controls.target.y, controls.target.z],
    }
  }

  function applyCameraSnapshot(snap: CameraSnapshot): void {
    camera.position.set(snap.position[0], snap.position[1], snap.position[2])
    camera.quaternion.set(
      snap.quaternion[0],
      snap.quaternion[1],
      snap.quaternion[2],
      snap.quaternion[3],
    )
    controls.target.set(snap.target[0], snap.target[1], snap.target[2])
    controls.update()
    requestRender()
  }

  function setMode(mode: PaneMode): void {
    if (mode === state.currentMode) return
    // Swap the active object in/out of the scene.
    if (state.currentMode === 'volumetric' && state.volMesh) {
      scene.remove(state.volMesh)
    }
    if (state.currentMode === 'iso-surface' && state.isoGroup) {
      scene.remove(state.isoGroup)
    }
    state.currentMode = mode
    currentMode = mode
    if (mode === 'volumetric' && state.volMesh) scene.add(state.volMesh)
    if (mode === 'iso-surface' && state.isoGroup) scene.add(state.isoGroup)
    modePill.textContent = `mode · ${mode}`
    requestRender()
  }

  modePill.addEventListener('click', () => {
    setMode(state.currentMode === 'volumetric' ? 'iso-surface' : 'volumetric')
  })

  function setInput(input: PaneInput): void {
    const sameQuanta =
      input.quanta.n === currentInput.quanta.n &&
      input.quanta.l === currentInput.quanta.l &&
      input.quanta.m === currentInput.quanta.m &&
      input.quanta.Z === currentInput.quanta.Z &&
      input.halfExtent_Bohr === currentInput.halfExtent_Bohr

    currentInput = input
    caption.textContent = input.caption

    if (!sameQuanta) {
      const grid = buildPsiGrid3D(input.quanta, input.halfExtent_Bohr, GRID_RESOLUTION_3D)
      currentGrid = grid
      rebuildVolumetric(state, grid)
      rebuildIsoSurface(state, grid, currentIsoThreshold)
      // Re-pose camera so the new box fits the frame.
      const dist = 3.2 * input.halfExtent_Bohr
      const dir = camera.position.clone().sub(controls.target).normalize()
      camera.position.copy(dir.multiplyScalar(dist))
      controls.target.set(0, 0, 0)
      controls.update()
    }
    requestRender()
  }

  function syncFrom(other: Pane): void {
    applyCameraSnapshot(other.getCameraSnapshot())
  }

  function dispose(): void {
    controls.dispose()
    if (state.volMesh) {
      scene.remove(state.volMesh)
      state.volMesh.geometry.dispose()
      state.volMesh.material.dispose()
    }
    if (state.volTexture) state.volTexture.dispose()
    if (state.isoGroup) {
      scene.remove(state.isoGroup)
      if (state.isoPos) {
        ;(state.isoPos.material as MeshBasicMaterial).dispose()
        state.isoPos.geometry.dispose()
      }
      if (state.isoNeg) {
        ;(state.isoNeg.material as MeshBasicMaterial).dispose()
        state.isoNeg.geometry.dispose()
      }
    }
    renderer.dispose()
    renderer.forceContextLoss()
    root.remove()
  }

  return {
    root,
    canvas,
    hasGL: true,
    setMode,
    setInput,
    syncFrom,
    getCameraSnapshot,
    applyCameraSnapshot,
    requestRender,
    dispose,
  }
}
