"""Verify the current product policy against the historical R2 acceptance.

The R2 measurement is immutable.  A later, evidenced removal of debt from
the product universe changes its denominator without changing that measurement.
Only that named membership change may explain a reconciliation delta here.
"""

import json
from pathlib import Path


def _load(root, relative):
    return json.loads((Path(root) / relative).read_text(encoding="utf-8"))


def verify(root):
    report = _load(root, "quant/data/fundamentals/reconciliation.json")
    state = report["overlap"]["acceptedMarketDataState"]
    market = _load(root, "quant/data/universe/market-capability.json")
    universe = _load(root, "quant/data/market/scale/universe-ELIGIBLE_US_EQUITY.json")
    eligibility = _load(root, "quant/data/market/security-master/eligibility.json")
    metrics = _load(root, "quant/data/market/history/coverage-metrics.json")
    chart = metrics["CHART_AVAILABILITY"]
    technical = _load(root, "quant/data/technical/scale/technical-coverage-ELIGIBLE_US_EQUITY.json")

    def require(ok, message):
        if not ok:
            raise ValueError(message)

    require(state["status"] == "CANONICAL_PER_INSTRUMENT" and
            market["source"]["kind"] == "CANONICAL", "canonical market source required")
    accepted, computed = state["accepted"], state["computed"]
    require(accepted["PRODUCT_TITLES"] == chart["denominator"] and
            accepted["HISTORICAL_CHART_AVAILABLE"] == chart["renderable"] and
            accepted["TECHNICAL_HISTORY_ELIGIBLE"] ==
            metrics["TECHNICAL_HISTORY_ELIGIBILITY"]["eligible"],
            "historical R2 acceptance mismatch")
    require(len(chart["notRenderableSymbols"]) == chart["notRenderable"] and
            chart["renderable"] + chart["notRenderable"] == chart["denominator"],
            "incomplete chart exception evidence")
    not_ready = {ticker for ticker, row in technical["perSymbol"].items()
                 if row.get("technical") != "TECHNICAL_READY"}
    require(len(not_ready) == technical["requested"] -
            technical["coverage"]["TECHNICAL_READY"],
            "incomplete technical exception evidence")

    decisions = eligibility["decisions"]
    debt = {row["ticker"]: row for row in decisions
            if row.get("instrument_type") == "DEBT"}
    require(len(debt) == 22 and all(
        row["product_eligibility"] == "EXCLUDED" and
        row["product_eligibility_reason"] == "CONFIRMED_NON_EQUITY:DEBT" and
        row["securityId"] == "ref_" + ticker
        for ticker, row in debt.items()), "22 evidenced debt exclusions required")
    product = {row["securityId"]: row["ticker"] for row in universe["securities"]}
    current = {row["securityId"]: row["ticker"] for row in decisions
               if row["product_eligibility"] != "EXCLUDED"}
    require(len(product) == len(universe["securities"]) and product == current,
            "canonical product membership differs from classified securities")
    require(not {row["securityId"] for row in debt.values()} & product.keys(),
            "excluded debt reintroduced to product universe")

    rows = market["members"]
    require(len(rows) == len(product) and
            {row["m"]: row["s"] for row in rows} == product,
            "market identity join differs from current product universe")
    chart_exceptions = set(chart["notRenderableSymbols"])
    require(all(row["ph"] is (row["s"] not in chart_exceptions) and
                (row["t"] == "TECHNICAL_READY") is (row["s"] not in not_ready)
                for row in rows),
            "current per-instrument states differ from source exception evidence")
    current_chart = sum(row["ph"] is True for row in rows)
    current_technical = sum(row["t"] == "TECHNICAL_READY" for row in rows)
    require(computed == {
        "PRODUCT_TITLES": len(product),
        "HISTORICAL_CHART_AVAILABLE": current_chart,
        "TECHNICAL_HISTORY_ELIGIBLE": current_technical,
    }, "reconciliation differs from current per-instrument market evidence")

    removed_chart_ready = len(debt.keys() - chart_exceptions)
    removed_technical_ready = len(debt.keys() - not_ready)
    expected = {
        "PRODUCT_TITLES": accepted["PRODUCT_TITLES"] - len(debt),
        "HISTORICAL_CHART_AVAILABLE":
            accepted["HISTORICAL_CHART_AVAILABLE"] - removed_chart_ready,
        "TECHNICAL_HISTORY_ELIGIBLE":
            accepted["TECHNICAL_HISTORY_ELIGIBLE"] - removed_technical_ready,
    }
    require(computed == expected,
            f"unexplained market reconciliation delta: {computed} != {expected}")
    require(state["delta"] == {
        "HISTORICAL_CHART_AVAILABLE": -removed_chart_ready,
        "TECHNICAL_HISTORY_ELIGIBLE": -removed_technical_ready,
    } and not state["reconciled"], "historical delta was hidden or altered")
    return {
        "status": "POLICY_ADJUSTED_RECONCILED",
        "historicalAccepted": accepted,
        "currentComputed": computed,
        "excludedDebt": sorted(debt),
        "removedChartReady": removed_chart_ready,
        "removedTechnicalReady": removed_technical_ready,
    }


if __name__ == "__main__":
    print(json.dumps(verify(Path(__file__).resolve().parents[3]), sort_keys=True))
