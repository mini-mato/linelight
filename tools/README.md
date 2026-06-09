# linelight build-time tools

Python tools that fetch authoritative atomic-physics data from NIST and emit
JSON for the linelight TypeScript app to consume.

These scripts are **build-time only** — they never run in the browser.
The TS app depends only on the JSON they produce in `src/data/_ingested/`.

## Install

Requires `uv`. From the repo root:

```bash
cd tools
uv sync
# with dev tools (pytest):
uv sync --extra dev
```

## CLI

The entry point is `tools/ingest_nist.py`. It exposes three subcommands.

### `fetch` — pull NIST ASD lines table as TSV

Online (real network call):

```bash
uv run --project tools tools/ingest_nist.py fetch \
  --element H \
  --out data/_test-fixtures/H.tsv
```

Offline (uses `tools/_fixtures/<E>_sample.tsv`, no network):

```bash
uv run --project tools tools/ingest_nist.py fetch \
  --element H \
  --from-fixture \
  --out data/_test-fixtures/H.tsv
```

The HTTP form is `https://physics.nist.gov/cgi-bin/ASD/lines1.pl` with
`format=3` (tab-delimited). The script:

- sleeps 1 s before each request and identifies itself in `User-Agent`
- requests the first `--max-lines` (default 1000) strongest lines, both
  observed and Ritz wavelengths in **nm**, energies in **eV**
- strips the `<pre>...</pre>` HTML wrapper NIST returns

### `convert` — TSV → linelight-schema JSON

```bash
uv run --project tools tools/ingest_nist.py convert \
  --in data/_test-fixtures/H.tsv \
  --out src/data/_ingested/H.json \
  --symbol H   # optional; inferred from filename stem if omitted
```

Output schema (validated by Pydantic in-process):

```jsonc
{
  "symbol": "H",
  "z": 1,
  "name": "hydrogen",
  "groundConfig": "1s¹",
  "source": "NIST-ASD-v5.10",
  "retrievedAt": "2026-05-02",
  "levels": [
    {
      "id": "1s|2S|1/2",
      "electronConfig": "1s",
      "termSymbol": "2S",
      "j": "1/2",
      "energy_eV": 0.0,
      "source": "NIST-ASD-v5.10",
      "retrievedAt": "2026-05-02",
    },
  ],
  "lines": [
    {
      "wavelength_nm_vacuum": 121.5668,
      "wavelength_nm_air": 121.5023,
      "upperLevelId": "2p|2P*|3/2",
      "lowerLevelId": "1s|2S|1/2",
      "einsteinA_per_s": 6.2649e8,
      "relativeIntensity_NIST": 5000.0,
      "transitionType": "E1",
      "source": "NIST-ASD-v5.10",
      "retrievedAt": "2026-05-02",
    },
  ],
}
```

JSON lands in `src/data/_ingested/<symbol>.json` by convention. The TS app
reads from the hand-ported `src/data/elements/*.ts` files for now —
`_ingested/` is the staging ground for the eventual swap-over.

### `verify` — cross-check hand-ported TS against NIST JSON

```bash
uv run --project tools tools/ingest_nist.py verify \
  --against src/data/elements/H.ts \
  --nist-json src/data/_ingested/H.json   # optional; auto-resolved otherwise
```

For each `wavelength_nm` in the TS file it finds the closest NIST line and
classifies the absolute delta:

| bucket       | tolerance        |
| ------------ | ---------------- |
| `excellent`  | ≤ 0.01 nm        |
| `good`       | ≤ 0.1 nm         |
| `acceptable` | ≤ 0.5 nm         |
| `unmatched`  | > 0.5 nm or none |

Lines tagged `source: 'closed-form'` or `source: 'schematic'` are exempt
(closed-form values come from `physics/`; schematic ones are deliberate
non-physical placeholders).

**Exit status:**

- `0` — all non-exempt lines match within 0.5 nm
- `1` — at least one line is unmatched

## Tests

```bash
cd tools
uv run --extra dev pytest -q
```

The fixture at `tools/_fixtures/H_sample.tsv` is the only data the tests
need; nothing hits the network.

## Limitations / TODO

- `fetch` only requests neutral atoms (`<E>+I`). Ions need a follow-up flag.
- `verify` reads TS files via shallow regex. Acceptable for the current
  hand-edited shape but will need a real TS parser if the line shape grows.
- Air↔vacuum: when NIST returns only `obs_wl_air`, `convert` falls back to
  air as the vacuum value (acceptable above ~200 nm where the difference is
  sub-line-width). Below 200 nm, only Ritz vacuum should be trusted.
- The CI gate (`pnpm verify-data` or equivalent) that wraps `verify` is not
  wired in this scaffold — that's the next step.
