/**
 * Hydrogenic real-orbital catalog for visual selection.
 *
 * This module is intentionally metadata-only: it does not sample wavefunctions.
 * It gives the UI a typed atlas of shell/subshell/orbital labels and a safe
 * way to expand a bare hydrogen `n -> n` line into representative E1 branches.
 */

export const MAX_HYDROGENIC_CATALOG_N = 7

export type ShellNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type ShellLabel = 'K' | 'L' | 'M' | 'N' | 'O' | 'P' | 'Q'
export type AngularMomentum = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type MagneticQuantumNumber = -6 | -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6
export type SubshellLetter = 's' | 'p' | 'd' | 'f' | 'g' | 'h' | 'i'

export type OrbitalDescriptor = {
  readonly id: string
  /** Full orbital label, e.g. "3dxy" or "5g_m-4". */
  readonly label: string
  readonly n: ShellNumber
  readonly shellLabel: ShellLabel
  readonly l: AngularMomentum
  readonly subshell: SubshellLetter
  /** Subshell label, e.g. "3d". */
  readonly subshellLabel: string
  /** Real tesseral basis name within the subshell, e.g. "px" or "dz2". */
  readonly name: string
  /** Magnetic quantum number used by realY(l, m, theta, phi). */
  readonly m: MagneticQuantumNumber
  readonly radialNodes: number
  readonly angularNodes: number
  readonly totalNodes: number
  readonly basis: 'real-tesseral'
}

export type SubshellDescriptor = {
  readonly id: string
  readonly label: string
  readonly n: ShellNumber
  readonly shellLabel: ShellLabel
  readonly l: AngularMomentum
  readonly letter: SubshellLetter
  readonly magneticMValues: readonly MagneticQuantumNumber[]
  readonly orbitals: readonly OrbitalDescriptor[]
  readonly orbitalCount: number
  readonly electronCapacity: number
}

export type ShellDescriptor = {
  readonly id: string
  readonly n: ShellNumber
  readonly label: ShellLabel
  readonly subshells: readonly SubshellDescriptor[]
  readonly orbitalCount: number
  readonly electronCapacity: number
}

export type OrbitalListFilter = {
  readonly n?: number
  readonly l?: number
}

export type BareHydrogenE1Branch = {
  readonly id: string
  /** Subshell branch label, e.g. "3p -> 2s". */
  readonly label: string
  readonly upperSubshell: SubshellDescriptor
  readonly lowerSubshell: SubshellDescriptor
  readonly representativeUpper: OrbitalDescriptor
  readonly representativeLower: OrbitalDescriptor
  readonly deltaL: -1 | 1
}

type OrbitalNameSpec = {
  readonly m: MagneticQuantumNumber
  readonly name: string
}

const SHELL_LABEL_BY_N: Record<ShellNumber, ShellLabel> = {
  1: 'K',
  2: 'L',
  3: 'M',
  4: 'N',
  5: 'O',
  6: 'P',
  7: 'Q',
}

const SUBSHELL_BY_L: Record<AngularMomentum, SubshellLetter> = {
  0: 's',
  1: 'p',
  2: 'd',
  3: 'f',
  4: 'g',
  5: 'h',
  6: 'i',
}

const NAMED_REAL_ORBITALS: Partial<Record<AngularMomentum, readonly OrbitalNameSpec[]>> = {
  0: [{ m: 0, name: 's' }],
  1: [
    { m: 1, name: 'px' },
    { m: -1, name: 'py' },
    { m: 0, name: 'pz' },
  ],
  2: [
    { m: -2, name: 'dxy' },
    { m: -1, name: 'dyz' },
    { m: 0, name: 'dz2' },
    { m: 1, name: 'dxz' },
    { m: 2, name: 'dx2-y2' },
  ],
  3: [
    { m: -3, name: 'fy(3x2-y2)' },
    { m: -2, name: 'fxyz' },
    { m: -1, name: 'fyz2' },
    { m: 0, name: 'fz3' },
    { m: 1, name: 'fxz2' },
    { m: 2, name: 'fz(x2-y2)' },
    { m: 3, name: 'fx(x2-3y2)' },
  ],
}

const EMPTY_ORBITALS: readonly OrbitalDescriptor[] = Object.freeze([])

export const ORBITAL_CATALOG: readonly ShellDescriptor[] = buildCatalog()
const ALL_ORBITALS: readonly OrbitalDescriptor[] = Object.freeze(
  ORBITAL_CATALOG.flatMap((shell) => shell.subshells.flatMap((subshell) => subshell.orbitals)),
)

/** True when `n` is in the visual catalog's supported shell range, 1 <= n <= 7. */
export function isCatalogShellNumber(n: number): n is ShellNumber {
  return Number.isInteger(n) && n >= 1 && n <= MAX_HYDROGENIC_CATALOG_N
}

/** True when `l` maps to a supported spectroscopic letter, s through i. */
export function isCatalogAngularMomentum(l: number): l is AngularMomentum {
  return Number.isInteger(l) && l >= 0 && l <= 6
}

/** Returns K/L/M/... shell label for supported n, otherwise null. */
export function shellLabelForN(n: number): ShellLabel | null {
  return isCatalogShellNumber(n) ? SHELL_LABEL_BY_N[n] : null
}

/** Returns s/p/d/... subshell letter for supported l, otherwise null. */
export function subshellLetterForL(l: number): SubshellLetter | null {
  return isCatalogAngularMomentum(l) ? SUBSHELL_BY_L[l] : null
}

/** Get one shell descriptor by n. */
export function getShell(n: number): ShellDescriptor | null {
  if (!isCatalogShellNumber(n)) return null
  return ORBITAL_CATALOG[n - 1] ?? null
}

/** Get one subshell descriptor by n and l. */
export function getSubshell(n: number, l: number): SubshellDescriptor | null {
  const shell = getShell(n)
  if (!shell || !isCatalogAngularMomentum(l)) return null
  return shell.subshells.find((subshell) => subshell.l === l) ?? null
}

/** Get one real orbital by n, l, and m. */
export function getOrbital(n: number, l: number, m: number): OrbitalDescriptor | null {
  if (!isCatalogMagneticM(m)) return null
  const subshell = getSubshell(n, l)
  if (!subshell) return null
  return subshell.orbitals.find((orbital) => orbital.m === m) ?? null
}

/** List orbitals across the catalog, optionally filtered by n and/or l. */
export function listOrbitals(filter: OrbitalListFilter = {}): readonly OrbitalDescriptor[] {
  const { n, l } = filter

  if (n !== undefined && !isCatalogShellNumber(n)) return EMPTY_ORBITALS
  if (l !== undefined && !isCatalogAngularMomentum(l)) return EMPTY_ORBITALS

  if (n !== undefined && l !== undefined) {
    return getSubshell(n, l)?.orbitals ?? EMPTY_ORBITALS
  }

  if (n !== undefined) {
    const shell = getShell(n)
    return shell ? shell.subshells.flatMap((subshell) => subshell.orbitals) : EMPTY_ORBITALS
  }

  if (l !== undefined) {
    return ALL_ORBITALS.filter((orbital) => orbital.l === l)
  }

  return ALL_ORBITALS
}

/**
 * Expand a bare hydrogenic `upperN -> lowerN` line into allowed E1 subshell
 * branches. This deliberately returns no `s -> s` branch because E1 requires
 * delta l = +/-1; callers can display the returned representative orbitals.
 */
export function representativeE1BranchesForBareHydrogenTransition(
  upperN: number,
  lowerN: number,
): readonly BareHydrogenE1Branch[] {
  const upperShell = getShell(upperN)
  const lowerShell = getShell(lowerN)
  if (!upperShell || !lowerShell || upperShell.n === lowerShell.n) return Object.freeze([])

  const branches: BareHydrogenE1Branch[] = []

  for (const upperSubshell of upperShell.subshells) {
    for (const lowerSubshell of lowerShell.subshells) {
      const deltaL = upperSubshell.l - lowerSubshell.l
      if (Math.abs(deltaL) !== 1) continue

      branches.push(
        Object.freeze({
          id: `n${upperShell.n}l${upperSubshell.l}-n${lowerShell.n}l${lowerSubshell.l}`,
          label: `${upperSubshell.label} -> ${lowerSubshell.label}`,
          upperSubshell,
          lowerSubshell,
          representativeUpper: representativeOrbital(upperSubshell),
          representativeLower: representativeOrbital(lowerSubshell),
          deltaL: deltaL as -1 | 1,
        }),
      )
    }
  }

  return Object.freeze(branches)
}

function buildCatalog(): readonly ShellDescriptor[] {
  const shells: ShellDescriptor[] = []

  for (let n = 1; n <= MAX_HYDROGENIC_CATALOG_N; n++) {
    const shellNumber = n as ShellNumber
    const shellLabel = SHELL_LABEL_BY_N[shellNumber]
    const subshells: SubshellDescriptor[] = []

    for (let l = 0; l < n; l++) {
      const angularMomentum = l as AngularMomentum
      subshells.push(buildSubshell(shellNumber, shellLabel, angularMomentum))
    }

    shells.push(
      Object.freeze({
        id: `n${shellNumber}`,
        n: shellNumber,
        label: shellLabel,
        subshells: Object.freeze(subshells),
        orbitalCount: shellNumber * shellNumber,
        electronCapacity: 2 * shellNumber * shellNumber,
      }),
    )
  }

  return Object.freeze(shells)
}

function buildSubshell(
  n: ShellNumber,
  shellLabel: ShellLabel,
  l: AngularMomentum,
): SubshellDescriptor {
  const letter = SUBSHELL_BY_L[l]
  const label = `${n}${letter}`
  const magneticMValues = magneticValuesForL(l)
  const orbitals = orbitalNameSpecsForL(l).map((spec) =>
    buildOrbital(n, shellLabel, l, letter, label, spec),
  )

  return Object.freeze({
    id: `n${n}l${l}`,
    label,
    n,
    shellLabel,
    l,
    letter,
    magneticMValues,
    orbitals: Object.freeze(orbitals),
    orbitalCount: 2 * l + 1,
    electronCapacity: 2 * (2 * l + 1),
  })
}

function buildOrbital(
  n: ShellNumber,
  shellLabel: ShellLabel,
  l: AngularMomentum,
  subshell: SubshellLetter,
  subshellLabel: string,
  spec: OrbitalNameSpec,
): OrbitalDescriptor {
  return Object.freeze({
    id: `n${n}l${l}m${spec.m}`,
    label: `${n}${spec.name}`,
    n,
    shellLabel,
    l,
    subshell,
    subshellLabel,
    name: spec.name,
    m: spec.m,
    radialNodes: n - l - 1,
    angularNodes: l,
    totalNodes: n - 1,
    basis: 'real-tesseral',
  })
}

function orbitalNameSpecsForL(l: AngularMomentum): readonly OrbitalNameSpec[] {
  const named = NAMED_REAL_ORBITALS[l]
  if (named) return named

  const letter = SUBSHELL_BY_L[l]
  return magneticValuesForL(l).map((m) => ({
    m,
    name: `${letter}_m${formatSignedM(m)}`,
  }))
}

function magneticValuesForL(l: AngularMomentum): readonly MagneticQuantumNumber[] {
  const values: MagneticQuantumNumber[] = []
  for (let m = -l; m <= l; m++) {
    values.push(m as MagneticQuantumNumber)
  }
  return Object.freeze(values)
}

function representativeOrbital(subshell: SubshellDescriptor): OrbitalDescriptor {
  const axial = subshell.orbitals.find((orbital) => orbital.m === 0)
  return axial ?? subshell.orbitals[0]
}

function isCatalogMagneticM(m: number): m is MagneticQuantumNumber {
  return Number.isInteger(m) && m >= -6 && m <= 6
}

function formatSignedM(m: MagneticQuantumNumber): string {
  return m > 0 ? `+${m}` : String(m)
}
