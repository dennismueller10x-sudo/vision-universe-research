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
    /tmp/talib-venv/bin/python scripts/technical/build-talib-reference.py --set ext --out quant/tests/fixtures/technical-talib-reference-aapl-ext.json

`--set core` (Standard) ist der Bestand aus Audit B7 und bleibt unveraendert.
`--set ext` sind die Katalogerweiterungen ab indicators 1.3.0 (TECHNICAL_LIBRARY.md, L2/L3).
`--set ext2` setzt die Erweiterungen ab indicators 1.4.0 (L2b) aus TA-Lib-Grundbausteinen zusammen
(SMA, EMA, WMA, ROC, SUM, MAX, MIN, STDDEV, MEDPRICE): Die Formel steht hier ein zweites Mal,
unabhaengig von der Engine, und die Rechenkerne sind fremd.
`--set candles` friert echte Tagesbars ausgewaehlter Titel aus den Technical-Shards ein und rechnet die
TA-Lib-Candlestick-Funktionen (CDL*) darauf (candlesticks.js, L4):

    /tmp/talib-venv/bin/python scripts/technical/build-talib-reference.py --set candles \
        --tickers AAPL,MSFT,... --out quant/tests/fixtures/technical-talib-candles.json

`--set candles2` rechnet die 31 weiteren CDL-Funktionen ab candlesticks 1.1.0 auf den EINGEFRORENEN Bars
der ersten Fixture (keine Shards, keine Bars doppelt) und auf konstruierten Kerzenfolgen fuer die Muster,
die in echten Kursen fast nie vorkommen (constructed_series()):

    /tmp/talib-venv/bin/python scripts/technical/build-talib-reference.py --set candles2 \
        --out quant/tests/fixtures/technical-talib-candles-2.json

`--set candles3` rechnet die vier restlichen CDL-Funktionen ab candlesticks 1.2.0 (L13) auf denselben eingefrorenen
Bars und auf konstruierten Kerzenfolgen (CONSTRUCTED_3):

    /tmp/talib-venv/bin/python scripts/technical/build-talib-reference.py --set candles3 \
        --out quant/tests/fixtures/technical-talib-candles-3.json

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
    ap.add_argument("--set", default="core", choices=["core", "ext", "ext2", "candles", "candles2", "candles3"])
    ap.add_argument("--tickers", default="")
    args = ap.parse_args()
    if args.set == "candles":
        return write_candles(args)
    if args.set == "candles2":
        return write_candles2(args)
    if args.set == "candles3":
        return write_candles2(args, CANDLE_FUNCTIONS_3, CONSTRUCTED_3, "candles3")

    ref = json.load(open(SRC, encoding="utf-8"))
    o, h, l, c, v = (np.asarray(ref[k], dtype=float) for k in ("open", "high", "low", "close", "volume"))

    if args.set == "ext":
        series = ext_series(o, h, l, c, v)
        return write(args, ref, c, series)
    if args.set == "ext2":
        series = ext2_series(o, h, l, c, v)
        return write(args, ref, c, series)

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

    return write(args, ref, c, series)


def ext_series(o, h, l, c, v):
    """Katalogerweiterungen ab indicators 1.3.0 (L2a) und Abgleich der 1.2.0-Eintraege (L3)."""
    ppo_ema = talib.PPO(c, 12, 26, 1)
    srsi_k, srsi_d = talib.STOCHRSI(c, 14, 14, 3, 0)
    return {
        "dema": {"call": "DEMA(close, 20)", "values": ser(talib.DEMA(c, 20))},
        "tema": {"call": "TEMA(close, 20)", "values": ser(talib.TEMA(c, 20))},
        "trima20": {"call": "TRIMA(close, 20)", "values": ser(talib.TRIMA(c, 20))},
        "trima15": {"call": "TRIMA(close, 15)", "values": ser(talib.TRIMA(c, 15))},
        "t3": {"call": "T3(close, 5, 0.7)", "values": ser(talib.T3(c, 5, 0.7))},
        "ppo": {"call": "PPO(close, 12, 26, matype=EMA) (ohne Signal)", "values": ser(ppo_ema)},
        "stochRsi": {"call": "STOCHRSI(close, 14, fastk=14, fastd=3 SMA)", "values": {"raw": ser(srsi_k), "k": ser(srsi_d)}},
        "natr": {"call": "NATR(high, low, close, 14)", "values": ser(talib.NATR(h, l, c, 14))},
        "adLine": {"call": "AD(high, low, close, volume)", "values": ser(talib.AD(h, l, c, v))},
        "chaikinOsc": {"call": "ADOSC(high, low, close, volume, 3, 10)", "values": ser(talib.ADOSC(h, l, c, v, 3, 10))},
        "bop": {"call": "BOP(open, high, low, close)", "values": ser(talib.BOP(o, h, l, c))},
        "momentum": {"call": "MOM(close, 10)", "values": ser(talib.MOM(c, 10))},
        "stdDev": {"call": "STDDEV(close, 20, 1)", "values": ser(talib.STDDEV(c, 20, 1))},
        "kama": {"call": "KAMA(close, 10)", "values": ser(talib.KAMA(c, 10))},
        "linreg": {"call": "LINEARREG(close, 50)", "values": ser(talib.LINEARREG(c, 50))},
        "linregSlope": {"call": "LINEARREG_SLOPE(close, 50)", "values": ser(talib.LINEARREG_SLOPE(c, 50))},
        "linregR2": {"call": "CORREL(index, close, 50)^2", "values": ser(talib.CORREL(np.arange(len(c), dtype=float), c, 50) ** 2)},
        "trix": {"call": "TRIX(close, 15)", "values": ser(talib.TRIX(c, 15))},
        "ultimateOscillator": {"call": "ULTOSC(high, low, close, 7, 14, 28)", "values": ser(talib.ULTOSC(h, l, c, 7, 14, 28))},
        "cmo": {"call": "CMO(close, 14)", "values": ser(talib.CMO(c, 14))},
    }


CANDLE_FUNCTIONS = {
    "doji": "CDLDOJI", "dragonflyDoji": "CDLDRAGONFLYDOJI", "gravestoneDoji": "CDLGRAVESTONEDOJI",
    "longLeggedDoji": "CDLLONGLEGGEDDOJI", "hammer": "CDLHAMMER", "hangingMan": "CDLHANGINGMAN",
    "invertedHammer": "CDLINVERTEDHAMMER", "shootingStar": "CDLSHOOTINGSTAR", "marubozu": "CDLMARUBOZU",
    "spinningTop": "CDLSPINNINGTOP", "engulfing": "CDLENGULFING", "harami": "CDLHARAMI", "haramiCross": "CDLHARAMICROSS",
    "piercing": "CDLPIERCING", "darkCloudCover": "CDLDARKCLOUDCOVER", "kicking": "CDLKICKING",
    "morningStar": "CDLMORNINGSTAR", "eveningStar": "CDLEVENINGSTAR", "morningDojiStar": "CDLMORNINGDOJISTAR",
    "eveningDojiStar": "CDLEVENINGDOJISTAR", "abandonedBaby": "CDLABANDONEDBABY", "threeWhiteSoldiers": "CDL3WHITESOLDIERS",
    "threeBlackCrows": "CDL3BLACKCROWS", "threeInside": "CDL3INSIDE", "threeOutside": "CDL3OUTSIDE",
    "threeMethods": "CDLRISEFALL3METHODS",
}


def write_candles(args):
    """Echte Tagesbars (eingefroren) + TA-Lib-Signale je Muster als Liste [Index, Wert] der Treffer."""
    import gzip
    from talib import abstract
    shards = os.path.join(ROOT, "quant", "data", "product", "technical-signals-v1")
    tickers = [t for t in args.tickers.split(",") if t]
    titles = {}
    for t in tickers:
        path = os.path.join(shards, t[:2] + ".json.gz")
        b = json.load(gzip.open(path))["instruments"][t]["bars"]
        o, h, l, c = (np.asarray(b[k], dtype=float) for k in ("open", "high", "low", "close"))
        signals = {}
        for pid, fn in CANDLE_FUNCTIONS.items():
            a = getattr(talib, fn)(o, h, l, c)
            signals[pid] = [[int(i), int(a[i])] for i in np.nonzero(a)[0]]
        titles[t] = {"from": b["timestamps"][0][:10], "to": b["timestamps"][-1][:10], "open": b["open"], "high": b["high"], "low": b["low"], "close": b["close"], "signals": signals}
    out = {
        "note": "Echte Tagesbars (aus technical-signals-v1, eingefroren) und TA-Lib-Candlestick-Signale. "
                "Erzeugt mit scripts/technical/build-talib-reference.py --set candles. Nur fuer Tests.",
        "library": "TA-Lib (Python)",
        "libraryVersion": talib.__version__,
        "set": "candles",
        "lookback": {pid: abstract.Function(fn).lookback for pid, fn in CANDLE_FUNCTIONS.items()},
        "functions": CANDLE_FUNCTIONS,
        "titles": titles,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
        fh.write("\n")
    print(f"{args.out}: {len(titles)} Titel, {len(CANDLE_FUNCTIONS)} Muster, TA-Lib {out['libraryVersion']}")


CANDLE_FUNCTIONS_2 = {
    "twoCrows": "CDL2CROWS", "threeLineStrike": "CDL3LINESTRIKE", "threeStarsInSouth": "CDL3STARSINSOUTH",
    "advanceBlock": "CDLADVANCEBLOCK", "beltHold": "CDLBELTHOLD", "breakaway": "CDLBREAKAWAY",
    "closingMarubozu": "CDLCLOSINGMARUBOZU", "concealingBabySwallow": "CDLCONCEALBABYSWALL",
    "counterattack": "CDLCOUNTERATTACK", "dojiStar": "CDLDOJISTAR", "gapSideBySideWhite": "CDLGAPSIDESIDEWHITE",
    "highWave": "CDLHIGHWAVE", "hikkake": "CDLHIKKAKE", "homingPigeon": "CDLHOMINGPIGEON",
    "identicalThreeCrows": "CDLIDENTICAL3CROWS", "inNeck": "CDLINNECK", "ladderBottom": "CDLLADDERBOTTOM",
    "matchingLow": "CDLMATCHINGLOW", "matHold": "CDLMATHOLD", "onNeck": "CDLONNECK", "rickshawMan": "CDLRICKSHAWMAN",
    "separatingLines": "CDLSEPARATINGLINES", "stalledPattern": "CDLSTALLEDPATTERN", "stickSandwich": "CDLSTICKSANDWICH",
    "takuri": "CDLTAKURI", "tasukiGap": "CDLTASUKIGAP", "thrusting": "CDLTHRUSTING", "triStar": "CDLTRISTAR",
    "uniqueThreeRiver": "CDLUNIQUE3RIVER", "upsideGapTwoCrows": "CDLUPSIDEGAP2CROWS",
    "xSideGapThreeMethods": "CDLXSIDEGAP3METHODS",
}


def quiet_base(n, level):
    """Ruhige Grundreihe: abwechselnd weiss/schwarz, Koerper 1, Spanne 2 um `level` (wie base() im Test)."""
    bars = []
    for k in range(n):
        white = k % 2 == 0
        o, c = (level - 0.5, level + 0.5) if white else (level + 0.5, level - 0.5)
        bars.append((o, max(o, c) + 0.5, min(o, c) - 0.5, c))
    return bars


# Musterkerzen (Eroeffnung, Hoch, Tief, Schluss) relativ zur Grundreihe um 100. Je Muster der Lehrbuchfall,
# mit deutlichen Abstaenden zu allen Schwellen (keine Gleichstaende).
CONSTRUCTED = {
    "concealingBabySwallow": [(103, 103, 100, 100), (99.5, 99.5, 97, 97), (96.5, 97.5, 95.8, 96), (98, 98.2, 94, 94.5)],
    "matHold": [(100, 103.1, 99.9, 103), (104, 104.2, 103.5, 103.6), (103.3, 103.4, 102.8, 102.9), (103, 103.1, 102.5, 102.6), (102.8, 105.1, 102.7, 105)],
    # Mat Hold mit tieferem Ruecksetzer: Zwischenkoerper dringen 37 % bzw. 42 % in den ersten Koerper ein (< 50 %: Muster),
    # und als Gegenprobe 57 % (> 50 %: kein Muster, Name endet auf -neg). Prueft die Eindringtiefe 0,5.
    "matHold-deep": [(100, 103.1, 99.9, 103), (104, 104.2, 103.5, 103.6), (102.4, 102.5, 101.8, 101.9), (102.2, 102.3, 101.7, 101.75), (101.9, 105.1, 101.85, 105)],
    "matHold-neg": [(100, 103.1, 99.9, 103), (104, 104.2, 103.5, 103.6), (102.4, 102.5, 101.8, 101.9), (102.2, 102.3, 101.2, 101.3), (101.9, 105.1, 101.85, 105)],
    "upsideGapTwoCrows": [(100, 103.1, 99.9, 103), (104, 104.1, 103.5, 103.6), (104.3, 104.4, 103.1, 103.2)],
    "threeStarsInSouth": [(103, 103.1, 96.5, 100), (101, 101.1, 98, 99.5), (99.3, 99.35, 98.9, 99)],
    "twoCrows": [(100, 103.1, 99.9, 103), (104.5, 104.7, 103.7, 103.8), (104.2, 104.3, 101.4, 101.5)],
    "breakaway": [(103, 103.1, 99.9, 100), (99.5, 99.6, 98.9, 99), (98.9, 99, 98.3, 98.5), (98.4, 98.5, 97.9, 98), (98.1, 99.9, 98, 99.8)],
}
MIRRORED = {"breakaway"}  # beidseitige Muster: zusaetzlich gespiegelt (p -> 2*Niveau - p), ergibt die Gegenrichtung


def constructed_series(patterns=None):
    """Deterministische Kerzenfolgen: je Muster drei Varianten (Grundreihe 12 Bars um 100, 15 Bars um 100,
    12 Bars um 150 mit um 50 verschobenem Muster), bei beidseitigen Mustern zusaetzlich gespiegelt.
    Das Muster steht an den letzten Bars; erwartet wird das Signal an der letzten Bar (bei Namen auf -neg: keines)."""
    out = {}
    for pid, pat in (patterns or CONSTRUCTED).items():
        variants = [("a", 12, 0.0), ("b", 15, 0.0), ("c", 12, 50.0)]
        for tag, n, shift in variants:
            bars = quiet_base(n, 100.0 + shift) + [tuple(round(v + shift, 4) for v in b) for b in pat]
            out[f"{pid}-{tag}"] = bars
            if pid in MIRRORED:
                lvl = 100.0 + shift
                out[f"{pid}-{tag}-mirror"] = [(round(2 * lvl - o, 4), round(2 * lvl - l, 4), round(2 * lvl - h, 4), round(2 * lvl - c, 4)) for o, h, l, c in bars]
    return out


def cdl_signals(fmap, o, h, l, c):
    signals = {}
    for pid, fn in fmap.items():
        a = getattr(talib, fn)(o, h, l, c)
        signals[pid] = [[int(i), int(a[i])] for i in np.nonzero(a)[0]]
    return signals


CANDLE_FUNCTIONS_3 = {
    "longLine": "CDLLONGLINE", "shortLine": "CDLSHORTLINE", "kickingByLength": "CDLKICKINGBYLENGTH", "hikkakeMod": "CDLHIKKAKEMOD",
}
# Kicking by Length: zwei gegenfarbige Marubozu mit Kerzenluecke; die Richtung bestimmt der laengere Koerper.
# -long: zweiter Koerper laenger (Richtung der zweiten), -short: erster laenger (Richtung der ersten, entgegen der Luecke).
CONSTRUCTED_3 = {
    "kickingByLength-long": [(103, 103.02, 99.98, 100), (103.5, 108.52, 103.48, 108.5)],
    "kickingByLength-short": [(106, 106.02, 99.98, 100), (106.5, 108.52, 106.48, 108.5)],
}


def write_candles2(args, functions=None, constructed_pat=None, set_name="candles2"):
    """Zweite Candlestick-Fixture: TA-Lib-Signale der 31 Muster ab 1.1.0 auf den Bars der ersten Fixture
    (nur Verweis, keine Bars doppelt) und auf konstruierten Kerzenfolgen (Bars + Signale)."""
    from talib import abstract
    functions = functions or CANDLE_FUNCTIONS_2
    src_rel = "quant/tests/fixtures/technical-talib-candles.json"
    src = json.load(open(os.path.join(ROOT, src_rel), encoding="utf-8"))
    titles = {}
    for t, ti in src["titles"].items():
        o, h, l, c = (np.asarray(ti[k], dtype=float) for k in ("open", "high", "low", "close"))
        titles[t] = {"bars": len(c), "signals": cdl_signals(functions, o, h, l, c)}
    constructed = {}
    for name, bars in constructed_series(constructed_pat).items():
        o, h, l, c = (np.asarray([b[k] for b in bars], dtype=float) for k in range(4))
        constructed[name] = {"open": o.tolist(), "high": h.tolist(), "low": l.tolist(), "close": c.tolist(),
                             "signals": cdl_signals(functions, o, h, l, c)}
    out = {
        "note": "TA-Lib-Candlestick-Signale der Muster ab candlesticks 1.1.0 auf den eingefrorenen echten Tagesbars von "
                + src_rel + " (Bars dort, hier nur Signale) und auf konstruierten Kerzenfolgen fuer seltene Muster. "
                "Erzeugt mit scripts/technical/build-talib-reference.py --set " + set_name + ". Nur fuer Tests.",
        "library": "TA-Lib (Python)",
        "libraryVersion": talib.__version__,
        "coreVersion": talib.__ta_version__.decode() if isinstance(talib.__ta_version__, bytes) else str(talib.__ta_version__),
        "set": set_name,
        "source": src_rel,
        "params": {"CDLMATHOLD": {"penetration": 0.5}} if set_name == "candles2" else {},
        "lookback": {pid: abstract.Function(fn).lookback for pid, fn in functions.items()},
        "functions": functions,
        "titles": titles,
        "constructed": constructed,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
        fh.write("\n")
    print(f"{args.out}: {len(titles)} Titel, {len(constructed)} konstruierte Reihen, {len(functions)} Muster, TA-Lib {out['libraryVersion']}")


def ext2_series(o, h, l, c, v):
    """indicators 1.4.0 (L2b), aus TA-Lib-Grundbausteinen zusammengesetzt (Formeln wie dokumentiert)."""
    prev_c = np.concatenate([[np.nan], c[:-1]])
    prev_h = np.concatenate([[np.nan], h[:-1]])
    prev_l = np.concatenate([[np.nan], l[:-1]])
    tr = np.maximum.reduce([h - l, np.abs(h - prev_c), np.abs(l - prev_c)])
    e1 = talib.EMA(h - l, 9)
    mx = talib.MAX(c, 14)
    e13 = talib.EMA(c, 13)
    mid = talib.MEDPRICE(h, l)
    d = c - prev_c
    k = 20 // 2 + 1
    eh = talib.EMA(h - l, 10)
    series = {
        "vortexPlus": ("SUM(|H − L₋₁|,14)/SUM(TR,14)", talib.SUM(np.abs(h - prev_l), 14) / talib.SUM(tr, 14)),
        "vortexMinus": ("SUM(|L − H₋₁|,14)/SUM(TR,14)", talib.SUM(np.abs(l - prev_h), 14) / talib.SUM(tr, 14)),
        "massIndex": ("SUM(EMA9(H−L)/EMA9(EMA9(H−L)),25)", talib.SUM(e1 / talib.EMA(e1, 9), 25)),
        "choppiness": ("100·log10(SUM(TR,14)/(MAX(H,14)−MIN(L,14)))/log10(14)", 100 * np.log10(talib.SUM(tr, 14) / (talib.MAX(h, 14) - talib.MIN(l, 14))) / np.log10(14)),
        "ulcerIndex": ("sqrt(SMA((100·(C−MAX(C,14))/MAX)^2,14))", np.sqrt(talib.SMA((100 * (c - mx) / mx) ** 2, 14))),
        "forceIndex": ("EMA((C−C₋₁)·V,13)", talib.EMA((c - prev_c) * v, 13)),
        "elderBull": ("H − EMA(C,13)", h - e13),
        "elderBear": ("L − EMA(C,13)", l - e13),
        "awesomeOscillator": ("SMA(MEDPRICE,5) − SMA(MEDPRICE,34)", talib.SMA(mid, 5) - talib.SMA(mid, 34)),
        "coppock": ("WMA(ROC14 + ROC11, 10)", talib.WMA(talib.ROC(c, 14) + talib.ROC(c, 11), 10)),
        "kst": ("SMA10(ROC10)+2·SMA10(ROC15)+3·SMA10(ROC20)+4·SMA15(ROC30)", talib.SMA(talib.ROC(c, 10), 10) + 2 * talib.SMA(talib.ROC(c, 15), 10) + 3 * talib.SMA(talib.ROC(c, 20), 10) + 4 * talib.SMA(talib.ROC(c, 30), 15)),
        "tsi": ("100·EMA13(EMA25(ΔC))/EMA13(EMA25(|ΔC|))", 100 * talib.EMA(talib.EMA(d, 25), 13) / talib.EMA(talib.EMA(np.abs(d), 25), 13)),
        "dpo": ("C₋₁₁ − SMA(C,20)", np.concatenate([np.full(k, np.nan), c[:-k]]) - talib.SMA(c, 20)),
        "historicalVolatility": ("100·STDDEV(ln C/C₋₁,20)·sqrt(20/19)·sqrt(252)", 100 * talib.STDDEV(np.log(c / prev_c), 20, 1) * np.sqrt(20 / 19) * np.sqrt(252)),
        "zScore": ("(C − SMA20)/STDDEV(C,20)", (c - talib.SMA(c, 20)) / talib.STDDEV(c, 20, 1)),
        "pvo": ("PPO(volume, 12, 26, EMA)", talib.PPO(v, 12, 26, 1)),
        "chaikinVolatility": ("100·(EMA10(H−L)/EMA10(H−L)₋₁₀ − 1)", 100 * (eh / np.concatenate([np.full(10, np.nan), eh[:-10]]) - 1)),
    }
    return {key: {"call": call, "values": ser(vals)} for key, (call, vals) in series.items()}


def write(args, ref, c, series):
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
    if args.set != "core":
        out = {**out, "set": args.set}
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
        fh.write("\n")
    print(f"{args.out}: {len(series)} Reihen, {len(c)} Bars, TA-Lib {out['libraryVersion']}")


if __name__ == "__main__":
    main()
