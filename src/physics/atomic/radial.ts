/**
 * Hydrogenic radial wavefunctions R_nl(r, Z) for n ≤ 7, l ∈ [0, n−1].
 *
 * Atomic units: r is measured in Bohr radii and Z is dimensionless. The
 * implementation follows the normalized closed form
 *
 *     R_nl(r) = N_nl · e^(−ρ/2) · ρ^l · L_{n−l−1}^{2l+1}(ρ)
 *
 *     ρ ≡ 2Zr/n,
 *
 *     N_nl = √[ (2Z/n)³ · (n−l−1)! / (2n · (n+l)!) ],
 *
 * with physicist-convention associated Laguerre polynomials
 *
 *     L_p^α(x) = Σ_{k=0..p} (−1)^k C(p+α, p−k) x^k / k!
 *
 * Reference values pinned in tests:
 *
 *   R_10(0, Z=1) = 2
 *   R_20(0, Z=1) = 1/√2 ≈ 0.7071
 *   R_21(0, Z=1) = 0   (radial node at origin for l > 0)
 *   R_30(0, Z=1) = 2/(3√3) ≈ 0.3849
 *   R_40(0, Z=1) = 1/4
 *
 * Number of radial nodes equals n − l − 1 (verified by zero-crossing tests).
 */

const MAX_SUPPORTED_N = 7

function factorial(n: number): number {
  let result = 1
  for (let i = 2; i <= n; i++) result *= i
  return result
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0

  const kk = Math.min(k, n - k)
  let result = 1
  for (let i = 1; i <= kk; i++) {
    result = (result * (n - kk + i)) / i
  }
  return result
}

function associatedLaguerre(p: number, alpha: number, x: number): number {
  let sum = 0
  for (let k = 0; k <= p; k++) {
    const sign = k % 2 === 0 ? 1 : -1
    sum += (sign * binomial(p + alpha, p - k) * Math.pow(x, k)) / factorial(k)
  }
  return sum
}

/** R_nl(r, Z) in atomic units. r in Bohr radii. */
export function radialR(n: number, l: number, Z: number, r: number): number {
  if (!Number.isInteger(n)) {
    throw new Error(`radialR: n=${n} must be an integer`)
  }
  if (!Number.isInteger(l)) {
    throw new Error(`radialR: l=${l} must be an integer`)
  }
  if (n < 1 || n > MAX_SUPPORTED_N) {
    throw new Error(`radialR: n=${n} out of supported range [1,${MAX_SUPPORTED_N}]`)
  }
  if (l < 0 || l >= n) {
    throw new Error(`radialR: l=${l} out of valid range [0, n−1] for n=${n}`)
  }
  if (Z <= 0) {
    throw new Error(`radialR: Z=${Z} must be > 0`)
  }
  if (r < 0) {
    throw new Error(`radialR: r=${r} must be ≥ 0`)
  }

  const rho = (2 * Z * r) / n
  const laguerreOrder = n - l - 1
  const laguerreAlpha = 2 * l + 1
  const normalization = Math.sqrt(
    Math.pow((2 * Z) / n, 3) * (factorial(laguerreOrder) / (2 * n * factorial(n + l))),
  )

  return (
    normalization *
    Math.exp(-rho / 2) *
    Math.pow(rho, l) *
    associatedLaguerre(laguerreOrder, laguerreAlpha, rho)
  )
}
