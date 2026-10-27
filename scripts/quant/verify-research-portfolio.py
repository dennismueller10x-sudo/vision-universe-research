#!/usr/bin/env python3
"""Independent decimal cash/unit oracle for the V6 ledger (synthetic cases).

No real history is generated. Python builds predeclared test cases and uses
Decimal accounting/analytic equations rather than importing JS finance code.
"""
import argparse
import hashlib
import json
import subprocess
from decimal import Decimal, getcontext
from pathlib import Path

getcontext().prec = 50
D = Decimal
ROOT = Path(__file__).resolve().parents[2]
H = "a" * 64
DATES = ["2020-01-02", "2020-01-03", "2020-01-06", "2020-01-07", "2020-01-08", "2020-01-09"]


def at(day):
    return day + "T21:00:00Z"


def fixture():
    return {
        "sessions": [{"date": d, "closeAt": at(d)} for d in DATES],
        "initialCapital": 1000, "currency": "USD",
        "provenance": {"mode": "SYNTHETIC_TEST", "datasetHash": H},
        "costs": {"basis": "PER_SIDE_NOTIONAL", "feeBps": 10, "slippageBps": 5},
        "maxMembershipAgeDays": 45, "maxFactorAgeDays": 45,
        "listings": [{"listingId": k, "issuerId": "ISSUER_" + k, "mic": "XNAS",
                      "instrumentClass": "COMMON_STOCK", "primary": True,
                      "currency": "USD", "firstTradeDate": "2010-01-01", "lastTradeDate": None,
                      "bars": [{"date": d, "availableAt": at(d), "close": v} for d in DATES], "events": []}
                     for k, v in [("A", 100), ("B", 50)]],
        "memberships": [{"effectiveAt": "2020-01-01T21:00:00Z", "availableAt": "2020-01-01T21:00:00Z", "sourceHash": H, "members": ["A", "B"]}],
        "factorSnapshots": [],
        "targets": [{"decisionDate": DATES[0], "executionDate": DATES[1], "availableAt": at(DATES[0]), "membershipHash": H, "weights": {"A": 1}}],
        "benchmark": {"currency": "USD", "returnBasis": "TOTAL_RETURN", "sourceHash": H,
                      "costPolicy": "PASSIVE_NO_TRANSACTION_COSTS", "levels": [{"date": d, "level": 100} for d in DATES]},
    }


def node_run(node, data):
    command = "const fs=require('node:fs'); const p=require('./quant/engines/research-portfolio.cjs'); process.stdout.write(JSON.stringify(p.runPortfolio(JSON.parse(fs.readFileSync(0,'utf8')))));"
    result = subprocess.run([node, "-e", command], input=json.dumps(data), text=True, capture_output=True, cwd=ROOT, check=True)
    return json.loads(result.stdout)


def near(actual, expected):
    expected = D(expected)
    actual = D(str(actual))
    assert abs(actual - expected) <= D("1e-10") * max(D(1), abs(expected)), (actual, expected)


def run(node):
    proofs = []
    rate = D("0.0015")
    # Analytic fully funded buy: cash = notional*(1+per_side_rate).
    x = fixture()
    r = node_run(node, x)
    capital = D(1000) / (1 + rate)
    near(r["endCapital"], capital)
    near(r["metrics"]["fees"], capital * D("0.001"))
    near(r["metrics"]["slippage"], capital * D("0.0005"))
    near(r["metrics"]["maxDrawdown"], capital / 1000 - 1)
    assert r == node_run(node, x), "same-runtime full-result reproduction"
    proofs.append({"case": "funded_buy", "expectedEndCapital": str(capital), "resultHash": r["resultHash"]})

    # Rebalance A=100% -> A=30%, B=60%, cash=10%. With sells in A and
    # buys in B, turnover notional = old_A - .3*E + .6*E = old_A + .3*E.
    # Therefore E = old_A*(1-r)/(1+.3*r), no numerical root needed.
    x["targets"].append({"decisionDate": DATES[1], "executionDate": DATES[2], "availableAt": at(DATES[1]), "membershipHash": H, "weights": {"A": 0.3, "B": 0.6}})
    r = node_run(node, x)
    after = capital * (1 - rate) / (1 + D("0.3") * rate)
    near(r["endCapital"], after)
    row = r["equity"][2]
    units = {p["listingId"]: p["units"] for p in row["positions"]}
    near(units["A"], D("0.3") * after / 100)
    near(units["B"], D("0.6") * after / 50)
    near(row["cash"], after * D("0.1"))
    # Independent every-trade journal reconstruction.
    cash = D(1000)
    positions = {"A": D(0), "B": D(0)}
    for t in r["trades"]:
        sign = 1 if t["side"] == "BUY" else -1
        notional = D(str(t["notional"]))
        cash -= sign * notional + notional * rate
        positions[t["listingId"]] += sign * notional / D(str(t["price"]))
    near(cash, row["cash"])
    near(positions["A"], units["A"])
    near(positions["B"], units["B"])
    proofs.append({"case": "simultaneous_rebalance", "expectedEndCapital": str(after), "resultHash": r["resultHash"]})

    # Explicit units: 2:1 split, $1 per post-split share dividend, cash
    # terminal $52 per share. Dividend and terminal paid later, no sell fee.
    x = fixture()
    a = x["listings"][0]
    a["lastTradeDate"] = DATES[3]
    a["bars"] = a["bars"][:4]
    for bar, price in zip(a["bars"], [100, 100, 50, 49]):
        bar["close"] = price
    base = {"sourceHash": H, "availableAt": "2020-01-01T00:00:00Z", "sequence": 0}
    a["events"] = [
        {**base, "id": "SPLIT_A", "type": "SPLIT", "effectiveDate": DATES[2], "ratio": 2},
        {**base, "id": "DIV_A", "type": "CASH_DIVIDEND", "effectiveDate": DATES[3], "payDate": DATES[5], "amount": 1, "currency": "USD"},
        {**base, "id": "END_A", "type": "TERMINAL_CASH", "effectiveDate": DATES[4], "payDate": DATES[5], "amount": 52, "currency": "USD"},
    ]
    r = node_run(node, x)
    share_units = capital / 100 * 2
    expected = share_units * 53
    near(r["equity"][3]["receivables"], share_units)
    near(r["equity"][4]["receivables"], expected)
    near(r["equity"][4]["cash"], 0)
    near(r["endCapital"], expected)
    near(r["equity"][5]["cash"], expected)
    assert not r["openReceivables"]
    proofs.append({"case": "split_dividend_terminal", "expectedEndCapital": str(expected), "resultHash": r["resultHash"]})

    # Zero is allowed only as an explicit sourced terminal value, not missing.
    a["events"][-1]["amount"] = 0
    r = node_run(node, x)
    near(r["endCapital"], share_units)
    proofs.append({"case": "sourced_zero_terminal", "expectedEndCapital": str(share_units), "resultHash": r["resultHash"]})
    return {"schemaVersion": "research-portfolio-python-validation-1.0.0", "status": "PASS", "fixtureMode": "SYNTHETIC_TEST", "cases": proofs,
            "reference": "Python Decimal analytic equations and separate cash/unit journal", "toleranceRelative": "1e-10", "realHistoricalEvidence": False,
            "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "nodeRuntime": r["runtime"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--node", default="node")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    report = run(args.node)
    text = json.dumps(report, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text)
    print(text, end="")
