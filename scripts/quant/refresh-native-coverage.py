"""Reaggregate existing canonical summaries without ingestion or history rebuild."""
import argparse
import contextlib
import hashlib
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from quant import cli
from quant.sec import universe_coverage


def materialize_native_coverage(root):
    root = Path(root).resolve()
    inputs = [root / "quant/data/universe", root / "quant/data/sec/canonical",
              root / "quant/data/sec/consumer", root / "quant/data/sec/canonical_index.json"]

    def fingerprints():
        return {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
                for directory in inputs if directory.exists()
                for path in ([directory] if directory.is_file() else sorted(directory.rglob("*")))
                if path.is_file()}

    before = fingerprints()
    universe = universe_coverage.load_universe(root)
    if not universe["present"]:
        raise ValueError("CURRENT_CANONICAL_UNIVERSE_REQUIRED")
    records = universe_coverage.load_issuer_shards(root)
    reports = universe_coverage.reports_from_records(root, records, universe=universe)
    # Reuse the same producer as the existing daily downstream. It writes
    # aggregate metadata and compact issuer summaries, never raw facts/prices.
    previous_root = cli.ROOT
    try:
        cli.ROOT = root
        with contextlib.redirect_stdout(io.StringIO()):
            cli._write_universe_reports(reports, cli.MetricRegistry.load())
    finally:
        cli.ROOT = previous_root
    if before != fingerprints():
        raise ValueError("NATIVE_AGGREGATION_CHANGED_CANONICAL_INPUT")
    after_records = universe_coverage.load_issuer_shards(root)
    if any(after_records.get(issuer) != record for issuer, record in records.items()):
        raise ValueError("NATIVE_AGGREGATION_CHANGED_EXISTING_ISSUER_SUMMARY")
    return {"schemaVersion": "tiingo2-native-coverage-1",
            "source": "EXISTING_CANONICAL_ISSUER_SUMMARIES",
            "productTitles": reports["members"],
            "companyFactsAvailable": reports["coverage"]["fundamentals"]["COMPANY_FACTS_AVAILABLE"],
            "providerRequests": 0, "priceHistoryRebuilt": False,
            "canonicalInputsUnchanged": True,
            "sourceIssuerSummariesUnchanged": True,
            "artifactPaths": ["quant/data/fundamentals/" + name + ".json" for name in
                              ("coverage-report", "history-coverage", "overlap", "quality", "gaps", "manifest")]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    args = parser.parse_args()
    print(json.dumps(materialize_native_coverage(args.root)))
