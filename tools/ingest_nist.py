"""NIST ASD ingestion CLI for linelight.

Subcommands:
  fetch   - pull the Lines table for an element from NIST ASD as TSV
  convert - parse TSV and emit JSON matching the linelight data schema
  verify  - cross-check src/data/elements/<E>.ts wavelengths against NIST

NIST ASD Lines form (canonical TSV column layout, format=3):
  https://physics.nist.gov/PhysRefData/ASD/Html/help.html
  https://physics.nist.gov/cgi-bin/ASD/lines1.pl

Columns we parse (subset of NIST output; presence varies with form options):
  obs_wl_air(nm), obs_wl_vac(nm), ritz_wl_air(nm), ritz_wl_vac(nm),
  Aki(s^-1), Acc., Ei(eV), Ek(eV),
  conf_i, term_i, J_i, conf_k, term_k, J_k, Type, Rel.

We treat ritz_wl_vac (or obs_wl_vac fallback) as the canonical wavelength
since linelight stores everything in vacuum nm.
"""

from __future__ import annotations

import csv
import json
import re
import sys
import time
from datetime import date
from pathlib import Path
from typing import Any, Iterable, Optional

import click
import httpx
from pydantic import BaseModel, Field, field_validator

NIST_VERSION = "NIST-ASD-v5.10"
NIST_BASE_URL = "https://physics.nist.gov/cgi-bin/ASD/lines1.pl"
USER_AGENT = (
    "linelight-tools/0.1 (+https://github.com/mini-mato/linelight; "
    "build-time NIST ASD ingestion)"
)
POLITE_DELAY_SECONDS = 1.0

# Columns we look for. NIST exports them with these exact header names.
WL_VAC_COLS = ("ritz_wl_vac(nm)", "obs_wl_vac(nm)")
WL_AIR_COLS = ("ritz_wl_air(nm)", "obs_wl_air(nm)")


# ---------------------------------------------------------------------------
# Pydantic models — schema validation for emitted JSON
# ---------------------------------------------------------------------------


class Level(BaseModel):
    id: str
    electronConfig: Optional[str] = None
    termSymbol: Optional[str] = None
    j: Optional[str] = None
    energy_eV: Optional[float] = None
    source: str = NIST_VERSION
    retrievedAt: str


class Line(BaseModel):
    wavelength_nm_vacuum: float
    wavelength_nm_air: Optional[float] = None
    upperLevelId: Optional[str] = None
    lowerLevelId: Optional[str] = None
    einsteinA_per_s: Optional[float] = None
    relativeIntensity_NIST: Optional[float] = None
    transitionType: Optional[str] = None
    source: str = NIST_VERSION
    retrievedAt: str

    @field_validator("wavelength_nm_vacuum")
    @classmethod
    def _wl_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("wavelength must be > 0")
        return v


class ElementJSON(BaseModel):
    symbol: str
    z: Optional[int] = None
    name: Optional[str] = None
    groundConfig: Optional[str] = None
    levels: list[Level] = Field(default_factory=list)
    lines: list[Line] = Field(default_factory=list)
    source: str = NIST_VERSION
    retrievedAt: str


# ---------------------------------------------------------------------------
# Element metadata (minimal — Z + name for the symbols linelight ships)
# ---------------------------------------------------------------------------

ELEMENT_META: dict[str, dict[str, Any]] = {
    "H": {"z": 1, "name": "hydrogen", "groundConfig": "1s¹"},
    "He": {"z": 2, "name": "helium", "groundConfig": "1s²"},
    "Li": {"z": 3, "name": "lithium", "groundConfig": "[He] 2s¹"},
    "C": {"z": 6, "name": "carbon", "groundConfig": "[He] 2s² 2p²"},
    "O": {"z": 8, "name": "oxygen", "groundConfig": "[He] 2s² 2p⁴"},
    "Na": {"z": 11, "name": "sodium", "groundConfig": "[Ne] 3s¹"},
    "Mg": {"z": 12, "name": "magnesium", "groundConfig": "[Ne] 3s²"},
    "Ca": {"z": 20, "name": "calcium", "groundConfig": "[Ar] 4s²"},
    "Fe": {"z": 26, "name": "iron", "groundConfig": "[Ar] 3d⁶ 4s²"},
    "Cu": {"z": 29, "name": "copper", "groundConfig": "[Ar] 3d¹⁰ 4s¹"},
    "Hg": {"z": 80, "name": "mercury", "groundConfig": "[Xe] 4f¹⁴ 5d¹⁰ 6s²"},
    "Ne": {"z": 10, "name": "neon", "groundConfig": "[He] 2s² 2p⁶"},
}


# ---------------------------------------------------------------------------
# fetch
# ---------------------------------------------------------------------------


def _build_nist_url(element: str, max_lines: int = 1000) -> str:
    """Build the NIST ASD lines1.pl query for an element, TSV output (format=3).

    The form params are stable but undocumented; these are the canonical ones
    used by the public web UI when 'output=Tab-delimited' is selected.
    """
    params = {
        "spectra": element + "+I",  # neutral atom
        "limits_type": "0",
        "low_w": "",
        "upp_w": "",
        "unit": "1",  # nm
        "submit": "Retrieve+Data",
        "de": "0",
        "format": "3",  # 3 = tab-delimited
        "line_out": "0",
        "remove_js": "on",
        "en_unit": "1",  # eV
        "output": "0",
        "bibrefs": "1",
        "page_size": str(max_lines),
        "show_obs_wl": "1",
        "show_calc_wl": "1",
        "unc_out": "1",
        "order_out": "0",
        "max_low_enrg": "",
        "show_av": "2",
        "max_upp_enrg": "",
        "tsb_value": "0",
        "min_str": "",
        "A_out": "0",
        "intens_out": "on",
        "max_str": "",
        "allowed_out": "1",
        "forbid_out": "1",
        "min_accur": "",
        "min_intens": "",
        "conf_out": "on",
        "term_out": "on",
        "enrg_out": "on",
        "J_out": "on",
        "g_out": "on",
        "type_out": "on",
    }
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{NIST_BASE_URL}?{qs}"


def _strip_html(raw: str) -> str:
    """NIST returns the TSV inside <pre>...</pre> with extra HTML wrapper.

    Extract the <pre> block if present; otherwise return as-is.
    """
    m = re.search(r"<pre>(.*?)</pre>", raw, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return raw.strip()


@click.group()
def cli() -> None:
    """linelight NIST ASD ingestion."""


@cli.command("fetch")
@click.option("--element", required=True, help="Element symbol, e.g. H")
@click.option("--out", "out_path", required=True, type=click.Path(), help="TSV output path")
@click.option(
    "--from-fixture",
    is_flag=True,
    default=False,
    help="Use tools/_fixtures/<E>_sample.tsv instead of HTTP. For offline dev.",
)
@click.option("--max-lines", default=1000, show_default=True)
def cmd_fetch(element: str, out_path: str, from_fixture: bool, max_lines: int) -> None:
    """Pull Lines table for ELEMENT from NIST ASD as TSV."""
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    if from_fixture:
        fixture = Path(__file__).parent / "_fixtures" / f"{element}_sample.tsv"
        if not fixture.exists():
            raise click.ClickException(f"fixture not found: {fixture}")
        out.write_text(fixture.read_text())
        click.echo(f"[fetch] copied fixture {fixture} -> {out}")
        return

    url = _build_nist_url(element, max_lines=max_lines)
    click.echo(f"[fetch] GET {url}")
    time.sleep(POLITE_DELAY_SECONDS)
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30.0) as client:
        resp = client.get(url)
        resp.raise_for_status()
    tsv = _strip_html(resp.text)
    out.write_text(tsv)
    click.echo(f"[fetch] wrote {out} ({len(tsv)} bytes)")


# ---------------------------------------------------------------------------
# convert
# ---------------------------------------------------------------------------


def _coerce_float(s: str) -> Optional[float]:
    s = (s or "").strip().strip('"').strip("=")
    if not s or s in {"-", "—"}:
        return None
    # NIST sometimes brackets uncertain values with [], parens, etc.
    s = re.sub(r"[\[\]\(\)\?]", "", s).strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _strip_cell(s: str) -> str:
    return (s or "").strip().strip('"').strip("=").strip()


def parse_tsv(tsv_text: str) -> list[dict[str, str]]:
    """Parse NIST ASD TSV. NIST sometimes emits BOM, blank lines, and =\"...\" cells.

    Returns a list of dicts keyed by header column name.
    """
    text = tsv_text.lstrip("﻿")
    # Drop blank lines
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return []
    reader = csv.DictReader(lines, delimiter="\t")
    rows: list[dict[str, str]] = []
    for raw in reader:
        # NIST sometimes wraps each cell in ="..." for Excel; strip that.
        rows.append({k: _strip_cell(v) for k, v in raw.items() if k is not None})
    return rows


def _pick_wavelength(row: dict[str, str], cols: tuple[str, ...]) -> Optional[float]:
    for c in cols:
        if c in row:
            v = _coerce_float(row[c])
            if v is not None:
                return v
    return None


def _make_level_id(conf: str, term: str, j: str) -> str:
    """Stable level identifier from NIST conf/term/J columns."""
    parts = [p for p in (conf, term, j) if p]
    return "|".join(parts) if parts else ""


def rows_to_element(symbol: str, rows: Iterable[dict[str, str]]) -> ElementJSON:
    today = date.today().isoformat()
    meta = ELEMENT_META.get(symbol, {})

    levels_by_id: dict[str, Level] = {}
    lines_out: list[Line] = []

    for row in rows:
        wl_vac = _pick_wavelength(row, WL_VAC_COLS)
        wl_air = _pick_wavelength(row, WL_AIR_COLS)
        if wl_vac is None and wl_air is not None:
            # Above ~200 nm air ≈ vacuum to <0.03 nm; acceptable fallback for v0.
            wl_vac = wl_air
        if wl_vac is None:
            continue

        conf_i = row.get("conf_i", "")
        term_i = row.get("term_i", "")
        j_i = row.get("J_i", "")
        conf_k = row.get("conf_k", "")
        term_k = row.get("term_k", "")
        j_k = row.get("J_k", "")
        e_i = _coerce_float(row.get("Ei(eV)", ""))
        e_k = _coerce_float(row.get("Ek(eV)", ""))

        lower_id = _make_level_id(conf_i, term_i, j_i)
        upper_id = _make_level_id(conf_k, term_k, j_k)

        if lower_id and lower_id not in levels_by_id:
            levels_by_id[lower_id] = Level(
                id=lower_id,
                electronConfig=conf_i or None,
                termSymbol=term_i or None,
                j=j_i or None,
                energy_eV=e_i,
                retrievedAt=today,
            )
        if upper_id and upper_id not in levels_by_id:
            levels_by_id[upper_id] = Level(
                id=upper_id,
                electronConfig=conf_k or None,
                termSymbol=term_k or None,
                j=j_k or None,
                energy_eV=e_k,
                retrievedAt=today,
            )

        lines_out.append(
            Line(
                wavelength_nm_vacuum=wl_vac,
                wavelength_nm_air=wl_air,
                upperLevelId=upper_id or None,
                lowerLevelId=lower_id or None,
                einsteinA_per_s=_coerce_float(row.get("Aki(s^-1)", "")),
                relativeIntensity_NIST=_coerce_float(row.get("Rel.", "")),
                transitionType=row.get("Type", "") or None,
                retrievedAt=today,
            )
        )

    return ElementJSON(
        symbol=symbol,
        z=meta.get("z"),
        name=meta.get("name"),
        groundConfig=meta.get("groundConfig"),
        levels=list(levels_by_id.values()),
        lines=lines_out,
        retrievedAt=today,
    )


@cli.command("convert")
@click.option("--in", "in_path", required=True, type=click.Path(exists=True, dir_okay=False))
@click.option("--out", "out_path", required=True, type=click.Path())
@click.option(
    "--symbol", default=None, help="Element symbol; inferred from filename stem if omitted."
)
def cmd_convert(in_path: str, out_path: str, symbol: Optional[str]) -> None:
    """Parse NIST TSV and emit linelight-schema JSON."""
    tsv_text = Path(in_path).read_text()
    rows = parse_tsv(tsv_text)
    if symbol is None:
        symbol = Path(in_path).stem.split("_")[0].split("-")[0]
    element = rows_to_element(symbol, rows)
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(element.model_dump(), indent=2) + "\n")
    click.echo(
        f"[convert] {in_path} -> {out} ({len(element.lines)} lines, {len(element.levels)} levels)"
    )


# ---------------------------------------------------------------------------
# verify
# ---------------------------------------------------------------------------

# Bands of tolerance (in nm) used by `verify`.
EXCELLENT_NM = 0.01
GOOD_NM = 0.1
ACCEPTABLE_NM = 0.5

# Lines whose source is closed-form or schematic are exempt from NIST match.
EXEMPT_SOURCE_TAGS = {"closed-form", "schematic"}


_TS_LINE_RE = re.compile(
    r"\{\s*[^{}]*?wavelength_nm:\s*([0-9eE\.\+\-]+)[^{}]*?\}",
    re.DOTALL,
)


def parse_ts_lines(ts_text: str) -> list[dict[str, Any]]:
    """Extract `lines: [...]` entries from a hand-edited TS element file.

    This is a regex-based shallow parser sufficient for the limited shapes
    used in src/data/elements/*.ts. It looks for `wavelength_nm: <number>`
    plus optional `source: '...'` markers within each object.
    """
    results: list[dict[str, Any]] = []
    for m in _TS_LINE_RE.finditer(ts_text):
        block = m.group(0)
        wl = float(m.group(1))
        source_m = re.search(r"source:\s*['\"]([^'\"]+)['\"]", block)
        label_m = re.search(r"label:\s*['\"]([^'\"]+)['\"]", block)
        results.append(
            {
                "wavelength_nm": wl,
                "source": source_m.group(1) if source_m else None,
                "label": label_m.group(1) if label_m else None,
            }
        )
    return results


def closest_match(target_nm: float, candidates: list[float]) -> Optional[tuple[int, float]]:
    """Return (index, abs_delta_nm) of the closest candidate, or None if list empty."""
    if not candidates:
        return None
    best_i = 0
    best_d = abs(candidates[0] - target_nm)
    for i, c in enumerate(candidates[1:], start=1):
        d = abs(c - target_nm)
        if d < best_d:
            best_d = d
            best_i = i
    return best_i, best_d


def classify_delta(delta_nm: float) -> str:
    if delta_nm <= EXCELLENT_NM:
        return "excellent"
    if delta_nm <= GOOD_NM:
        return "good"
    if delta_nm <= ACCEPTABLE_NM:
        return "acceptable"
    return "unmatched"


@cli.command("verify")
@click.option(
    "--against",
    "against_path",
    required=True,
    type=click.Path(exists=True, dir_okay=False),
    help="TS file (e.g. src/data/elements/H.ts) to verify against NIST",
)
@click.option(
    "--nist-json",
    "nist_json_path",
    type=click.Path(exists=True, dir_okay=False),
    default=None,
    help=(
        "NIST JSON produced by `convert`. If omitted, expected at "
        "src/data/_ingested/<E>.json relative to the TS file's project root."
    ),
)
def cmd_verify(against_path: str, nist_json_path: Optional[str]) -> None:
    """Compare hand-ported TS lines against NIST JSON; report match quality."""
    ts_path = Path(against_path)
    ts_lines = parse_ts_lines(ts_path.read_text())

    if nist_json_path is None:
        symbol = ts_path.stem
        # Walk up to find project root containing src/
        root = ts_path.resolve()
        while root != root.parent and not (root / "src").is_dir():
            root = root.parent
        nist_json_path = str(root / "src" / "data" / "_ingested" / f"{symbol}.json")

    nist_path = Path(nist_json_path)
    if not nist_path.exists():
        raise click.ClickException(f"NIST JSON not found: {nist_path}")
    nist_data = json.loads(nist_path.read_text())
    nist_wls = [float(ln["wavelength_nm_vacuum"]) for ln in nist_data.get("lines", [])]

    excellent: list[dict[str, Any]] = []
    good: list[dict[str, Any]] = []
    acceptable: list[dict[str, Any]] = []
    unmatched: list[dict[str, Any]] = []
    exempt: list[dict[str, Any]] = []

    for ts_line in ts_lines:
        if ts_line.get("source") in EXEMPT_SOURCE_TAGS:
            exempt.append(ts_line)
            continue
        m = closest_match(ts_line["wavelength_nm"], nist_wls)
        if m is None:
            unmatched.append({**ts_line, "delta_nm": None})
            continue
        _, delta = m
        bucket = classify_delta(delta)
        record = {**ts_line, "delta_nm": delta}
        if bucket == "excellent":
            excellent.append(record)
        elif bucket == "good":
            good.append(record)
        elif bucket == "acceptable":
            acceptable.append(record)
        else:
            unmatched.append(record)

    click.echo(f"verify: {ts_path}")
    click.echo(f"  NIST source: {nist_path}")
    click.echo(f"  exempt (closed-form/schematic): {len(exempt)}")
    click.echo(f"  excellent (<= {EXCELLENT_NM} nm): {len(excellent)}")
    click.echo(f"  good      (<= {GOOD_NM} nm): {len(good)}")
    click.echo(f"  acceptable(<= {ACCEPTABLE_NM} nm): {len(acceptable)}")
    click.echo(f"  unmatched (> {ACCEPTABLE_NM} nm): {len(unmatched)}")

    for u in unmatched:
        delta = u.get("delta_nm")
        delta_s = f"{delta:.4f} nm" if delta is not None else "n/a"
        click.echo(
            f"  [UNMATCHED] {u.get('label') or '(no label)'} "
            f"@ {u['wavelength_nm']} nm  closest delta: {delta_s}"
        )

    if unmatched:
        sys.exit(1)


# ---------------------------------------------------------------------------


if __name__ == "__main__":
    cli()
