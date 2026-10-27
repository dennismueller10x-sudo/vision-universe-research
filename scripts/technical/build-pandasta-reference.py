#!/usr/bin/env python3
"""Zweite fremde Referenz fuer Katalogindikatoren ohne TA-Lib-Gegenstueck (L8, INDICATORS_EXTERNAL_REFERENCE.md).

Rechnet auf dem eingefrorenen AAPL-Ausschnitt (quant/tests/fixtures/technical-reference-aapl.json):
  * mit pandas-ta 0.4.71b0, wo dessen Definition der dokumentierten entspricht;
  * aus TA-Lib-/numpy-Grundbausteinen nach der dokumentierten Formel, wo pandas-ta anders definiert
    (ALMA ohne Abrunden des Offsets, NVI/PVI multiplikativ nach Fosback, Klinger mit dm/cm,
    Connors RSI mit kumulierter Serie, Supertrend nach Pine) oder kein Gegenstueck hat (Pivot-Varianten,
    Keltner mit eigener ATR-Laenge, ROC 63/126/252, Inside Bar, NR7, Envelope, Elder Impulse).

Der Test quant/tests/technical-indicators-pandasta.test.mjs vergleicht die Engine damit ab der je Reihe
festgehaltenen Bar `from` (Startwert-Konventionen, siehe Doku). pandas-ta und TA-Lib sind KEINE
Projektabhaengigkeiten; das Skript laeuft nur, wenn jemand die Fixture bewusst neu erzeugt:

    python3 -m venv /tmp/talib-venv
    /tmp/talib-venv/bin/pip install TA-Lib==0.8.2 pandas-ta==0.4.71b0
    /tmp/talib-venv/bin/python -I scripts/technical/build-pandasta-reference.py \
        --out quant/tests/fixtures/technical-pandasta-reference-aapl.json

pandas-ta rechnet hier mit talib=False, damit das Ergebnis nicht davon abhaengt, ob TA-Lib installiert ist.
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


def alma(c, n, offset, sigma):
    """Arnaud Legoux: m = offset·(n−1) OHNE Abrunden (pandas-ta rundet m ab), s = n/sigma."""
    m, s = offset * (n - 1), n / sigma
    w = np.exp(-((np.arange(n) - m) ** 2) / (2 * s * s))
    w /= w.sum()
    out = np.full(len(c), np.nan)
    for i in range(n - 1, len(c)):
        out[i] = np.dot(c[i - n + 1:i + 1], w)
    return out


def volume_index(c, v, falling):
    """NVI/PVI nach Fosback: Start 1000, aendert sich multiplikativ um die Tagesrendite nur an Tagen mit
    fallendem (NVI) bzw. steigendem (PVI) Volumen (pandas-ta addiert die Prozentpunkte)."""
    out = np.full(len(c), np.nan)
    out[0] = 1000.0
    for i in range(1, len(c)):
        move = v[i] < v[i - 1] if falling else v[i] > v[i - 1]
        out[i] = out[i - 1] * (c[i] / c[i - 1]) if move else out[i - 1]
    return out


def klinger(h, l, c, v, fast, slow, signal):
    """Klinger Volume Oscillator (Klinger 1997): Trend aus H+L+C, dm = H − L, cm kumuliert bei gleichem Trend,
    VF = V·|2·dm/cm − 1|·Trend·100, KVO = EMA_fast(VF) − EMA_slow(VF), Signal = EMA_signal(KVO).
    pandas-ta definiert KVO vereinfacht ueber das Vorzeichen von HLC3 ohne dm/cm."""
    n = len(c)
    hlc = h + l + c
    dm = h - l
    vf = np.full(n, np.nan)
    trend_prev, cm = None, 0.0
    for i in range(1, n):
        trend = 1 if hlc[i] > hlc[i - 1] else -1
        cm = (cm + dm[i]) if trend == trend_prev else (dm[i - 1] + dm[i])
        trend_prev = trend
        vf[i] = v[i] * abs(2 * dm[i] / cm - 1) * trend * 100 if cm != 0 else 0.0
    kvo = np.full(n, np.nan)
    kvo[1:] = talib.EMA(vf[1:], fast) - talib.EMA(vf[1:], slow)
    sig = np.full(n, np.nan)
    first = int(np.argmax(~np.isnan(kvo)))
    sig[first:] = talib.EMA(kvo[first:], signal)
    return kvo, sig


def connors_rsi(c, rsi_n, streak_n, rank_n):
    """Connors RSI: (RSI_3(C) + RSI_2(Serie) + Perzentilrang_100(ROC1)) / 3. Serie kumuliert (+1, +2, …;
    −1, −2, …; 0 bei gleichem Schluss); pandas-ta 0.4.71b0 liefert nur ±1. Rang = Anteil der vorigen
    rank_n Tagesrenditen, die kleiner sind als die heutige (pandas-ta percent_rank, gleich)."""
    n = len(c)
    streak = np.zeros(n)
    for i in range(1, n):
        d = c[i] - c[i - 1]
        s = streak[i - 1]
        streak[i] = (s + 1 if s > 0 else 1) if d > 0 else ((s - 1 if s < 0 else -1) if d < 0 else 0)
    streak_rsi = np.full(n, np.nan)
    streak_rsi[1:] = talib.RSI(streak[1:], streak_n)
    rank = np.asarray(ta.utils.percent_rank(pd.Series(c), rank_n), dtype=float)
    # pandas-ta liefert den Rang schon an Bar rank_n; dort enthaelt das Fenster die fehlende erste Rendite
    # (NaN zaehlt als "nicht kleiner"). Volle rank_n Vorrenditen gibt es erst ab Bar rank_n + 1.
    rank[:rank_n + 1] = np.nan
    return (talib.RSI(c, rsi_n) + streak_rsi + rank) / 3


def supertrend_pine(h, l, c, atr):
    """Supertrend nach TradingView (Pine ta.supertrend): Baender (H+L)/2 ± m·ATR, nachgezogen mit dem Vorschluss;
    Richtung wechselt, wenn der Schluss das aktuelle Gegenband kreuzt. Pine startet abwaerts (direction 1 = ab).
    pandas-ta zieht die Baender anders nach (nur ohne Richtungswechsel, Vergleich mit dem Vorband)."""
    n = len(c)
    mid = (h + l) / 2
    line = np.full(n, np.nan)
    fu = np.full(n, np.nan)
    fl = np.full(n, np.nan)
    up = None
    for i in range(n):
        if math.isnan(atr[i]):
            continue
        bu, bl = mid[i] + 3 * atr[i], mid[i] - 3 * atr[i]
        if up is None:
            fu[i], fl[i], up = bu, bl, False
        else:
            fu[i] = bu if (bu < fu[i - 1] or c[i - 1] > fu[i - 1]) else fu[i - 1]
            fl[i] = bl if (bl > fl[i - 1] or c[i - 1] < fl[i - 1]) else fl[i - 1]
            up = (c[i] >= fl[i]) if up else (c[i] > fu[i])
        line[i] = fl[i] if up else fu[i]
    return line


def pivots(h, l, c):
    """Pivot-Varianten aus Hoch, Tief und Schluss der Vorbar."""
    H, L, C = np.roll(h, 1), np.roll(l, 1), np.roll(c, 1)
    H[0] = L[0] = C[0] = np.nan
    rng = H - L
    p = (H + L + C) / 3
    pw = (H + L + 2 * C) / 4
    out = {
        "pivots.pivot": p, "pivots.r1": 2 * p - L, "pivots.s1": 2 * p - H, "pivots.r2": p + rng, "pivots.s2": p - rng,
        "pivotsFib.p": p,
        "pivotsWoodie.p": pw, "pivotsWoodie.r1": 2 * pw - L, "pivotsWoodie.s1": 2 * pw - H,
        "pivotsWoodie.r2": pw + rng, "pivotsWoodie.s2": pw - rng,
    }
    for k, f in zip((1, 2, 3), (0.382, 0.618, 1.0)):
        out[f"pivotsFib.r{k}"] = p + f * rng
        out[f"pivotsFib.s{k}"] = p - f * rng
    for k, d in zip((1, 2, 3, 4), (12, 6, 4, 2)):
        out[f"pivotsCamarilla.r{k}"] = C + rng * 1.1 / d
        out[f"pivotsCamarilla.s{k}"] = C - rng * 1.1 / d
    out["pivotsCamarilla.p"] = p
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    ref = json.load(open(SRC))
    df = pd.DataFrame({k: ref[k] for k in ("open", "high", "low", "close", "volume")}, dtype=float)
    o, h, l, c, v = (df[k] for k in ("open", "high", "low", "close", "volume"))
    hn, ln, cn, vn = h.to_numpy(), l.to_numpy(), c.to_numpy(), v.to_numpy()

    # Je Reihe: Werte, Quelle, erste verglichene Bar (Startwert-Konvention, Doku L8).
    rows = {}

    def put(key, values, source, start):
        rows[key] = {"source": source, "from": start, "values": ser(values)}

    put("vwma", ta.vwma(c, v, length=20), "pandas-ta vwma", 0)
    put("hma", ta.hma(c, length=20), "pandas-ta hma", 0)
    put("zlema", ta.zlma(c, length=20, mamode="ema"), "pandas-ta zlma (ema)", 0)
    put("cmf", ta.cmf(h, l, c, v, length=20), "pandas-ta cmf (ohne open)", 0)
    put("easeOfMovement", ta.eom(h, l, c, v, length=14, divisor=100000000), "pandas-ta eom", 0)
    ha = ta.ha(o, h, l, c)
    for k, col in zip(("open", "high", "low", "close"), ha.columns):
        put("heikinAshi." + k, ha[col], "pandas-ta ha", 0)
    kc = ta.kc(h, l, c, length=20, scalar=2, mamode="ema", talib=False)
    put("keltner.middle", kc.iloc[:, 1], "pandas-ta kc (Mittellinie EMA 20)", 0)
    # pandas-ta kc nimmt fuer die Bandbreite dieselbe Laenge wie die Mittellinie; die Engine hat eine eigene ATR-Laenge.
    atr10 = ta.atr(h, l, c, length=10, talib=False).to_numpy()
    put("keltner.upper", kc.iloc[:, 1].to_numpy() + 2 * atr10, "pandas-ta EMA 20 + 2·ATR 10 (RMA)", 0)
    put("keltner.lower", kc.iloc[:, 1].to_numpy() - 2 * atr10, "pandas-ta EMA 20 − 2·ATR 10 (RMA)", 0)
    put("mcginley", ta.mcgd(c, length=14), "pandas-ta mcgd", 215)
    atr_st = ta.atr(h, l, c, length=10, talib=False).to_numpy()
    put("supertrend.line", supertrend_pine(hn, ln, cn, atr_st), "Pine ta.supertrend mit pandas-ta ATR 10 (RMA)", 0)
    ce = ta.chandelier_exit(h, l, c, high_length=22, low_length=22, atr_length=22, multiplier=3, talib=False)
    put("chandelier.long", ce.iloc[:, 0], "pandas-ta chandelier_exit (RMA-ATR)", 0)
    put("chandelier.short", ce.iloc[:, 1], "pandas-ta chandelier_exit (RMA-ATR)", 0)
    put("alma", alma(cn, 9, 0.85, 6), "numpy nach Legoux (m ohne Abrunden)", 0)
    put("nvi", volume_index(cn, vn, True), "numpy nach Fosback (multiplikativ)", 0)
    put("pvi", volume_index(cn, vn, False), "numpy nach Fosback (multiplikativ)", 0)
    kvo, sig = klinger(hn, ln, cn, vn, 34, 55, 13)
    put("klinger.kvo", kvo, "TA-Lib EMA aus VF nach Klinger", 0)
    put("klinger.signal", sig, "TA-Lib EMA aus VF nach Klinger", 0)
    put("connorsRsi", connors_rsi(cn, 3, 2, 100), "TA-Lib RSI + kumulierte Serie + pandas-ta percent_rank", 0)
    for k, val in pivots(hn, ln, cn).items():
        put(k, val, "numpy nach Formel (Vorbar)", 0)
    # Die uebrigen Katalogeintraege ohne eigenes Gegenstueck, aus TA-Lib-/numpy-Bausteinen nach der Formel.
    for per in (63, 126, 252):
        put(f"roc{per}", talib.ROC(cn, per), f"TA-Lib ROC {per} (Prozent)", 0)
    inside = np.full(len(cn), np.nan)
    inside[1:] = ((hn[1:] < hn[:-1]) & (ln[1:] > ln[:-1])).astype(float)
    put("insideBar", inside, "numpy: H < H−1 und L > L−1", 0)
    rng = hn - ln
    nr = np.full(len(cn), np.nan)
    for i in range(6, len(cn)):
        nr[i] = 1.0 if rng[i] <= rng[i - 6:i + 1].min() else 0.0
    put("nr7", nr, "numpy: kleinste Spanne der letzten 7 (Gleichstand zaehlt)", 0)
    sma20 = talib.SMA(cn, 20)
    put("envelope.middle", sma20, "TA-Lib SMA 20", 0)
    put("envelope.upper", sma20 * 1.025, "TA-Lib SMA 20 · 1,025", 0)
    put("envelope.lower", sma20 * 0.975, "TA-Lib SMA 20 · 0,975", 0)
    ema13 = talib.EMA(cn, 13)
    hist = talib.MACD(cn, 12, 26, 9)[2]
    imp = np.full(len(cn), np.nan)
    for i in range(1, len(cn)):
        if np.isnan([ema13[i], ema13[i - 1], hist[i], hist[i - 1]]).any():
            continue
        de, dh = ema13[i] - ema13[i - 1], hist[i] - hist[i - 1]
        imp[i] = 1.0 if de > 0 and dh > 0 else (-1.0 if de < 0 and dh < 0 else 0.0)
    put("elderImpulse", imp, "TA-Lib EMA 13 + MACD-Histogramm 12/26/9", 0)

    out = {
        "note": "Erzeugt mit scripts/technical/build-pandasta-reference.py. Nur fuer Tests.",
        "source": "quant/tests/fixtures/technical-reference-aapl.json",
        "libraries": {"pandas_ta": ta.version, "talib": talib.__version__, "talibCore": talib.__ta_version__.decode() if isinstance(talib.__ta_version__, bytes) else str(talib.__ta_version__)},
        "bars": len(cn),
        "series": rows,
    }
    with open(args.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")
    print(f"{len(rows)} Reihen -> {args.out}")


if __name__ == "__main__":
    main()
