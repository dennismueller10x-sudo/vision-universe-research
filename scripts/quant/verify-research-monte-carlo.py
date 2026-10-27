#!/usr/bin/env python3
"""Independent stdlib reference for conditional Monte Carlo, not data certification.

Usage: python3 verify-research-monte-carlo.py input.json result.json
   or: JSON {"input": ..., "result": ...} on stdin with --stdin.
No imports of the JavaScript implementation or recorded expected results.
"""
import json
import math
import sys


def reference(config):
    state = config["seed"]

    def random_index(n):
        nonlocal state
        limit = (0xffffffff // n) * n
        while True:
            state ^= (state << 13) & 0xffffffff
            state ^= state >> 17
            state ^= (state << 5) & 0xffffffff
            state &= 0xffffffff
            value = state - 1
            if value < limit:
                return value % n

    returns = [o["return"] for o in config["observations"]]
    if config["costs"]["basis"] == "PER_SIDE_NOTIONAL":
        cost = (config["costs"]["feeBps"] + config["costs"]["slippageBps"]) / 10000
        returns = [(1 + r) * (1 - cost) / (1 + cost) - 1 for r in returns]
    metrics = {"endCapital": [], "totalReturn": [], "maxDrawdown": [], "longestLossStreak": []}
    paths = []
    block = config.get("blockLength", 1)
    initial = config["initialCapital"]
    for simulation in range(config["simulations"]):
        equity = initial
        peak = initial
        drawdown = 0
        streak = longest = 0
        path = {"simulation": simulation, "equity": [equity], "sourceIndices": []}
        for t in range(config["horizon"]):
            if config["model"] == "TRADE_IID" or t % block == 0:
                start = random_index(len(returns))
            index = start if config["model"] == "TRADE_IID" else (start + t % block) % len(returns)
            r = returns[index]
            equity *= 1 + r
            peak = max(peak, equity)
            drawdown = min(drawdown, equity / peak - 1)
            streak = streak + 1 if r < 0 else 0
            longest = max(longest, streak)
            path["equity"].append(equity)
            path["sourceIndices"].append(index)
        metrics["endCapital"].append(equity)
        metrics["totalReturn"].append(equity / initial - 1)
        metrics["maxDrawdown"].append(drawdown)
        metrics["longestLossStreak"].append(longest)
        if simulation < config.get("retainPaths", 0):
            paths.append(path)
    return metrics, paths


def quantile(values, p):
    k = (len(values) - 1) * p
    i = math.floor(k)
    return values[i] + (values[min(i + 1, len(values) - 1)] - values[i]) * (k - i)


def verify(config, result):
    checks = []
    metrics, paths = reference(config)
    ps = config.get("percentiles", [0.01, 0.05, 0.5, 0.95, 0.99])
    epsilon = min(1, math.sqrt(math.log(40) / (2 * config["simulations"])))

    def close(actual, expected, label):
        if not isinstance(actual, (int, float)) or not math.isfinite(actual) or not math.isclose(actual, expected, rel_tol=1e-12, abs_tol=1e-12):
            raise AssertionError(f"{label}: {actual!r} != {expected!r}")

    for key, values in metrics.items():
        got = result["distributions"][key]
        ordered = sorted(values)
        close(got["min"], ordered[0], key + ".min")
        close(got["max"], ordered[-1], key + ".max")
        close(got["mean"], math.fsum(values) / len(values), key + ".mean")
        assert len(got["quantiles"]) == len(ps)
        for i, p in enumerate(ps):
            row = got["quantiles"][i]
            close(row["p"], p, key + ".p")
            close(row["value"], quantile(ordered, p), key + ".quantile")
            for side, q in enumerate([p - epsilon, p + epsilon]):
                unbounded = q <= 0 if side == 0 else q >= 1
                if unbounded:
                    assert row["conditionalMonteCarloBand"][side] is None
                    assert row["conditionalMonteCarloBandBounds"][side] == "UNBOUNDED"
                else:
                    close(row["conditionalMonteCarloBand"][side], ordered[max(0, math.ceil(len(ordered) * q) - 1)], key + ".band")
                    assert row["conditionalMonteCarloBandBounds"][side] == "FINITE"
        checks.append(key + ":all_statistics")
    assert len(paths) == len(result["paths"])
    for expected, actual in zip(paths, result["paths"]):
        assert expected["simulation"] == actual["simulation"]
        assert expected["sourceIndices"] == actual["sourceIndices"], "seeded source indices differ"
        assert len(expected["equity"]) == len(actual["equity"])
        for i, (want, got) in enumerate(zip(expected["equity"], actual["equity"])):
            close(got, want, f"path.{expected['simulation']}.{i}")
    close(result["uncertainty"]["cdfEpsilon"], epsilon, "dkw")
    assert result["synthetic"] is True and result["forecast"] is False
    assert result["certification"] == "NOT_CERTIFIED" and result["productionApproved"] is False
    checks.extend(["seeded_paths", "conditional_DKW", "no_certification"])
    return {"ok": True, "reference": "independent-python-stdlib", "checks": checks,
            "simulations": config["simulations"], "horizon": config["horizon"], "relativeTolerance": 1e-12,
            "note": "Independent numerical reproduction, not independent historical/statistical evidence."}


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--stdin":
        payload = json.load(sys.stdin)
        config, result = payload["input"], payload["result"]
    elif len(sys.argv) == 3:
        with open(sys.argv[1], encoding="utf-8") as f:
            config = json.load(f)
        with open(sys.argv[2], encoding="utf-8") as f:
            result = json.load(f)
    else:
        raise SystemExit(__doc__)
    print(json.dumps(verify(config, result), separators=(",", ":")))


if __name__ == "__main__":
    main()
