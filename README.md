# linelight

A digital benchtop for atomic physics. Synced instrument displays — Spectrum Bar, Grotrian energy ladder, Atom View (2D + 3D orbital clouds), a selected-transition Cockpit, and more — all driven from one shared store. Pick an element, click a spectral line, watch every panel respond.

**Live demo:** https://timmiano.com/linelight/ · **Atlas explorer:** https://timmiano.com/linelight/atlas/

## What's in the box

Instruments, wired and synced:

- **Cockpit** — selected-transition readout: element, transition, ΔE, λ (vacuum), ν, photon energy, upper/lower energies, with fidelity tags (`exact` · `measured` · `schematic`).
- **Spectrum Bar** — 380–750 nm visible band or a 1 pm–1 m full-EM log scale. Emission / absorption modes. Element pills (H, He, Na, Hg, Ne). Click a line to isolate it.
- **Grotrian (energy levels)** — hydrogen ladder n=1..7 from Eₙ = −13.6/n². Five series (Lyman / Balmer / Paschen / Brackett / Pfund). Energy-unit toggle (eV / cm⁻¹ / Hz / nm).
- **Atom View** — |ψₙₗₘ|² in five modes: Cloud 2D (Canvas2D signed-thermal slice), Cloud 3D (Three.js volumetric raymarch), Shells, Term Table, and a time-evolved Superposition with the radiating dipole arrow.
- **Propagator View** — emission lines as poles in the complex-frequency plane, with B-field and pressure controls.
- **Path** — a 12-step pedagogical proof chain from the Coulomb potential to the spectral line.

Global controls: color pipeline (CIE 1931 default / Bruton 1996 didactic / monochrome); state round-trips through the URL hash (share or reload); localStorage persistence.

## Three rules

1. **Scientific accuracy is the floor.** Every visible number is NIST-measured, derived from a closed-form equation, or labeled `(schematic)`. No invented values.
2. **Maximum optionality.** Every assumption gets a toggle.
3. **Synced spine.** Instruments are pure functions of `Selection + Conditions + Display`. Coordination lives in the store, never between instruments.

## Scientific fidelity

- **Publication-grade:** hydrogen ψₙₗₘ (closed-form, normalization-tested), hydrogenic energy levels, CIE 1931 color (Wyman 2013 fit, ~1%), Einstein A coefficients (NIST-validated), E1 selection rules. All element _energies_ are NIST-measured.
- **Illustrative, explicitly labeled `(schematic)`:** multi-electron orbital _shapes_ (screened-hydrogenic via Slater's rules — Hartree-Fock is future work) and the Bruton-1996 color toggle.

## Stack

Vite · TypeScript · Three.js · WebGL2 · Canvas2D · Vitest · pnpm. Static build, no backend.

## Develop

```bash
pnpm install
pnpm build      # type-check, bundle, and build the atlas DB (some tests read it)
pnpm test       # vitest
pnpm dev        # http://localhost:5173
```

Click the Hα tick on the Spectrum Bar → watch the Cockpit, Grotrian, and Atom View converge on n=3 → n=2.

## The atlas

A relational SQLite database (`src/atlas/`) of physics & geometry primitives — constants, spectral lines, energy levels, polytopes, lattices, Lie groups, special functions — each joined to its source with a citation. Built from JSON seeds in `src/data/`; the Python ingest tools live in `tools/`. Explore it at [/linelight/atlas/](https://timmiano.com/linelight/atlas/).

## Data & attribution

Atomic data from the [NIST Atomic Spectra Database (ASD)](https://www.nist.gov/pml/atomic-spectra-database); physical constants from [CODATA 2022](https://physics.nist.gov/cuu/Constants/); special functions from the [NIST DLMF](https://dlmf.nist.gov/). These are public-domain reference data; source citations are carried through to each value.

## License

MIT — see [LICENSE](LICENSE).
