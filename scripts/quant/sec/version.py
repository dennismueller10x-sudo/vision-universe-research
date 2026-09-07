"""Version stamps for everything that can change the meaning of a stored number.

Every normalized fact carries these versions so that a later change to a concept
mapping or a formula is detectable in already-persisted data (Phase 4 § 21).
Bump the matching constant whenever the behaviour it names changes.
"""

# Shape of the persisted normalized fact records.
NORMALIZATION_SCHEMA_VERSION = "1.0.0"

# Semantics of period assignment, YTD de-accumulation and PIT resolution.
NORMALIZATION_LOGIC_VERSION = "1.0.0"

# Bumped by quant/config/metric_registry.json itself; this is the minimum the
# code understands.
METRIC_REGISTRY_MIN_VERSION = 1

# Derived-metric formulas. Bump on any change to derived.py's arithmetic.
FORMULA_VERSION = "1.0.0"

# The SEC access adapter (endpoints, fair-access behaviour).
PROVIDER_ADAPTER_VERSION = "sec-edgar-1.0.0"

# Data quality rule set.
QUALITY_RULES_VERSION = "1.0.0"


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
