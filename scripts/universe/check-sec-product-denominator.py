#!/usr/bin/env python3
"""Verify SEC coverage uses the current canonical Product universe.

The historical debt exclusions are an independent guard against accidentally
reintroducing securities removed before Tiingo 2.0. This check reads existing
artifacts only; it never changes membership or Fundamentals data.
"""

import argparse
import json
from pathlib import Path


PRODUCT_CLASSES = {"ELIGIBLE", "SEPARATE_CLASS", "REVIEW"}


def validate(root: Path) -> tuple[int, int]:
    master = json.loads(
        (root / "quant/data/market/security-master/eligibility.json").read_text()
    )
    coverage = json.loads(
        (root / "quant/data/fundamentals/coverage-report.json").read_text()
    )
    baseline = json.loads(
        (root / "docs/tiingo2-finalization/tiingo2_production_baseline.json").read_text()
    )

    decisions = master["decisions"]
    if len(decisions) != master["counts"]["universeMembers"]:
        raise ValueError("Security Master decision count differs from its declared universe")
    by_ticker = {row["ticker"]: row for row in decisions}
    by_id = {row["securityId"]: row for row in decisions}
    if len(by_ticker) != len(decisions) or len(by_id) != len(decisions):
        raise ValueError("Duplicate ticker or security ID in the Security Master")
    if any(row["product_eligibility"] not in PRODUCT_CLASSES | {"EXCLUDED"} for row in decisions):
        raise ValueError("Unknown Product eligibility in the Security Master")

    product = [row for row in decisions if row["product_eligibility"] in PRODUCT_CLASSES]
    denominator = coverage["universe"]["PRODUCT_TITLES"]
    if master["counts"]["productUniverse"] != len(product) or denominator != len(product):
        raise ValueError(
            f"Product denominator mismatch: coverage={denominator}, "
            f"canonical={len(product)}, master declaration={master['counts']['productUniverse']}"
        )

    protected = baseline["baselineConsumerRemovedBeforeThisRun"]
    if len(protected) != 22 or len({row["securityId"] for row in protected}) != 22:
        raise ValueError("Historical debt exclusion register must contain 22 distinct IDs")
    for entry in protected:
        row = by_id.get(entry["securityId"])
        if (row is None or row["ticker"] != entry["ticker"]
                or row["instrument_type"] != "DEBT"
                or row["product_eligibility"] != "EXCLUDED"
                or by_ticker.get(entry["ticker"]) is not row):
            raise ValueError(
                f"Historically excluded debt security changed or re-entered Product: "
                f"{entry['ticker']} ({entry['securityId']})"
            )

    for name, metric in coverage["metrics"].items():
        count = metric["COUNT"]
        percentage = metric["PERCENT_OF_PRODUCT_UNIVERSE"]
        if not isinstance(count, int) or count < 0 or count > denominator:
            raise ValueError(f"{name}: invalid coverage count {count} of {denominator}")
        if not isinstance(percentage, (int, float)) or not 0 <= percentage <= 100:
            raise ValueError(f"{name}: invalid coverage percentage {percentage}")
    return denominator, coverage["fundamentals"]["COMPANY_FACTS_AVAILABLE"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    try:
        titles, facts = validate(args.root)
    except (KeyError, ValueError) as exc:
        parser.exit(1, f"SEC Product denominator gate: {exc}\n")
    print(f"Nenner {titles}, davon {facts} mit Company Facts; 22 historische Debt-Ausschluesse intakt.")
