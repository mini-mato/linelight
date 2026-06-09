"""CODATA 2022 fundamental-constants ingestion CLI for linelight.

Sister to ingest_nist.py. Fetches the machine-readable CODATA recommended-values
table from NIST and emits typed atlas primitives into
src/data/_relations/constants.codata-2022.json.

Source: https://physics.nist.gov/cuu/Constants/Table/allascii.txt

The allascii.txt format is fixed-column whitespace-aligned text:

  Quantity                                                     Value                  Uncertainty           Unit

We parse a curated subset (the constants linelight actually uses); the full
table has ~350 entries, most of which are derived particle-physics quantities
that linelight has no use for at v1.

Usage:
  uv run python tools/ingest_codata.py fetch --out tools/_fixtures/codata-2022.txt
  uv run python tools/ingest_codata.py convert \\
      --in tools/_fixtures/codata-2022.txt \\
      --out src/data/_relations/constants.codata-2022.json
"""

from __future__ import annotations

import json
import re
import time
from datetime import date
from pathlib import Path
from typing import Any, Optional

import click
import httpx

CODATA_VERSION = "2022"
CODATA_URL = "https://physics.nist.gov/cuu/Constants/Table/allascii.txt"
USER_AGENT = (
    "linelight-tools/0.1 (+https://github.com/mini-mato/linelight; "
    "build-time CODATA ingestion)"
)
POLITE_DELAY_SECONDS = 1.0

# Constants we want, keyed by (NIST quantity-name regex, atlas id, symbol).
# Quantity names are whitespace-normalized before matching.
WANTED: list[tuple[str, str, str, str]] = [
    # (quantity-name regex, atlas id, symbol, unit-override-or-empty)
    (r"^fine-structure constant$", "constant.codata-2022.alpha", "α", ""),
    (r"^inverse fine-structure constant$", "constant.codata-2022.alpha-inv", "α^-1", ""),
    (r"^electron mass$", "constant.codata-2022.m_e", "m_e", ""),
    (r"^proton mass$", "constant.codata-2022.m_p", "m_p", ""),
    (r"^neutron mass$", "constant.codata-2022.m_n", "m_n", ""),
    (r"^vacuum electric permittivity$", "constant.codata-2022.epsilon_0", "ε₀", ""),
    (r"^vacuum mag\.? permeability$", "constant.codata-2022.mu_0", "μ₀", ""),
    (r"^Bohr radius$", "constant.codata-2022.a_0", "a₀", ""),
    (r"^Hartree energy$", "constant.codata-2022.E_h", "E_h", ""),
    (r"^Hartree energy in eV$", "constant.codata-2022.E_h-eV", "E_h", "eV"),
    (r"^Rydberg constant$", "constant.codata-2022.R_infinity", "R_∞", ""),
    (r"^Rydberg constant times hc in eV$", "constant.codata-2022.Ry", "Ry", "eV"),
    (r"^Bohr magneton$", "constant.codata-2022.mu_B", "μ_B", ""),
    (r"^Bohr magneton in eV/T$", "constant.codata-2022.mu_B-eV-T", "μ_B", "eV T^-1"),
    (r"^nuclear magneton$", "constant.codata-2022.mu_N", "μ_N", ""),
    (r"^electron g factor$", "constant.codata-2022.g_e", "g_e", ""),
    (r"^Newtonian constant of gravitation$", "constant.codata-2022.G", "G", ""),
    (r"^Stefan-Boltzmann constant$", "constant.codata-2022.sigma_SB", "σ", ""),
    (r"^Wien displacement law constant$", "constant.codata-2022.b_W", "b", ""),
    (r"^classical electron radius$", "constant.codata-2022.r_e", "r_e", ""),
    (r"^Compton wavelength$", "constant.codata-2022.lambda_C", "λ_C", ""),
    (r"^Thomson cross section$", "constant.codata-2022.sigma_T", "σ_T", ""),
]


@click.group()
def cli() -> None:
    """linelight CODATA 2022 ingestion."""


@cli.command("fetch")
@click.option("--out", "out_path", required=True, type=click.Path())
def cmd_fetch(out_path: str) -> None:
    """Pull the CODATA 2022 recommended-values table from NIST."""
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    click.echo(f"[fetch] GET {CODATA_URL}")
    time.sleep(POLITE_DELAY_SECONDS)
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30.0) as client:
        resp = client.get(CODATA_URL)
        resp.raise_for_status()
    out.write_text(resp.text)
    click.echo(f"[fetch] wrote {out} ({len(resp.text)} bytes)")


# CODATA allascii.txt has a header block followed by fixed-column rows.
# Header is delimited by a row of '-' characters. We split on that.
_DASH_LINE = re.compile(r"^-{20,}\s*$")


def _parse_allascii(text: str) -> list[dict[str, str]]:
    """Parse the CODATA allascii.txt format. Returns one dict per row.

    Columns are whitespace-aligned; the canonical column boundaries are at
    fixed character positions, but those positions have shifted between
    CODATA editions. We instead split on multi-space runs, which is robust
    enough for our needs (and the values themselves never contain double-space).
    """
    # Skip everything up to and including the line of dashes after the header.
    rows: list[dict[str, str]] = []
    in_data = False
    for line in text.splitlines():
        if _DASH_LINE.match(line):
            in_data = not in_data if not in_data else in_data
            continue
        if not in_data or not line.strip():
            continue
        # Collapse consecutive whitespace; we treat 2+ spaces as column delimiters.
        # Format: <quantity (may contain single spaces)>  <value>  <uncertainty>  <unit>
        # We match from the right: unit is last whitespace-delimited token; uncertainty
        # before it; value before that; everything else is the quantity.
        parts = re.split(r"\s{2,}", line.strip())
        if len(parts) < 4:
            # Some entries (e.g. dimensionless ratios) may have empty unit -> 3 parts
            parts = parts + [""] * (4 - len(parts))
        quantity, value, uncertainty, unit = parts[0], parts[1], parts[2], parts[3]
        rows.append(
            {
                "quantity": quantity.strip(),
                "value": value.strip(),
                "uncertainty": uncertainty.strip(),
                "unit": unit.strip(),
            }
        )
    return rows


def _parse_value(s: str) -> Optional[float]:
    """Parse a CODATA value string. Spaces are thousands separators in the
    recommended notation; '...' indicates exact-by-definition (no uncertainty).
    """
    if not s:
        return None
    s = s.replace(" ", "").replace("...", "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse_uncertainty(s: str) -> Optional[float]:
    """Parse a CODATA uncertainty. 'exact' or '(exact)' -> 0.0."""
    if not s:
        return None
    sl = s.strip().lower()
    if "exact" in sl:
        return 0.0
    return _parse_value(s)


@cli.command("convert")
@click.option("--in", "in_path", required=True, type=click.Path(exists=True, dir_okay=False))
@click.option("--out", "out_path", required=True, type=click.Path())
def cmd_convert(in_path: str, out_path: str) -> None:
    """Parse CODATA allascii.txt and emit linelight atlas-primitive JSON."""
    text = Path(in_path).read_text()
    rows = _parse_allascii(text)
    today = date.today().isoformat()

    # Build an index from canonicalized quantity name to row.
    by_quantity: dict[str, dict[str, str]] = {}
    for r in rows:
        # Canonicalize: collapse internal whitespace, lowercase no, keep hyphens.
        key = re.sub(r"\s+", " ", r["quantity"]).strip()
        by_quantity[key] = r

    constants: list[dict[str, Any]] = []
    misses: list[str] = []

    for pattern, atlas_id, symbol, unit_override in WANTED:
        regex = re.compile(pattern, re.IGNORECASE)
        match = next(
            (r for q, r in by_quantity.items() if regex.match(q)),
            None,
        )
        if match is None:
            misses.append(pattern)
            continue
        value = _parse_value(match["value"])
        uncertainty = _parse_uncertainty(match["uncertainty"])
        rel_unc: Optional[float] = None
        if value is not None and value != 0 and uncertainty is not None:
            rel_unc = abs(uncertainty / value)
        unit = unit_override or match["unit"]
        exact = (uncertainty == 0.0) if uncertainty is not None else False
        constants.append(
            {
                "id": atlas_id,
                "family": "constant",
                "name": match["quantity"],
                "symbol": symbol,
                "attrs": {
                    "value": value,
                    "unit": unit,
                    "exact": exact,
                    "relativeUncertainty": rel_unc,
                    "absoluteUncertainty": uncertainty,
                },
                "sourceId": "codata-2022",
                "retrievedAt": today,
            }
        )

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "$schema": "atlas/primitive[family=constant]",
        "retrievedAt": today,
        "source": "codata-2022",
        "constants": constants,
        "missesCount": len(misses),
        "misses": misses,
    }
    out.write_text(json.dumps(payload, indent=2) + "\n")
    click.echo(
        f"[convert] {in_path} -> {out} "
        f"({len(constants)} constants ingested, {len(misses)} regex misses)"
    )
    if misses:
        click.echo("  misses (regex did not match any CODATA row):")
        for m in misses:
            click.echo(f"    - {m}")


if __name__ == "__main__":
    cli()
