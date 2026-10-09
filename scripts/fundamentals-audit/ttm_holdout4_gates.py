"""Gates des TTM-Holdouts v4 aus den Auswertungszeilen (praeregistriert, artifacts/FUNDAMENTAL-TTM-HOLDOUT4-PREREG.json).
Wie v3 (ttm_holdout3_gates.py, unveraendert) plus Schicht-Gates SAME_DAY, STUB_PERIOD, SPLIT_YEAR.
  python3 ttm_holdout4_gates.py <prereg.json> <rows.jsonl> [<rows.jsonl> ...] > result.json
"""
import json
import sys
from collections import Counter, defaultdict


def rate(n, d):
    return round(100.0 * n / d, 4) if d else None


def main():
    prereg = json.load(open(sys.argv[1]))
    rows = [json.loads(line) for path in sys.argv[2:] for line in open(path)]
    errors = [r for r in rows if r["class"] == "EVALUATOR_ERROR"]
    rows = [r for r in rows if r["class"] != "EVALUATOR_ERROR"]
    issuers = {r["cik"] for r in rows} | {r["cik"] for r in errors}
    cases = {(r["cik"], r["end"], r["kind"]) for r in rows}

    def summarize(subset):
        c = Counter(r["class"] for r in subset)
        truth_unavailable = sum(c[k] for k in ("TRUE_UNAVAILABLE", "FALSE_AVAILABLE"))
        truth_available = sum(c[k] for k in ("CORRECT", "FALSE_MISSING", "WRONG_PERIOD", "WRONG_CONCEPT", "WRONG_VALUE"))
        core_and_truth = truth_available - c["FALSE_MISSING"]
        return {"counts": dict(c), "truthUnavailable": truth_unavailable, "truthAvailable": truth_available,
                "coreAndTruthAvailable": core_and_truth,
                "FALSE_AVAILABLE": rate(c["FALSE_AVAILABLE"], truth_unavailable),
                "WRONG_VALUE": rate(c["WRONG_VALUE"], core_and_truth),
                "WRONG_CONCEPT": rate(c["WRONG_CONCEPT"], core_and_truth),
                "WRONG_PERIOD": rate(c["WRONG_PERIOD"], core_and_truth),
                "FALSE_MISSING": rate(c["FALSE_MISSING"], truth_available)}

    overall = summarize(rows)
    by_stratum = {}
    tagged = defaultdict(list)
    for r in rows:
        for t in r.get("tags", []):
            tagged[t].append(r)
    for stratum in prereg["sampling"]["strata"]:
        subset = tagged.get(stratum, [])
        s = summarize(subset)
        s["cases"] = len({(r["cik"], r["end"], r["kind"]) for r in subset})
        s["underpopulated"] = s["cases"] < prereg["gates"]["stratumMinimumCases"]
        by_stratum[stratum] = s

    gates = prereg["gates"]
    results = {}
    for name, limit in gates["overallMaxPercent"].items():
        value = overall[name]
        results[name] = {"value": value, "limit": limit, "pass": value is not None and value <= limit}
    results["CASES"] = {"value": len(cases), "limit": gates["minimumCases"], "pass": len(cases) >= gates["minimumCases"]}
    err = rate(len(errors), len(issuers))
    results["EVALUATOR_ERRORS"] = {"value": err, "limit": gates["maxEvaluatorErrorPercentOfIssuers"],
                                   "pass": (err or 0) <= gates["maxEvaluatorErrorPercentOfIssuers"]}
    stratum_fail = []
    for stratum, s in by_stratum.items():
        for name in gates["stratumCorrectnessGates"]:
            denominator = s["truthUnavailable"] if name == "FALSE_AVAILABLE" else s["coreAndTruthAvailable"]
            if denominator >= gates["stratumMinimumEvaluations"] and (s[name] or 0) > gates["stratumMaxPercent"]:
                stratum_fail.append({"stratum": stratum, "gate": name, "value": s[name]})
    results["STRATA"] = {"failures": stratum_fail, "limit": gates["stratumMaxPercent"], "pass": not stratum_fail}
    # FISCAL_CHANGE_WRONG_PERIOD: Fenster ueber einen Geschaeftsjahreswechsel falsch gesetzt = WRONG_PERIOD oder
    # FALSE_AVAILABLE in der Schicht fy_change, bezogen auf alle ihre Auswertungen; zu wenige Faelle = nicht pruefbar = FAIL
    fc_rows = tagged.get("fy_change", [])
    fc_cases = len({(r["cik"], r["end"], r["kind"]) for r in fc_rows})
    fc_bad = sum(1 for r in fc_rows if r["class"] in ("WRONG_PERIOD", "FALSE_AVAILABLE"))
    value = rate(fc_bad, len(fc_rows))
    results["FISCAL_CHANGE_WRONG_PERIOD"] = {"value": value, "limit": gates["fiscalChangeWrongPeriodMaxPercent"],
                                             "evaluations": len(fc_rows), "cases": fc_cases, "bad": fc_bad,
                                             "minimumCases": gates["fiscalChangeMinimumCases"],
                                             "pass": fc_cases >= gates["fiscalChangeMinimumCases"] and value is not None
                                             and value <= gates["fiscalChangeWrongPeriodMaxPercent"]}
    # Schicht-Gates: Anteil falscher Auswertungen (FALSE_AVAILABLE, WRONG_VALUE, WRONG_CONCEPT, WRONG_PERIOD) an allen
    # Auswertungen der Schicht; zu wenige Faelle = nicht pruefbar = FAIL
    for gate, spec in gates["stratumGates"].items():
        sub = tagged.get(spec["stratum"], [])
        n_cases = len({(r["cik"], r["end"], r["kind"]) for r in sub})
        bad = sum(1 for r in sub if r["class"] in ("FALSE_AVAILABLE", "WRONG_VALUE", "WRONG_CONCEPT", "WRONG_PERIOD"))
        value = rate(bad, len(sub))
        results[gate] = {"stratum": spec["stratum"], "value": value, "limit": spec["maxPercent"], "evaluations": len(sub),
                         "cases": n_cases, "bad": bad, "minimumCases": spec["minimumCases"],
                         "pass": n_cases >= spec["minimumCases"] and value is not None and value <= spec["maxPercent"]}
    verdict = "PASS" if all(v["pass"] for v in results.values()) else "FAIL"
    print(json.dumps({"schema": "vu-fundamental-ttm-holdout4-result-1.0.0", "verdict": verdict, "gates": results,
                      "issuers": len(issuers), "cases": len(cases), "evaluations": len(rows),
                      "evaluatorErrors": errors[:50], "overall": overall, "byStratum": by_stratum,
                      "byEval": {e: summarize([r for r in rows if r["eval"] == e]) for e in ("early", "knownFrom", "final")},
                      "falseMissingReasons": dict(Counter(str(r["detail"]) for r in rows if r["class"] == "FALSE_MISSING")),
                      "failures": [r for r in rows if r["class"] in ("FALSE_AVAILABLE", "WRONG_VALUE", "WRONG_CONCEPT", "WRONG_PERIOD")]},
                     indent=1))


if __name__ == "__main__":
    main()
