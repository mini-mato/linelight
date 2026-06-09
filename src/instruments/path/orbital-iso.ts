/**
 * Marching-cubes iso-surface orbital builder.
 *
 * Used by path steps 2, 3, 4, and 5 to render the hydrogenic wavefunction
 * as a pair of triangulated iso-surface meshes (red for ψ > +iso, blue for
 * ψ < −iso) instead of the volumetric raymarch, which fails to link in the
 * shared Path renderer.
 *
 * Standard `MeshLambertMaterial` (lit, simple). No custom shaders.
 */

import { Group, MeshLambertMaterial, type Object3D, type Scene } from 'three'
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js'

/** Default iso-threshold as a fraction of peak |ψ|. */
const DEFAULT_ISO_FRACTION = 0.18

/** MarchingCubes grid resolution. 48 keeps the per-frame cost modest. */
const MC_RESOLUTION = 48

export type OrbitalIsoOptions = {
  /** Signed ψ samples, length N³. x-fastest, then y, then z (matches buildPsiGrid3D). */
  psiField: Float32Array
  /** Grid resolution per axis of `psiField`. */
  N: number
  /** Cube half-extent (Bohr) of the field. */
  halfExtent: number
  /** Iso-threshold as a fraction of peak |ψ|. Defaults to 0.18. */
  isoFraction?: number
  /** Show the +ψ shell? Default true. */
  showPositive?: boolean
  /** Show the −ψ shell? Default true. */
  showNegative?: boolean
  /** Override material colors. */
  posColor?: number
  negColor?: number
}

export type OrbitalIso = {
  group: Group
  /** Update the iso-surfaces from a new signed field. Re-uses the same group. */
  update: (psiField: Float32Array, opts?: Partial<OrbitalIsoOptions>) => void
  /** Free GPU resources. */
  dispose: () => void
}

/**
 * Build a paired-shell iso-surface orbital. Returns a Group containing one or
 * two scaled+positioned MarchingCubes objects.
 */
export function createOrbitalIso(opts: OrbitalIsoOptions): OrbitalIso {
  const posMat = new MeshLambertMaterial({
    color: opts.posColor ?? 0xff2e4e,
    emissive: 0x441020,
    emissiveIntensity: 0.45,
    flatShading: false,
    transparent: true,
    opacity: 0.9,
  })
  const negMat = new MeshLambertMaterial({
    color: opts.negColor ?? 0x3a8cff,
    emissive: 0x101a40,
    emissiveIntensity: 0.45,
    flatShading: false,
    transparent: true,
    opacity: 0.85,
  })

  const showPos = opts.showPositive !== false
  const showNeg = opts.showNegative !== false

  // MarchingCubes lives in [-1, +1] in its own object space; we scale it to
  // the actual half-extent in Bohr radii.
  const posMC = new MarchingCubes(
    MC_RESOLUTION,
    posMat,
    /*enableUvs*/ false,
    /*enableColors*/ false,
  )
  const negMC = new MarchingCubes(
    MC_RESOLUTION,
    negMat,
    /*enableUvs*/ false,
    /*enableColors*/ false,
  )
  posMC.scale.setScalar(opts.halfExtent)
  negMC.scale.setScalar(opts.halfExtent)

  const group = new Group()
  if (showPos) group.add(posMC)
  if (showNeg) group.add(negMC)

  function fillField(target: MarchingCubes, psi: Float32Array, N: number, sign: 1 | -1): void {
    target.reset()
    const M = MC_RESOLUTION
    // Map (i,j,k) ∈ [0, M)³ → (kx, ky, kz) in [0, N) by nearest neighbor.
    // The MC algorithm processes cells from index 1 to size-2 (boundary
    // cells are ignored), so we fill the full M×M×M field directly.
    for (let kz = 0; kz < M; kz++) {
      const sz = Math.min(N - 1, Math.floor((kz / M) * N))
      for (let ky = 0; ky < M; ky++) {
        const sy = Math.min(N - 1, Math.floor((ky / M) * N))
        for (let kx = 0; kx < M; kx++) {
          const sx = Math.min(N - 1, Math.floor((kx / M) * N))
          const srcIdx = sx + sy * N + sz * N * N
          target.setCell(kx, ky, kz, sign * psi[srcIdx])
        }
      }
    }
    // Critical: MarchingCubes does not auto-triangulate. setCell only fills
    // the scalar field; update() runs the actual marching-cubes algorithm
    // and writes the BufferGeometry attributes.
    target.update()
  }

  function update(psiField: Float32Array, partial?: Partial<OrbitalIsoOptions>): void {
    const fraction = partial?.isoFraction ?? opts.isoFraction ?? DEFAULT_ISO_FRACTION
    // peakAbs over the new field.
    let peakAbs = 0
    for (let i = 0; i < psiField.length; i++) {
      const a = Math.abs(psiField[i])
      if (a > peakAbs) peakAbs = a
    }
    const isolation = (fraction > 0 && fraction < 1 ? fraction : DEFAULT_ISO_FRACTION) * peakAbs
    posMC.isolation = Math.max(isolation, 1e-6)
    negMC.isolation = Math.max(isolation, 1e-6)
    if (showPos) fillField(posMC, psiField, opts.N, +1)
    if (showNeg) fillField(negMC, psiField, opts.N, -1)
  }

  update(opts.psiField)

  function dispose(): void {
    posMat.dispose()
    negMat.dispose()
    // MarchingCubes internally manages geometry; nulling out parent is enough.
    if (posMC.parent) posMC.parent.remove(posMC)
    if (negMC.parent) negMC.parent.remove(negMC)
  }

  return { group, update, dispose }
}

/**
 * Convenience: track an OrbitalIso's Group via the StageContext's trackObject,
 * but also return the iso handle so callers can call update()/dispose().
 */
export function trackOrbitalIso(
  iso: OrbitalIso,
  trackObject: <T extends Object3D>(o: T) => T,
  _scene?: Scene,
): OrbitalIso {
  trackObject(iso.group)
  return iso
}
