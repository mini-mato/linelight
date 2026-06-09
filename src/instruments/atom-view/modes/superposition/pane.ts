/**
 * Superposition pane — single-canvas Three.js raymarch of the time-evolved
 * 50/50 coherent superposition |Ψ(r, t)|².
 *
 * Adapted from `cloud-3d/pane.ts` but:
 *   • single canvas (no dual upper/lower)
 *   • signed density field (cross-term can be negative)
 *   • per-frame 3D-texture refresh driven by the global Clock
 *   • THREE.ArrowHelper overlaid for the dipole expectation vector
 *
 * Teardown disposes every WebGL resource it owns.
 */

import {
  ArrowHelper,
  AxesHelper,
  BackSide,
  BoxGeometry,
  ClampToEdgeWrapping,
  Data3DTexture,
  FloatType,
  GLSL3,
  LinearFilter,
  Mesh,
  PerspectiveCamera,
  RawShaderMaterial,
  RedFormat,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildPsiGrid3D, GRID_RESOLUTION_3D, type Quanta } from '../cloud-3d/grid'
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders'
import {
  dipoleMatrixElement_au,
  superpositionDensity,
  transitionAngularFrequency_rad_per_s,
  type DipoleResult,
} from '../../../../physics/atomic/superposition'

const VOLUMETRIC_STEPS = 128
const ALPHA_GAMMA = 0.7
const DENSITY_SCALE = 0.06
const POS_COLOR = new Vector3(1.0, 0.18, 0.32)
const NEG_COLOR = new Vector3(0.18, 0.5, 1.0)

/** Inputs the pane needs to (re)build static ψ fields. */
export type PaneInput = {
  upper: Quanta & { energy_eV: number }
  lower: Quanta & { energy_eV: number }
  halfExtent_Bohr: number
}

export type ClockSnapshot = {
  speed: number
  frozen: boolean
  displayHzScale: number
}

export type SuperpositionPane = {
  root: HTMLDivElement
  canvas: HTMLCanvasElement
  hasGL: boolean
  setInput: (input: PaneInput) => void
  setClock: (snap: ClockSnapshot) => void
  getCurrent: () => {
    omega_real_rad_per_s: number
    omega_display_rad_per_s: number
    dipoleMagnitude_a0: number | null
  }
  dispose: () => void
}

export type PaneOptions = {
  size: number
  initialInput: PaneInput
  initialClock: ClockSnapshot
  onTick?: (info: {
    omega_real_rad_per_s: number
    omega_display_rad_per_s: number
    dipoleMagnitude_a0: number | null
    cosT: number
    t_s: number
  }) => void
}

export function createSuperpositionPane(opts: PaneOptions): SuperpositionPane {
  const { size, initialInput, initialClock, onTick } = opts

  const root = document.createElement('div')
  root.style.cssText = `position: relative; width: ${size}px; height: ${size}px;`

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.style.cssText = `display: block; width: ${size}px; height: ${size}px; background: #0a0a0a;`
  root.appendChild(canvas)

  // Try to acquire WebGL. In jsdom this returns null and we render nothing.
  let renderer: WebGLRenderer | null = null
  let hasGL = false
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false })
    renderer.setPixelRatio(globalThis.devicePixelRatio || 1)
    renderer.setSize(size, size, false)
    renderer.setClearColor(0x0a0a0a, 1)
    hasGL = true
  } catch {
    renderer = null
    hasGL = false
  }

  const scene = new Scene()
  const camera = new PerspectiveCamera(40, 1, 0.1, 100)
  camera.position.set(0, 0, 8)

  // OrbitControls only when GL is alive.
  let controls: OrbitControls | null = null
  if (renderer) {
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 1
    controls.maxDistance = 50
  }

  // Static ψ fields rebuilt on setInput().
  let psiLo: Float32Array | null = null
  let psiHi: Float32Array | null = null
  let halfExtent = initialInput.halfExtent_Bohr
  let dipole: DipoleResult | null = null
  let omegaReal = transitionAngularFrequency_rad_per_s(
    initialInput.upper.energy_eV,
    initialInput.lower.energy_eV,
  )

  // Combined density field uploaded each frame.
  const N = GRID_RESOLUTION_3D
  const density = new Float32Array(N * N * N)
  let peakStaticAbs = 0

  // 3D texture.
  const texture = new Data3DTexture(density, N, N, N)
  texture.format = RedFormat
  texture.type = FloatType
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.wrapR = ClampToEdgeWrapping
  texture.unpackAlignment = 1
  texture.needsUpdate = true

  const cubeGeom = new BoxGeometry(2 * halfExtent, 2 * halfExtent, 2 * halfExtent)

  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uDensity: { value: texture },
      uHalfExtent: { value: halfExtent },
      uCameraPosObj: { value: new Vector3() },
      uSteps: { value: VOLUMETRIC_STEPS },
      uDensityScale: { value: DENSITY_SCALE },
      uAlphaGamma: { value: ALPHA_GAMMA },
      uPosColor: { value: POS_COLOR },
      uNegColor: { value: NEG_COLOR },
    },
    side: BackSide,
    transparent: true,
    depthWrite: false,
  })

  const mesh = new Mesh(cubeGeom, material)
  scene.add(mesh)

  // Light reference axes (RGB = XYZ). Helps orient the learner.
  const axes = new AxesHelper(0.8 * halfExtent)
  scene.add(axes)

  // Dipole arrow — starts unit-length, refreshed each frame.
  const arrow = new ArrowHelper(
    new Vector3(0, 0, 1),
    new Vector3(0, 0, 0),
    1,
    0xffe066,
    halfExtent * 0.15,
    halfExtent * 0.08,
  )
  scene.add(arrow)

  // ---- Build static fields ---------------------------------------

  function rebuildFields(input: PaneInput): void {
    halfExtent = input.halfExtent_Bohr

    const gLo = buildPsiGrid3D(input.lower, halfExtent, N)
    const gHi = buildPsiGrid3D(input.upper, halfExtent, N)
    psiLo = gLo.field
    psiHi = gHi.field

    // Peak of the static envelope ½(ψ_lo² + ψ_hi²) — used to scale the
    // combined density into [-1, +1] for the shader.
    let peak = 0
    for (let i = 0; i < density.length; i++) {
      const a = 0.5 * (psiLo[i] * psiLo[i] + psiHi[i] * psiHi[i]) + Math.abs(psiLo[i] * psiHi[i])
      if (a > peak) peak = a
    }
    peakStaticAbs = peak > 0 ? peak : 1

    // Dipole matrix element for the current pair.
    dipole = dipoleMatrixElement_au(
      { n: input.upper.n, l: input.upper.l, m: input.upper.m },
      { n: input.lower.n, l: input.lower.l, m: input.lower.m },
    )

    omegaReal = transitionAngularFrequency_rad_per_s(input.upper.energy_eV, input.lower.energy_eV)

    // Resize the cube to match the new half-extent.
    mesh.geometry.dispose()
    mesh.geometry = new BoxGeometry(2 * halfExtent, 2 * halfExtent, 2 * halfExtent)
    material.uniforms.uHalfExtent.value = halfExtent
    axes.scale.setScalar((0.8 * halfExtent) / 1) // AxesHelper default length is 1
  }

  rebuildFields(initialInput)

  // ---- Per-frame density combine + arrow update -----------------

  let clock = { ...initialClock }
  let lastTickMs: number | null = null
  let t_s = 0
  let disposed = false

  function tick(nowMs: number): void {
    if (disposed) return

    if (!clock.frozen && lastTickMs !== null) {
      const dtMs = nowMs - lastTickMs
      t_s += (dtMs / 1000) * clock.speed
    }
    lastTickMs = nowMs

    const omegaDisplay = omegaReal / clock.displayHzScale
    const cosT = Math.cos(omegaDisplay * t_s)

    if (psiLo && psiHi) {
      const peak = peakStaticAbs
      const invPeak = 1 / peak
      for (let i = 0; i < density.length; i++) {
        const v = superpositionDensity(psiLo[i], psiHi[i], cosT)
        density[i] = v * invPeak
      }
      texture.needsUpdate = true
    }

    // Update dipole arrow.
    if (dipole && dipole.magnitude > 1e-6) {
      const dx = dipole.x * cosT
      const dy = dipole.y * cosT
      const dz = dipole.z * cosT
      const mag = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (mag > 1e-9) {
        // Scale visually so the arrow reaches ~75% of the cube edge at peak.
        const visualScale = (halfExtent * 0.9) / Math.max(dipole.magnitude, 1e-9)
        arrow.setDirection(new Vector3(dx / mag, dy / mag, dz / mag))
        arrow.setLength(mag * visualScale, halfExtent * 0.12, halfExtent * 0.07)
        arrow.visible = true
      } else {
        arrow.visible = false
      }
    } else {
      // Dipole-forbidden — no arrow at all.
      arrow.visible = false
    }

    if (renderer) {
      controls?.update()
      material.uniforms.uCameraPosObj.value.copy(camera.position)
      renderer.render(scene, camera)
    }

    if (onTick) {
      onTick({
        omega_real_rad_per_s: omegaReal,
        omega_display_rad_per_s: omegaDisplay,
        dipoleMagnitude_a0: dipole ? dipole.magnitude : null,
        cosT,
        t_s,
      })
    }

    rafHandle = requestAnimationFrame(tick)
  }

  let rafHandle: number | null = null
  if (typeof requestAnimationFrame === 'function') {
    rafHandle = requestAnimationFrame(tick)
  }

  return {
    root,
    canvas,
    hasGL,
    setInput(input: PaneInput): void {
      rebuildFields(input)
      // Reset clock phase to avoid a sudden jump.
      t_s = 0
      lastTickMs = null
    },
    setClock(snap: ClockSnapshot): void {
      clock = { ...snap }
      lastTickMs = null
    },
    getCurrent(): {
      omega_real_rad_per_s: number
      omega_display_rad_per_s: number
      dipoleMagnitude_a0: number | null
    } {
      return {
        omega_real_rad_per_s: omegaReal,
        omega_display_rad_per_s: omegaReal / clock.displayHzScale,
        dipoleMagnitude_a0: dipole ? dipole.magnitude : null,
      }
    },
    dispose(): void {
      disposed = true
      if (rafHandle !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafHandle)
      }
      controls?.dispose()
      texture.dispose()
      material.dispose()
      mesh.geometry.dispose()
      arrow.dispose()
      axes.dispose()
      renderer?.dispose()
      root.remove()
    },
  }
}
