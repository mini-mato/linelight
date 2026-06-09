"""Unit tests for tools/ingest_nist.py.

Run from tools/: `uv run --extra dev pytest -q`
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from ingest_nist import (
    ACCEPTABLE_NM,
    EXCELLENT_NM,
    GOOD_NM,
    ElementJSON,
    Line,
    classify_delta,
    closest_match,
    parse_ts_lines,
    parse_tsv,
    rows_to_element,
)

FIXTURE = Path(__file__).parent / "_fixtures" / "H_sample.tsv"


def test_parse_tsv_extracts_expected_columns():
    rows = parse_tsv(FIXTURE.read_text())
    assert len(rows) == 8, "fixture has 8 data rows"
    first = rows[0]
    # Lyman alpha row
    assert first["ritz_wl_vac(nm)"] == "121.5668"
    assert first["Aki(s^-1)"] == "6.2649e+08"
    assert first["Type"] == "E1"
    assert first["conf_i"] == "1s"
    assert first["term_k"] == "2P*"


def test_rows_to_element_validates_against_pydantic_model():
    rows = parse_tsv(FIXTURE.read_text())
    element = rows_to_element("H", rows)
    # Schema validity is enforced by construction; do a round-trip too.
    dumped = element.model_dump()
    re_loaded = ElementJSON.model_validate(dumped)

    assert re_loaded.symbol == "H"
    assert re_loaded.z == 1
    assert re_loaded.name == "hydrogen"
    assert len(re_loaded.lines) == 8
    # Hα — the third row in the fixture
    halpha = next(ln for ln in re_loaded.lines if abs(ln.wavelength_nm_vacuum - 656.2793) < 1e-3)
    assert halpha.einsteinA_per_s == pytest.approx(4.4101e7)
    assert halpha.transitionType == "E1"
    assert halpha.relativeIntensity_NIST == pytest.approx(1800.0)
    # Levels deduplicated
    assert len(re_loaded.levels) >= 2
    assert all(lv.id for lv in re_loaded.levels)


def test_line_model_rejects_non_positive_wavelength():
    with pytest.raises(ValidationError):
        Line(wavelength_nm_vacuum=0.0, retrievedAt="2026-05-02")
    with pytest.raises(ValidationError):
        Line(wavelength_nm_vacuum=-1.0, retrievedAt="2026-05-02")


def test_closest_match_and_classify_delta():
    candidates = [121.5668, 102.5722, 656.2793, 486.2710]
    # Exact-ish: TS Hα is 656.281 nm, NIST Ritz is 656.2793 nm — delta 0.0017 nm
    idx, delta = closest_match(656.281, candidates)
    assert idx == 2
    assert delta == pytest.approx(abs(656.281 - 656.2793))
    assert classify_delta(delta) == "excellent"

    # 0.05 nm offset → good
    assert classify_delta(0.05) == "good"
    # 0.3 nm offset → acceptable
    assert classify_delta(0.3) == "acceptable"
    # 2 nm offset → unmatched
    assert classify_delta(2.0) == "unmatched"

    # Empty candidates
    assert closest_match(500.0, []) is None


def test_classify_delta_boundary_values():
    assert classify_delta(EXCELLENT_NM) == "excellent"
    assert classify_delta(EXCELLENT_NM + 1e-9) == "good"
    assert classify_delta(GOOD_NM) == "good"
    assert classify_delta(ACCEPTABLE_NM) == "acceptable"
    assert classify_delta(ACCEPTABLE_NM + 1e-9) == "unmatched"


def test_parse_ts_lines_extracts_wavelengths_and_sources():
    sample = """
    import type { Element } from '../types'
    export const hydrogen: Element = {
      symbol: 'H',
      lines: [
        { element: 'H', wavelength_nm: 656.281, label: 'Hα' },
        { element: 'H', wavelength_nm: 486.135, label: 'Hβ', source: 'closed-form' },
        { element: 'H', wavelength_nm: 1.0e6, label: '21cm', source: 'NIST-ASD-v5.10' },
      ],
    }
    """
    parsed = parse_ts_lines(sample)
    assert len(parsed) == 3
    assert parsed[0]["wavelength_nm"] == pytest.approx(656.281)
    assert parsed[0]["label"] == "Hα"
    assert parsed[0]["source"] is None
    assert parsed[1]["source"] == "closed-form"
    assert parsed[2]["wavelength_nm"] == pytest.approx(1.0e6)


def test_convert_round_trip_to_disk(tmp_path: Path):
    rows = parse_tsv(FIXTURE.read_text())
    element = rows_to_element("H", rows)
    out = tmp_path / "H.json"
    out.write_text(json.dumps(element.model_dump(), indent=2))
    re_loaded = ElementJSON.model_validate(json.loads(out.read_text()))
    assert re_loaded.symbol == "H"
    assert len(re_loaded.lines) == 8
