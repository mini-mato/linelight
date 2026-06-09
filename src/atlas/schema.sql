-- linelight atlas — relational primitives + observed instances
-- Ratified 2026-05-04 (cluster A1–A5). See kb/linelight/wiki/decisions/2026-05-04-atlas-schema.md.
--
-- Engine: SQLite + FTS5. Foreign keys ON. Build emits to data/atlas.sqlite from
-- the JSON sources in src/data/_relations/*.seed.json + element JSON files.
--
-- Identity scheme: hierarchical strings (e.g. "polytope.regular.4d.600-cell",
-- "constant.codata-2022.alpha", "coord.3d.parabolic"). Stable, greppable.
--
-- Edge kinds (closed enum): derives_from | instantiates | restricts |
-- separates_in | solves | breaks_to | composes | dual_of.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ---------------------------------------------------------------------------
-- source — provenance for every claim
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS source (
  id            TEXT PRIMARY KEY,             -- 'codata-2022', 'nist-dlmf', 'coxeter-1973'
  citation      TEXT NOT NULL,                -- full bibliographic citation
  doi           TEXT,
  url           TEXT,
  license       TEXT,                         -- 'public-domain' | 'cc-by-4.0' | 'personal-copy' | ...
  version       TEXT,                         -- 'v5.10', '2022', '3rd-ed'
  retrieved_at  TEXT NOT NULL,                -- YYYY-MM-DD
  notes         TEXT
);

-- ---------------------------------------------------------------------------
-- primitive — the abstract thing (constant, polytope, coord-system, etc.)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS primitive (
  id            TEXT PRIMARY KEY,             -- 'constant.codata-2022.alpha'
  family        TEXT NOT NULL CHECK (family IN (
    'constant', 'unit', 'identity',
    'polytope', 'coord-system', 'lattice', 'tiling', 'curved-space',
    'symmetry-group', 'special-function',
    'spectral-line', 'energy-level', 'element', 'series', 'transition-type'
  )),
  name          TEXT NOT NULL,                -- human label
  symbol        TEXT,                         -- 'α', '{5,3}', 'I_h', 'Hα'
  dimension     INTEGER,                      -- d=3, or NULL for n-parametric (see attrs.dimension='n')
  attrs         TEXT NOT NULL DEFAULT '{}',   -- JSON, family-specific (validated at build time)
  source_id     TEXT NOT NULL REFERENCES source(id),
  retrieved_at  TEXT NOT NULL,
  notes         TEXT,
  thumbnail_uri TEXT                           -- relative path to rendered SVG (e.g. 'img/constant.codata-2022.alpha.svg')
);

CREATE INDEX IF NOT EXISTS idx_primitive_family ON primitive(family);
CREATE INDEX IF NOT EXISTS idx_primitive_dimension ON primitive(dimension);

-- ---------------------------------------------------------------------------
-- instance — observed examples connected to primitives
-- ---------------------------------------------------------------------------
-- "Hα observed in solar photosphere", "FCC observed in copper at STP",
-- "T_d observed in methane", "icosahedral I_h observed in C60".

CREATE TABLE IF NOT EXISTS instance (
  id                  TEXT PRIMARY KEY,        -- 'instance.h-alpha.solar-photosphere'
  primitive_id        TEXT NOT NULL REFERENCES primitive(id),
  system              TEXT NOT NULL,           -- 'Sun, photosphere' | 'C60 fullerene' | 'Cu metal at 293 K'
  conditions          TEXT,                    -- JSON: {T_K, P_Pa, B_T, E_V_per_m, ...}
  citation_source_id  TEXT NOT NULL REFERENCES source(id),
  witness             TEXT,                    -- observer / instrument / experiment
  observed_at         TEXT,                    -- YYYY-MM-DD or year if known
  magnitude_value     REAL,                    -- e.g. observed wavelength, lattice constant
  magnitude_unit      TEXT,                    -- 'nm' | 'Å' | 'eV'
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_instance_primitive ON instance(primitive_id);
CREATE INDEX IF NOT EXISTS idx_instance_system ON instance(system);

-- ---------------------------------------------------------------------------
-- edge — typed relationships between primitives
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS edge (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id       TEXT NOT NULL REFERENCES primitive(id),
  to_id         TEXT NOT NULL REFERENCES primitive(id),
  kind          TEXT NOT NULL CHECK (kind IN (
    'derives_from',    -- Ry derives_from {h, m_e, c, alpha}
    'instantiates',    -- C60 instantiates polytope.regular.3d.icosahedron (via I_h symmetry)
    'restricts',       -- polytope.regular.4d restricts polytope.regular.nd at d=4
    'separates_in',    -- hamiltonian.stark separates_in coord.3d.parabolic
    'solves',          -- bessel-J solves pde.cylindrical-helmholtz
    'breaks_to',       -- I_h breaks_to D_5d under C_5 perturbation
    'composes',        -- electric-dipole composes {field.E, observable.position}
    'dual_of'          -- icosahedron dual_of dodecahedron
  )),
  source_id     TEXT REFERENCES source(id),
  notes         TEXT,
  UNIQUE (from_id, to_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_edge_from ON edge(from_id);
CREATE INDEX IF NOT EXISTS idx_edge_to ON edge(to_id);
CREATE INDEX IF NOT EXISTS idx_edge_kind ON edge(kind);

-- ---------------------------------------------------------------------------
-- notation — canonical rendered notation and mechanical integrity checks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notation (
  primitive_id    TEXT PRIMARY KEY REFERENCES primitive(id),
  unicode_symbol TEXT,
  tex_symbol     TEXT,
  ascii_symbol   TEXT,
  codepoints     TEXT NOT NULL DEFAULT '[]',
  verified       INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  issue          TEXT
);

CREATE INDEX IF NOT EXISTS idx_notation_ascii_symbol ON notation(ascii_symbol);
CREATE INDEX IF NOT EXISTS idx_notation_verified ON notation(verified);

-- ---------------------------------------------------------------------------
-- seed_record — source file traceability for each primitive row
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS seed_record (
  primitive_id TEXT PRIMARY KEY REFERENCES primitive(id),
  seed_file    TEXT NOT NULL,
  source_id    TEXT NOT NULL REFERENCES source(id),
  retrieved_at TEXT NOT NULL,
  attrs_sha256 TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seed_record_file ON seed_record(seed_file);

-- ---------------------------------------------------------------------------
-- claim — atomic, queryable facts extracted from primitive attrs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS claim (
  id            TEXT PRIMARY KEY,
  primitive_id  TEXT NOT NULL REFERENCES primitive(id),
  claim_type    TEXT NOT NULL,
  path          TEXT NOT NULL,
  value_json    TEXT NOT NULL,
  unit          TEXT,
  source_id     TEXT NOT NULL REFERENCES source(id),
  retrieved_at  TEXT NOT NULL,
  confidence    TEXT NOT NULL CHECK (confidence IN ('source', 'derived', 'schematic', 'curated')),
  notes         TEXT,
  UNIQUE (primitive_id, path)
);

CREATE INDEX IF NOT EXISTS idx_claim_primitive ON claim(primitive_id);
CREATE INDEX IF NOT EXISTS idx_claim_type ON claim(claim_type);
CREATE INDEX IF NOT EXISTS idx_claim_source ON claim(source_id);
CREATE INDEX IF NOT EXISTS idx_claim_confidence ON claim(confidence);

-- ---------------------------------------------------------------------------
-- render_artifact — emitted SVG inventory for auditability
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS render_artifact (
  primitive_id   TEXT NOT NULL REFERENCES primitive(id),
  artifact_kind  TEXT NOT NULL CHECK (artifact_kind IN ('front', 'back')),
  svg_path       TEXT NOT NULL,
  svg_sha256     TEXT,
  svg_bytes      INTEGER,
  has_title      INTEGER NOT NULL DEFAULT 0 CHECK (has_title IN (0, 1)),
  has_role_img   INTEGER NOT NULL DEFAULT 0 CHECK (has_role_img IN (0, 1)),
  gallery_alt    TEXT,
  pdf_page       INTEGER,
  PRIMARY KEY (primitive_id, artifact_kind)
);

CREATE INDEX IF NOT EXISTS idx_render_artifact_title ON render_artifact(has_title);

-- ---------------------------------------------------------------------------
-- validation_result — deterministic build-time atlas checks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS validation_result (
  id            TEXT PRIMARY KEY,
  check_name    TEXT NOT NULL,
  primitive_id  TEXT REFERENCES primitive(id),
  status        TEXT NOT NULL CHECK (status IN ('pass', 'warn', 'fail')),
  severity      TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  expected      TEXT,
  observed      TEXT,
  message       TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_validation_status ON validation_result(status);
CREATE INDEX IF NOT EXISTS idx_validation_check ON validation_result(check_name);
CREATE INDEX IF NOT EXISTS idx_validation_primitive ON validation_result(primitive_id);

-- ---------------------------------------------------------------------------
-- Family projections for high-signal mathematical queries
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS spectral_transition (
  primitive_id          TEXT PRIMARY KEY REFERENCES primitive(id),
  wavelength_vacuum_nm REAL NOT NULL,
  upper_level_id        TEXT,
  lower_level_id        TEXT,
  transition_type       TEXT,
  series_id             TEXT
);

CREATE INDEX IF NOT EXISTS idx_spectral_transition_wavelength ON spectral_transition(wavelength_vacuum_nm);
CREATE INDEX IF NOT EXISTS idx_spectral_transition_series ON spectral_transition(series_id);

CREATE TABLE IF NOT EXISTS energy_level (
  primitive_id TEXT PRIMARY KEY REFERENCES primitive(id),
  n            INTEGER,
  l            INTEGER,
  j            REAL,
  term_symbol  TEXT,
  energy_ev    REAL,
  energy_cm1   REAL,
  schematic    INTEGER NOT NULL DEFAULT 0 CHECK (schematic IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_energy_level_term ON energy_level(term_symbol);
CREATE INDEX IF NOT EXISTS idx_energy_level_energy_ev ON energy_level(energy_ev);

CREATE TABLE IF NOT EXISTS polytope_invariant (
  primitive_id TEXT PRIMARY KEY REFERENCES primitive(id),
  dimension    TEXT,
  schlafli     TEXT,
  coxeter      TEXT,
  vertices     INTEGER,
  edge_count   INTEGER,
  faces        INTEGER,
  cells        INTEGER
);

CREATE INDEX IF NOT EXISTS idx_polytope_invariant_dimension ON polytope_invariant(dimension);
CREATE INDEX IF NOT EXISTS idx_polytope_invariant_schlafli ON polytope_invariant(schlafli);

CREATE TABLE IF NOT EXISTS group_invariant (
  primitive_id      TEXT PRIMARY KEY REFERENCES primitive(id),
  group_type        TEXT NOT NULL,
  group_order       TEXT,
  lie_algebra_type  TEXT,
  dynkin            TEXT
);

CREATE INDEX IF NOT EXISTS idx_group_invariant_type ON group_invariant(group_type);
CREATE INDEX IF NOT EXISTS idx_group_invariant_order ON group_invariant(group_order);

CREATE TABLE IF NOT EXISTS lattice_invariant (
  primitive_id            TEXT PRIMARY KEY REFERENCES primitive(id),
  dimension               INTEGER,
  bravais_class           TEXT,
  point_group             TEXT,
  conventional_cell_json  TEXT
);

CREATE INDEX IF NOT EXISTS idx_lattice_invariant_dimension ON lattice_invariant(dimension);
CREATE INDEX IF NOT EXISTS idx_lattice_invariant_bravais ON lattice_invariant(bravais_class);

CREATE TABLE IF NOT EXISTS coordinate_system_pde (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  primitive_id    TEXT NOT NULL REFERENCES primitive(id),
  pde             TEXT,
  basis_function  TEXT,
  UNIQUE (primitive_id, pde, basis_function)
);

CREATE INDEX IF NOT EXISTS idx_coordinate_system_pde_pde ON coordinate_system_pde(pde);

-- Symmetry-fill projections (added 2026-05-05) — one row per primitive in the
-- 9 families that had no typed projection in the v1 schema. Same convention:
-- typed columns for high-signal queries; the JSON `attrs` blob remains the
-- source of truth on the `primitive` table.

CREATE TABLE IF NOT EXISTS constant_value (
  primitive_id           TEXT PRIMARY KEY REFERENCES primitive(id),
  value                  REAL,
  unit                   TEXT,
  exact                  INTEGER NOT NULL DEFAULT 0 CHECK (exact IN (0, 1)),
  relative_uncertainty   REAL,
  absolute_uncertainty   REAL,
  derivation_latex       TEXT,
  derived_from_ids_json  TEXT
);

CREATE INDEX IF NOT EXISTS idx_constant_value_unit ON constant_value(unit);
CREATE INDEX IF NOT EXISTS idx_constant_value_exact ON constant_value(exact);

CREATE TABLE IF NOT EXISTS unit_invariant (
  primitive_id      TEXT PRIMARY KEY REFERENCES primitive(id),
  dimension_string  TEXT,
  si_factor         REAL,
  reciprocal        INTEGER NOT NULL DEFAULT 0 CHECK (reciprocal IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_unit_invariant_dimension ON unit_invariant(dimension_string);

CREATE TABLE IF NOT EXISTS identity_invariant (
  primitive_id    TEXT PRIMARY KEY REFERENCES primitive(id),
  equation        TEXT,
  dimension       TEXT,
  numeric_json    TEXT,
  where_json      TEXT
);

CREATE INDEX IF NOT EXISTS idx_identity_invariant_dimension ON identity_invariant(dimension);

CREATE TABLE IF NOT EXISTS tiling_invariant (
  primitive_id   TEXT PRIMARY KEY REFERENCES primitive(id),
  dimension      INTEGER,
  schlafli       TEXT,
  vertex_figure  TEXT,
  geometry       TEXT,             -- 'euclidean' | 'hyperbolic' | 'spherical'
  dual_id        TEXT
);

CREATE INDEX IF NOT EXISTS idx_tiling_invariant_geometry ON tiling_invariant(geometry);
CREATE INDEX IF NOT EXISTS idx_tiling_invariant_schlafli ON tiling_invariant(schlafli);

CREATE TABLE IF NOT EXISTS curved_space_invariant (
  primitive_id            TEXT PRIMARY KEY REFERENCES primitive(id),
  dimension               TEXT,    -- INTEGER or 'n' for parametric
  curvature_k             REAL,    -- -1, 0, +1 for H^n / E^n / S^n
  model                   TEXT,
  isotropy                TEXT,
  isometry_group_order    TEXT,
  line_element            TEXT
);

CREATE INDEX IF NOT EXISTS idx_curved_space_invariant_curvature ON curved_space_invariant(curvature_k);
CREATE INDEX IF NOT EXISTS idx_curved_space_invariant_dimension ON curved_space_invariant(dimension);

CREATE TABLE IF NOT EXISTS special_function_invariant (
  primitive_id          TEXT PRIMARY KEY REFERENCES primitive(id),
  defining_equation     TEXT,
  recurrence            TEXT,
  orthogonality_weight  TEXT,
  parameters_json       TEXT
);

CREATE TABLE IF NOT EXISTS element_invariant (
  primitive_id           TEXT PRIMARY KEY REFERENCES primitive(id),
  z                      INTEGER,
  ground_config          TEXT,
  ground_term            TEXT,
  ionization_energy_ev   REAL,
  atomic_mass_u          REAL
);

CREATE INDEX IF NOT EXISTS idx_element_invariant_z ON element_invariant(z);

CREATE TABLE IF NOT EXISTS series_invariant (
  primitive_id                  TEXT PRIMARY KEY REFERENCES primitive(id),
  element_id                    TEXT,
  lower_n                       INTEGER,
  region                        TEXT,
  series_limit_wavelength_nm    REAL,
  named_after                   TEXT
);

CREATE INDEX IF NOT EXISTS idx_series_invariant_element ON series_invariant(element_id);
CREATE INDEX IF NOT EXISTS idx_series_invariant_region ON series_invariant(region);

CREATE TABLE IF NOT EXISTS transition_type_invariant (
  primitive_id                    TEXT PRIMARY KEY REFERENCES primitive(id),
  multipole_order                 TEXT,
  parity                          TEXT,
  selection_rules_json            TEXT,
  lifetime_order_of_magnitude_s   REAL,
  schematic                       INTEGER NOT NULL DEFAULT 0 CHECK (schematic IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_transition_type_invariant_parity ON transition_type_invariant(parity);

-- ---------------------------------------------------------------------------
-- primitive_fts — FTS5 index for search
-- ---------------------------------------------------------------------------

CREATE VIRTUAL TABLE IF NOT EXISTS primitive_fts USING fts5(
  id UNINDEXED,
  family,
  name,
  symbol,
  notes,
  attrs,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- ---------------------------------------------------------------------------
-- instance_fts — FTS5 index over observed examples
-- ---------------------------------------------------------------------------

CREATE VIRTUAL TABLE IF NOT EXISTS instance_fts USING fts5(
  id UNINDEXED,
  primitive_id UNINDEXED,
  system,
  witness,
  notes,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- ---------------------------------------------------------------------------
-- Convenience views
-- ---------------------------------------------------------------------------

-- Every constant with its source citation.
CREATE VIEW IF NOT EXISTS v_constant AS
SELECT
  p.id, p.name, p.symbol,
  json_extract(p.attrs, '$.value')                  AS value,
  json_extract(p.attrs, '$.unit')                   AS unit,
  json_extract(p.attrs, '$.relativeUncertainty')    AS rel_uncertainty,
  json_extract(p.attrs, '$.exact')                  AS exact,
  s.citation                                        AS source_citation,
  s.url                                             AS source_url,
  p.retrieved_at
FROM primitive p
JOIN source s ON s.id = p.source_id
WHERE p.family = 'constant';

-- Primitives with at least one observed instance, count of instances.
CREATE VIEW IF NOT EXISTS v_primitive_with_instance_count AS
SELECT
  p.id, p.family, p.name, p.symbol, p.dimension,
  COUNT(i.id) AS n_instances
FROM primitive p
LEFT JOIN instance i ON i.primitive_id = p.id
GROUP BY p.id;
