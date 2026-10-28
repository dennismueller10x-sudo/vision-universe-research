#!/usr/bin/env python3
"""Fremde Referenz fuer die Katalogerweiterung L12 (indicators 1.6.0, docs/technical/INDICATORS_EXTERNAL_REFERENCE.md, L12).

Rechnet auf dem eingefrorenen AAPL-Ausschnitt (quant/tests/fixtures/technical-reference-aapl.json):
  * TA-Lib 0.8.2, wo es ein Gegenstueck gibt (APO, MIDPRICE, TSF, ADXR, STOCHF);
  * pandas-ta 0.4.71b0, wo dessen Definition der dokumentierten entspricht (Fisher, RVGI, VHF, Efficiency Ratio, QStick,
    PVT mit Faktor 1/100, weil pandas-ta die Tagesrendite in Prozent nimmt);
  * aus TA-Lib-/numpy-Bausteinen nach der dokumentierten Formel, wo pandas-ta anders rechnet oder kein Gegenstueck hat
    (Schaff Trend Cycle: pandas-ta friert den ersten Stochastik-Schritt ein, sobald das MACD-Tief nicht positiv ist;
    Williams Alligator und Fractals).

Der Test quant/tests/technical-indicators-l12.test.mjs vergleicht die Engine damit ab der je Reihe festgehaltenen Bar `from`.
pandas-ta und TA-Lib sind KEINE Projektabhaengigkeiten; das Skript laeuft nur, wenn jemand die Fixture bewusst neu erzeugt:

    python3 -m venv /tmp/talib-venv
    /tmp/talib-venv/bin/pip install TA-Lib==0.8.2 pandas-ta==0.4.71b0
    /tmp/talib-venv/bin/python -I scripts/technical/build-l12-reference.py \
        --out quant/tests/fixtures/technical-l12-reference-aapl.json

Werte auf 10 signifikante Stellen, NaN wird null.
"""
import argparse
import json
import math
import os

import numpy as np
import pandas as pd
import pandas_ta as ta
import talib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "quant", "tests", "fixtures", "technical-reference-aapl.json")


def ser(a):
    out = []
    for v in np.asarray(a, dtype=float):
        out.append(None if math.isnan(v) else float(f"{v:.10g}"))
    return out


def smma(x, n):
    """Smoothed Moving Average (Wilder/RMA): Startwert = SMA der ersten n Werte, danach (prev·(n−1) + x)/n."""
    out = np.full(len(x), np.nan)
    out[n - 1] = np.mean(x[:n])
    for i in range(n, len(x)):
        out[i] = (out[i - 1] * (n - 1) + x[i]) / n
    return out


def shift(x, k):
    out = np.full(len(x), np.nan)
    out[k:] = x[:len(x) - k]
    return out


def schaff(c, fast, slow, cycle, factor):
    """Schaff Trend Cycle: MACD = EMA_fast − EMA_slow (TA-Lib, SMA-Startwert); %K1 = Stochastik des MACD ueber `cycle`
    Bars (bei Spanne 0 der Vorwert), PF = PF₋₁ + factor·(%K1 − PF₋₁) mit Start PF = %K1; %K2 = Stochastik von PF ueber
    `cycle` Bars, STC = STC₋₁ + factor·(%K2 − STC₋₁) mit Start STC = %K2."""
    n = len(c)
    m = talib.EMA(c, fast) - talib.EMA(c, slow)

    def stoch_smooth(x):
        k = np.full(n, np.nan)
        out = np.full(n, np.nan)
        first = int(np.argmax(~np.isnan(x)))
        for i in range(first + cycle - 1, n):
            w = x[i - cycle + 1:i + 1]
            lo, hi = w.min(), w.max()
            k[i] = 100 * (x[i] - lo) / (hi - lo) if hi > lo else (k[i - 1] if not math.isnan(k[i - 1]) else 0.0)
            out[i] = k[i] if math.isnan(out[i - 1]) else out[i - 1] + factor * (k[i] - out[i - 1])
        return out

    return stoch_smooth(stoch_smooth(m))


def fractals(h, l):
    """Williams Fractals, kausal ausgewiesen: am Bar i steht ein Hoch-Fraktal fuer Bar i−2, wenn H_{i−2} strikt hoeher ist
    als die zwei Hochs davor und danach (Tief-Fraktal entsprechend). Sonst NaN."""
    n = len(h)
    up, dn = np.full(n, np.nan), np.full(n, np.nan)
    for i in range(4, n):
        c = i - 2
        if all(h[c] > h[j] for j in (c - 2, c - 1, c + 1, c + 2)):
            up[i] = h[c]
        if all(l[c] < l[j] for j in (c - 2, c - 1, c + 1, c + 2)):
            dn[i] = l[c]
    return up, dn


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    ref = json.load(open(SRC))
    df = pd.DataFrame({k: ref[k] for k in ("open", "high", "low", "close", "volume")}, dtype=float)
    o, h, l, c, v = (df[k] for k in ("open", "high", "low", "close", "volume"))
    on, hn, ln, cn, vn = o.to_numpy(), h.to_numpy(), l.to_numpy(), c.to_numpy(), v.to_numpy()
    rows = {}

    def put(key, values, source, start=0):
        rows[key] = {"source": source, "from": start, "values": ser(values)}

    put("apo", talib.APO(cn, 12, 26, matype=1), "TA-Lib APO (EMA)")
    put("midprice", talib.MIDPRICE(hn, ln, 14), "TA-Lib MIDPRICE")
    put("tsf", talib.TSF(cn, 14), "TA-Lib TSF")
    put("adxr", talib.ADXR(hn, ln, cn, 14), "TA-Lib ADXR")
    fk, fd = talib.STOCHF(hn, ln, cn, 14, 3, 0)
    put("stochFast.k", fk, "TA-Lib STOCHF")
    put("stochFast.d", fd, "TA-Lib STOCHF (SMA 3)")
    fi = ta.fisher(h, l, length=9, signal=1)
    put("fisher.fisher", fi.iloc[:, 0], "pandas-ta fisher")
    put("fisher.signal", fi.iloc[:, 1], "pandas-ta fisher (Vorwert)")
    put("stc", schaff(cn, 23, 50, 10, 0.5), "TA-Lib EMA + numpy nach Schaff")
    rv = ta.rvgi(o, h, l, c, length=10, swma_length=4)
    put("rvgi.rvgi", rv.iloc[:, 0], "pandas-ta rvgi")
    put("rvgi.signal", rv.iloc[:, 1], "pandas-ta rvgi (SWMA 4)")
    put("pvt", ta.pvt(c, v).to_numpy() / 100, "pandas-ta pvt / 100 (Rendite als Anteil)")
    put("vhf", ta.vhf(c, length=28), "pandas-ta vhf")
    put("efficiencyRatio", ta.er(c, length=10), "pandas-ta er")
    put("qstick", ta.qstick(o, c, length=10), "pandas-ta qstick (SMA)")
    med = (hn + ln) / 2
    put("alligator.jaw", shift(smma(med, 13), 8), "numpy SMMA 13 des Medianpreises, 8 Bars versetzt")
    put("alligator.teeth", shift(smma(med, 8), 5), "numpy SMMA 8, 5 Bars versetzt")
    put("alligator.lips", shift(smma(med, 5), 3), "numpy SMMA 5, 3 Bars versetzt")
    up, dn = fractals(hn, ln)
    put("fractals.upPrice", up, "numpy nach Williams (kausal am Bestaetigungsbar)")
    put("fractals.downPrice", dn, "numpy nach Williams (kausal am Bestaetigungsbar)")

    out = {"schemaVersion": "vu-technical-l12-reference-1", "source": "technical-reference-aapl.json", "bars": len(cn),
           "libraries": {"talib": talib.__version__, "pandas_ta": ta.version, "numpy": np.__version__},
           "series": rows}
    with open(args.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")


if __name__ == "__main__":
    main()
