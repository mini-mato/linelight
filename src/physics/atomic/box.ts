/**
 * Recommended bounding-box half-extent for rendering an orbital ψ_nlm.
 *
 * The classical-radius scale of an (n, l) orbital is ~n²·a₀/Z; the 90 %
 * cumulative-probability radius lies ~2x that. We pad to ~3.5x so |ψ|² at
 * the box face is well below 1 % of the interior peak across the supported
 * (n, l, Z) set, including pathological cases like 3d on the body-diagonal
 * face where the angular factor is small but nonzero. A small constant
 * 1/Z offset keeps very tight orbitals (1s of high-Z ions) from collapsing
 * below a usable viewport size.
 *
 * Returned in Bohr radii.
 */
export function recommendedBoxHalfExtent_Bohr(n: number, l: number, Z: number): number {
  if (n < 1) throw new Error(`recommendedBoxHalfExtent_Bohr: n=${n} must be ≥ 1`)
  if (Z <= 0) throw new Error(`recommendedBoxHalfExtent_Bohr: Z=${Z} must be > 0`)
  if (l < 0 || l >= n) {
    throw new Error(`recommendedBoxHalfExtent_Bohr: l=${l} invalid for n=${n}`)
  }

  // Slight l-dependent shrink: high-l orbitals are more compact than s of
  // the same n. The n² scaling dominates; this just trims a touch off of
  // d/f boxes so they don't render with excess empty space.
  const lFactor = 1 - 0.08 * l

  return (3.5 * n * n * lFactor + 1) / Z
}
