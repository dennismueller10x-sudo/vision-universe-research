#!/usr/bin/env python3
"""Externe Referenzwerte fuer die Technical-Indikatoren (Audit B7).

Rechnet die TA-Lib-Entsprechungen der Katalogindikatoren auf dem eingefrorenen
AAPL-Ausschnitt (quant/tests/fixtures/technical-reference-aapl.json) und schreibt
das Ergebnis als eingefrorene Fixture. Der Test
quant/tests/technical-indicators-talib.test.mjs vergleicht die Engine damit.

TA-Lib ist KEINE Projektabhaengigkeit. Das Skript laeuft nur, wenn jemand die
Fixture bewusst neu erzeugt, in einer eigenen Umgebung:

    python3 -m venv /tmp/talib-venv
    /tmp/talib-venv/bin/pip install TA-Lib==0.8.2 numpy
    /tmp/talib-venv/bin/python scripts/technical/build-talib-reference.py --out quant/tests/fixtures/technical-talib-reference-aapl.json

Die Fixture haelt Bibliotheks- und C-Kern-Version fest. Werte sind auf 10
signifikante Stellen gerundet, NaN wird null.
"""
import argparse
import json
import math
import os

import numpy as np
import talib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "quant", "tests", "fixtures", "technical-reference-aapl.json")


def ser(a):
    out = []
    for v in np.asarray(a, dtype=float):
        out.append(None if math.isnan(v) else float(f"{v:.10g}"))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    ref = json.load(open(SRC, encoding="utf-8"))
    o, h, l, c, v = (np.asarray(ref[k], dtype=float) for k in ("open", "high", "low", "close", "volume"))

    macd, macd_sig, macd_hist = talib.MACD(c, 12, 26, 9)
    bb_u, bb_m, bb_l = talib.BBANDS(c, 20, 2.0, 2.0, 0)
    slow_k, slow_d = talib.STOCH(h, l, c, 14, 3, 0, 3, 0)
    aroon_down, aroon_up = talib.AROON(h, l, 25)

    series = {
        "sma": {"call": "SMA(close, 50)", "values": ser(talib.SMA(c, 50))},
        "ema": {"call": "EMA(close, 200)", "values": ser(talib.EMA(c, 200))},
        "ema20": {"call": "EMA(close, 20)", "values": ser(talib.EMA(c, 20))},
        "wma": {"call": "WMA(close, 20)", "values": ser(talib.WMA(c, 20))},
        "adx": {"call": "ADX(high, low, close, 14)", "values": ser(talib.ADX(h, l, c, 14))},
        "rsi": {"call": "RSI(close, 14)", "values": ser(talib.RSI(c, 14))},
        "macd": {"call": "MACD(close, 12, 26, 9)", "values": {"macd": ser(macd), "signal": ser(macd_sig), "histogram": ser(macd_hist)}},
        "stochastic": {"call": "STOCH(high, low, close, fastk=14, slowk=3 SMA, slowd=3 SMA)", "values": {"k": ser(slow_k), "d": ser(slow_d)}},
        "roc": {"call": "ROC(close, 21)", "values": ser(talib.ROC(c, 21))},
        "cci": {"call": "CCI(high, low, close, 20)", "values": ser(talib.CCI(h, l, c, 20))},
        "williamsR": {"call": "WILLR(high, low, close, 14)", "values": ser(talib.WILLR(h, l, c, 14))},
        "aroon": {"call": "AROON(high, low, 25), AROONOSC(high, low, 25)", "values": {"up": ser(aroon_up), "down": ser(aroon_down), "oscillator": ser(talib.AROONOSC(h, l, 25))}},
        "atr": {"call": "ATR(high, low, close, 14)", "values": ser(talib.ATR(h, l, c, 14))},
        "atr10": {"call": "ATR(high, low, close, 10)", "values": ser(talib.ATR(h, l, c, 10))},
        "bollinger": {"call": "BBANDS(close, 20, 2, 2, SMA)", "values": {"upper": ser(bb_u), "middle": ser(bb_m), "lower": ser(bb_l)}},
        "obv": {"call": "OBV(close, volume)", "values": ser(talib.OBV(c, v))},
        "mfi": {"call": "MFI(high, low, close, volume, 14)", "values": ser(talib.MFI(h, l, c, v, 14))},
        "psar": {"call": "SAR(high, low, 0.02, 0.2)", "values": ser(talib.SAR(h, l, 0.02, 0.2))},
        "donchianUpper": {"call": "MAX(high, 20)", "values": ser(talib.MAX(h, 20))},
        "donchianLower": {"call": "MIN(low, 20)", "values": ser(talib.MIN(l, 20))},
        "tenkan": {"call": "MIDPRICE(high, low, 9)", "values": ser(talib.MIDPRICE(h, l, 9))},
        "kijun": {"call": "MIDPRICE(high, low, 26)", "values": ser(talib.MIDPRICE(h, l, 26))},
        "spanB": {"call": "MIDPRICE(high, low, 52)", "values": ser(talib.MIDPRICE(h, l, 52))},
    }

    out = {
        "note": "Externe Referenzwerte (TA-Lib) auf dem eingefrorenen AAPL-Ausschnitt technical-reference-aapl.json. "
                "Erzeugt mit scripts/technical/build-talib-reference.py. Nur fuer Tests, nie Produktdaten.",
        "library": "TA-Lib (Python)",
        "libraryVersion": talib.__version__,
        "coreVersion": talib.__ta_version__.decode() if isinstance(talib.__ta_version__, bytes) else str(talib.__ta_version__),
        "source": "quant/tests/fixtures/technical-reference-aapl.json",
        "bars": len(c),
        "from": ref["from"],
        "to": ref["to"],
        "series": series,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
        fh.write("\n")
    print(f"{args.out}: {len(series)} Reihen, {len(c)} Bars, TA-Lib {out['libraryVersion']}")


if __name__ == "__main__":
    main()
