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
#
# 1.2.0 — a cover-date instant no longer publishes its cover date as the cell's
#         period end. The end date comes from what the company itself reported
#         for the same fiscal period.
#
# 1.3.0 — a borrowed period end must not fall after the cover date. Version
#         1.2.0 shipped without that guard, and in the early years the fiscal
#         calendar cannot place unambiguously it borrowed a date a full year
#         later, so a filing appeared to know a balance sheet that had not
#         happened yet.
#
# 1.4.0 — availability reduced to a date never moves earlier than the official
#         filing date (an acceptance timestamp legitimately falls on the
#         previous day), and a derived fact cites the filing that made it
#         knowable rather than the first of its inputs.
#
# 1.5.0 — a fiscal-year label taken from an annual filing's own `fy` field is
#         refused when it would repeat or precede the previous fiscal year.
#         NVDA's 10-Ks for the years ending January 2011 to January 2014 tag it
#         one year low, which produced two fiscal years labelled 2010, no 2014,
#         and four years off by one.
#
# 1.6.0 — EBITDA ist ableitbar. Die Metrikregistry 1.1.0 mappt
#         depreciation_and_amortization; damit faellt der Eintrag aus
#         UNSUPPORTED_METRICS weg und der Wert wird gerechnet statt
#         weggelassen. Fuer jeden bereits gespeicherten Factbook heisst
#         das: neu normalisieren, sonst fehlt EBITDA dort weiter und
#         niemand merkt es.
NORMALIZATION_LOGIC_VERSION = "1.6.0"

# Bumped by quant/config/sec-metric-registry.json itself; this is the minimum the
# code understands.
METRIC_REGISTRY_MIN_VERSION = 1

# Derived-metric formulas. Bump on any change to derived.py's arithmetic.
FORMULA_VERSION = "1.1.0"

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
    "1c9c3c7ffa3af534ed8dedce038d9db41ea405143d797b466956b8b146230b99"
)


def normalization_source_digest():
    """Hash of the modules that define normalization semantics.

    Git stores these Python sources with LF. A Windows checkout may expose the
    identical blobs as CRLF through core.autocrlf; line-ending conversion does
    not change Python semantics and must not look like a normalization change.
    """
    import hashlib
    from pathlib import Path

    here = Path(__file__).resolve().parent
    digest = hashlib.sha256()
    for name in NORMALIZATION_SOURCES:
        digest.update(name.encode("utf-8"))
        digest.update((here / name).read_bytes().replace(b"\r\n", b"\n"))
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
