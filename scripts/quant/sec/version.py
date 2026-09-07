"""Version stamps for everything that can change the meaning of a stored number.

Every normalized fact carries these versions so that a later change to a concept
mapping or a formula is detectable in already-persisted data (Phase 4 § 21).
Bump the matching constant whenever the behaviour it names changes.
"""

# Shape of the persisted normalized fact records.
NORMALIZATION_SCHEMA_VERSION = "1.0.0"

# Semantics of period assignment, YTD de-accumulation and PIT resolution.
#
# 1.1.0 — cover-date instants (dei:EntityCommonStockSharesOutstanding) are
#         assigned to the last CLOSED reporting period instead of the period
#         their cover date falls into; a standalone quarter is no longer
#         reconstructed from cumulative periods that are out of order.
NORMALIZATION_LOGIC_VERSION = "1.1.0"

# Bumped by quant/config/sec-metric-registry.json itself; this is the minimum the
# code understands.
METRIC_REGISTRY_MIN_VERSION = 1

# Derived-metric formulas. Bump on any change to derived.py's arithmetic.
FORMULA_VERSION = "1.0.0"

# The SEC access adapter (endpoints, fair-access behaviour).
PROVIDER_ADAPTER_VERSION = "sec-edgar-1.0.0"

# Data quality rule set.
QUALITY_RULES_VERSION = "1.0.0"


# Files whose content defines NORMALIZATION_LOGIC_VERSION. Changing any of them
# changes the meaning of stored facts, so the version above has to move with
# them — otherwise `pipeline._is_current` treats a cached factbook as current
# and the new logic never runs. That happened once: a cover-date fix was
# deployed, every run reported success, and nothing was re-normalized.
# test_version_discipline.py turns that into a failing test instead.
NORMALIZATION_SOURCES = (
    "normalize.py", "fiscal.py", "periods.py", "derived.py", "canonical.py",
)

# sha256 over NORMALIZATION_SOURCES, recorded when the version above was last
# bumped. Update BOTH together.
NORMALIZATION_SOURCE_DIGEST = (
    "24c65dba1211f05d4854c74b67841b3f1934c4254466f068dfdff28d824cd8c3"
)


def normalization_source_digest():
    """Hash of the modules that define normalization semantics."""
    import hashlib
    from pathlib import Path

    here = Path(__file__).resolve().parent
    digest = hashlib.sha256()
    for name in NORMALIZATION_SOURCES:
        digest.update(name.encode("utf-8"))
        digest.update((here / name).read_bytes())
    return digest.hexdigest()


def version_stamp(metric_registry_version=None):
    """Return the full version block embedded in every generated artifact."""
    stamp = {
        "normalization_schema": NORMALIZATION_SCHEMA_VERSION,
        "normalization_logic": NORMALIZATION_LOGIC_VERSION,
        "formula": FORMULA_VERSION,
        "provider_adapter": PROVIDER_ADAPTER_VERSION,
        "quality_rules": QUALITY_RULES_VERSION,
    }
    if metric_registry_version is not None:
        stamp["metric_registry"] = metric_registry_version
    return stamp
