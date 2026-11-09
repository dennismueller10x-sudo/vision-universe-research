"""Unabhängige Gegenrechnung des VU-Portfolio-Standards (portfolio-risk-1.0.0, portfolio-construction-1.0.0).

Eigener Code, nur Standardbibliothek. Liest Fälle (JSON) mit Renditematrix, Scores, Branchen, Liquidität und den
Ergebnissen der Node-Engine; rechnet Ledoit/Wolf-Schrumpfung (Ziel konstante Korrelation), Gewichte (EQUAL,
INVERSE_VOL, RISK_PARITY) und die Projektion auf Titel- und Branchengrenzen neu und vergleicht (relative Toleranz).

  python3 -I scripts/quant/verify-portfolio-construction.py --input cases.json [--out report.json] [--tolerance 1e-8]
"""
import argparse
import json
import math
import sys


def shrunk(R):
    T, N = len(R), len(R[0])
    mu = [sum(r[j] for r in R) / T for j in range(N)]
    X = [[r[j] - mu[j] for j in range(N)] for r in R]
    S = [[sum(x[i] * x[j] for x in X) / T for j in range(N)] for i in range(N)]
    sd = [math.sqrt(S[i][i]) for i in range(N)]
    if N == 1:
        return S, 0.0
    rbar = sum(S[i][j] / (sd[i] * sd[j]) for i in range(N) for j in range(i + 1, N)) * 2 / (N * (N - 1))
    F = [[S[i][i] if i == j else rbar * sd[i] * sd[j] for j in range(N)] for i in range(N)]
    pi = 0.0
    rho = 0.0
    for i in range(N):
        for j in range(N):
            p = sum((x[i] * x[j] - S[i][j]) ** 2 for x in X) / T
            pi += p
            if i == j:
                rho += p
            else:
                th_i = sum((x[i] ** 2 - S[i][i]) * (x[i] * x[j] - S[i][j]) for x in X) / T
                th_j = sum((x[j] ** 2 - S[j][j]) * (x[i] * x[j] - S[i][j]) for x in X) / T
                rho += rbar / 2 * (math.sqrt(S[j][j] / S[i][i]) * th_i + math.sqrt(S[i][i] / S[j][j]) * th_j)
    gamma = sum((F[i][j] - S[i][j]) ** 2 for i in range(N) for j in range(N))
    kappa = (pi - rho) / gamma if gamma > 0 else 0.0
    delta = max(0.0, min(1.0, kappa / T))
    return [[delta * F[i][j] + (1 - delta) * S[i][j] for j in range(N)] for i in range(N)], delta


def rc(w, cov):
    n = len(w)
    m = [sum(cov[i][j] * w[j] for j in range(n)) for i in range(n)]
    v = sum(w[i] * m[i] for i in range(n))
    return [w[i] * m[i] / v for i in range(n)]


def erc(cov, iterations=2000, tol=1e-12):
    n = len(cov)
    w = [1 / math.sqrt(cov[i][i]) for i in range(n)]
    s = sum(w)
    w = [x / s for x in w]
    for _ in range(iterations):
        c = rc(w, cov)
        nxt = [w[i] * math.sqrt((1 / n) / max(c[i], 1e-300)) for i in range(n)]
        s = sum(nxt)
        nw = [x / s for x in nxt]
        diff = max(abs(nw[i] - w[i]) for i in range(n))
        w = nw
        if diff < tol:
            break
    return w


def raw_weights(kind, cov):
    n = len(cov)
    if kind == "EQUAL":
        return [1 / n] * n
    if kind == "INVERSE_VOL":
        iv = [1 / math.sqrt(cov[i][i]) for i in range(n)]
        s = sum(iv)
        return [x / s for x in iv]
    if kind == "RISK_PARITY":
        return erc(cov)
    raise ValueError(kind)


def project(raw, caps, sectors, max_sector):
    n = len(raw)
    w = [0.0] * n
    fixed = [False] * n
    for _ in range(10 * n + 10):
        fixed_mass = sum(w[i] for i in range(n) if fixed[i])
        free = [i for i in range(n) if not fixed[i]]
        base = sum(raw[i] for i in free)
        mass = max(0.0, 1 - fixed_mass)
        for i in free:
            w[i] = mass * raw[i] / base if base > 0 else 0.0
        changed = False
        for i in free:
            if w[i] > caps[i] + 1e-15:
                w[i] = caps[i]
                fixed[i] = True
                changed = True
        if changed:
            continue
        sums = {}
        for i in range(n):
            sums[sectors[i]] = sums.get(sectors[i], 0.0) + w[i]
        for k, total in sorted(sums.items(), key=lambda kv: (-kv[1], kv[0])):
            if total <= max_sector + 1e-12:
                continue
            for i in range(n):
                if sectors[i] == k:
                    w[i] = max_sector * w[i] / total
                    fixed[i] = True
            changed = True
            break
        if not changed:
            break
    return w


def close(a, b, tol):
    return abs(a - b) <= tol * max(1.0, abs(a), abs(b))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--out")
    ap.add_argument("--tolerance", type=float, default=1e-8)
    a = ap.parse_args(argv)
    cases = json.load(open(a.input, encoding="utf-8"))
    checks = mismatches = 0
    detail = []
    for c in cases:
        cov, delta = shrunk(c["returns"])
        checks += 1
        if not close(delta, c["engine"]["shrinkage"], a.tolerance):
            mismatches += 1
            detail.append([c["name"], "shrinkage", delta, c["engine"]["shrinkage"]])
        for i, row in enumerate(cov):
            for j, v in enumerate(row):
                checks += 1
                if not close(v, c["engine"]["cov"][i][j], a.tolerance):
                    mismatches += 1
        w = project(raw_weights(c["weighting"], cov), c["caps"], c["sectors"], c["maxSector"])
        for i, v in enumerate(w):
            checks += 1
            if not close(v, c["engine"]["weights"][i], 1e-7):
                mismatches += 1
                detail.append([c["name"], "weight", i, v, c["engine"]["weights"][i]])
        # Standard unabhängig prüfen
        n = sum(1 for x in w if x > 1e-9)
        checks += 3
        if any(x > c["maxPosition"] + 1e-9 for x in w):
            mismatches += 1
            detail.append([c["name"], "position cap"])
        sec = {}
        for x, k in zip(w, c["sectors"]):
            sec[k] = sec.get(k, 0.0) + x
        if any(x > c["maxSector"] + 1e-9 for x in sec.values()):
            mismatches += 1
            detail.append([c["name"], "sector cap"])
        if not (c["minPositions"] <= n <= c["maxPositions"]):
            mismatches += 1
            detail.append([c["name"], "positions", n])
    report = {"schemaVersion": "verify-portfolio-construction-1.0.0", "cases": len(cases), "checks": checks, "mismatches": mismatches,
              "python": sys.version.split()[0], "tolerance": a.tolerance, "detail": detail[:20]}
    if a.out:
        json.dump(report, open(a.out, "w", encoding="utf-8"), indent=1)
    print(json.dumps({k: report[k] for k in ("cases", "checks", "mismatches")}))
    return 1 if mismatches else 0


if __name__ == "__main__":
    raise SystemExit(main())
