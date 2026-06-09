/**
 * Real (tesseral) spherical harmonics Y_lm(θ, φ) for l ≤ 6.
 *
 * These are the orthonormal real linear combinations of the complex Y_l^m
 * used throughout chemistry and orbital visualization. They satisfy
 *
 *     ∫₀^{2π} ∫₀^{π} Y_{l,m} Y_{l',m'} sin(θ) dθ dφ = δ_{ll'} δ_{mm'}
 *
 * Convention: associated Legendre functions include the Condon–Shortley
 * phase. Real harmonics multiply P_l^|m| by √2 · (−1)^|m|; m > 0 uses
 * cos(mφ), m < 0 uses sin(|m|φ), and m = 0 is φ-independent. This preserves
 * the existing p_x/p_y/p_z and d/f signs pinned by tests.
 *
 * θ ∈ [0, π], φ ∈ [0, 2π).
 */

const PI = Math.PI
const MAX_SUPPORTED_L = 6

function factorial(n: number): number {
  let result = 1
  for (let i = 2; i <= n; i++) result *= i
  return result
}

function associatedLegendre(l: number, m: number, x: number): number {
  let pmm = 1

  if (m > 0) {
    const root = Math.sqrt(Math.max(0, 1 - x * x))
    let factor = 1
    for (let i = 1; i <= m; i++) {
      pmm *= -factor * root
      factor += 2
    }
  }

  if (l === m) return pmm

  let pmmp1 = x * (2 * m + 1) * pmm
  if (l === m + 1) return pmmp1

  let pll = 0
  for (let ll = m + 2; ll <= l; ll++) {
    pll = ((2 * ll - 1) * x * pmmp1 - (ll + m - 1) * pmm) / (ll - m)
    pmm = pmmp1
    pmmp1 = pll
  }
  return pll
}

function complexNormalization(l: number, m: number): number {
  return Math.sqrt(((2 * l + 1) / (4 * PI)) * (factorial(l - m) / factorial(l + m)))
}

/**
 * Real tesseral spherical harmonic Y_lm(θ, φ).
 *
 * @param l  angular quantum number, 0..6 supported here
 * @param m  magnetic quantum number, −l..+l
 */
export function realY(l: number, m: number, theta: number, phi: number): number {
  if (!Number.isInteger(l)) {
    throw new Error(`realY: l=${l} must be an integer`)
  }
  if (l < 0 || l > MAX_SUPPORTED_L) {
    throw new Error(`realY: l=${l} not supported (general set covers l ≤ ${MAX_SUPPORTED_L})`)
  }
  if (m < -l || m > l) return 0
  if (!Number.isInteger(m)) {
    throw new Error(`realY: m=${m} must be an integer`)
  }

  const absM = Math.abs(m)
  const x = Math.cos(theta)
  const legendre = associatedLegendre(l, absM, x)
  const normalization = complexNormalization(l, absM)

  if (m === 0) return normalization * legendre

  const phase = absM % 2 === 0 ? 1 : -1
  const angular = Math.SQRT2 * phase * normalization * legendre
  return m > 0 ? angular * Math.cos(absM * phi) : angular * Math.sin(absM * phi)
}
