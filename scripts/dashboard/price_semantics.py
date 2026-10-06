#!/usr/bin/env python3
"""Zugriff auf die zentrale Bereinigungssemantik von der Python-Seite.

Der Quant-Bereich (JavaScript) und dieses Dashboard (Python) rechnen beide
Kennzahlen aus Kursreihen. Bis Phase 3 taten sie das auf unterschiedlich
bereinigten Reihen und nannten beide Ergebnisse "Rendite": der Quant-Bereich
auf total-return-bereinigten Kursen, das Dashboard auf splitbereinigten.
Beide Zahlen sind fuer sich richtig; nebeneinandergestellt sind sie irrefuehrend.

Eine gemeinsame Bibliothek gibt es zwischen den beiden Stacks nicht. Eine
gemeinsame Definition schon: quant/methodology/price-adjustment-v1.json.
Dieses Modul liest sie und stellt dieselben Pruefungen bereit wie
quant/engines/price-semantics.js.

Bewusst ohne Abhaengigkeiten - das Dashboard laeuft mit der Standardbibliothek.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
METHODOLOGY = ROOT / "quant" / "methodology" / "price-adjustment-v1.json"

RAW = "RAW"
SPLIT_ADJUSTED = "SPLIT_ADJUSTED"
TOTAL_RETURN = "TOTAL_RETURN"
UNKNOWN = "UNKNOWN"

# UNKNOWN liegt ausdruecklich unter RAW: "wir wissen nicht, was das ist"
# muss strenger behandelt werden als "wir wissen, dass die Bereinigung fehlt".
RANK = {UNKNOWN: -1, RAW: 0, SPLIT_ADJUSTED: 1, TOTAL_RETURN: 2}

FROM_PROVIDER = {
    "adjusted": TOTAL_RETURN,
    "total_return": TOTAL_RETURN,
    "splitAdjusted": SPLIT_ADJUSTED,
    "split_adjusted": SPLIT_ADJUSTED,
    "unadjusted": RAW,
    "raw": RAW,
}

_config = None


def config():
    """Laedt die Methodikdatei einmal. Fehlt sie, arbeitet das Modul mit den
    eingebauten Mindestanforderungen weiter - es soll nie der Grund sein,
    warum das Dashboard gar nicht laeuft."""
    global _config
    if _config is None:
        try:
            with METHODOLOGY.open(encoding="utf-8") as handle:
                _config = json.load(handle)
        except (OSError, json.JSONDecodeError):
            _config = {}
    return _config


FALLBACK_MINIMUM = {
    "price_return": SPLIT_ADJUSTED,
    "total_return": TOTAL_RETURN,
    "momentum": SPLIT_ADJUSTED,
    "volatility": SPLIT_ADJUSTED,
    "drawdown": SPLIT_ADJUSTED,
    "moving_average": SPLIT_ADJUSTED,
    "breakout": SPLIT_ADJUSTED,
    "relative_strength": SPLIT_ADJUSTED,
    "cagr": TOTAL_RETURN,
    "backtest_evidence": TOTAL_RETURN,
    "order_sizing": RAW,
    "volume_analysis": RAW,
}


def normalize(value):
    """Bringt eine Angabe auf eine der vier Stufen. Alles Unbekannte wird
    UNKNOWN - niemals geraten."""
    if not value:
        return UNKNOWN
    upper = str(value).upper()
    if upper in RANK:
        return upper
    return FROM_PROVIDER.get(str(value), UNKNOWN)


def rank(level):
    return RANK.get(normalize(level), -1)


def minimum_for(metric):
    metrics = config().get("metrics", {})
    if metric in metrics:
        return metrics[metric].get("minimumLevel")
    return FALLBACK_MINIMUM.get(metric)


def label(level):
    level = normalize(level)
    levels = config().get("levels", {})
    if level in levels:
        return levels[level].get("label", level)
    return {UNKNOWN: "Unbekannt", RAW: "Unbereinigt",
            SPLIT_ADJUSTED: "Splitbereinigt", TOTAL_RETURN: "Total Return"}[level]


def check(metric, level):
    """Darf `metric` aus einer Reihe der Stufe `level` berechnet werden?

    Gibt ein dict zurueck, kein bool: der Aufrufer braucht im Ablehnungsfall
    den Grund, um ihn auszugeben."""
    actual = normalize(level)
    minimum = minimum_for(metric)

    if minimum is None:
        return {"allowed": False, "level": actual, "required": None,
                "reason": "unknownMetric",
                "message": f"Unbekannte Kennzahl '{metric}'."}
    if actual == UNKNOWN:
        return {"allowed": False, "level": actual, "required": minimum,
                "reason": "unknownAdjustment",
                "message": ("Die Bereinigungsstufe der Reihe ist nicht bekannt. "
                            f"'{metric}' setzt mindestens {label(minimum)} voraus.")}
    if rank(actual) < rank(minimum):
        return {"allowed": False, "level": actual, "required": minimum,
                "reason": "insufficientAdjustment",
                "message": (f"Die Reihe ist {label(actual)}; '{metric}' setzt mindestens "
                            f"{label(minimum)} voraus.")}
    return {"allowed": True, "level": actual, "required": minimum,
            "reason": None, "message": None}


def return_label(level):
    """Wie eine Renditezahl dieser Stufe heissen darf.

    'Rendite' ohne Zusatz ist ausschliesslich fuer TOTAL_RETURN zulaessig."""
    level = normalize(level)
    return {
        TOTAL_RETURN: "Gesamtrendite",
        SPLIT_ADJUSTED: "Kursrendite",
        RAW: "Kursveraenderung (unbereinigt)",
    }.get(level, "Kursveraenderung (Bereinigung unbekannt)")


def caveat(level):
    """Was an einer Kennzahl dieser Stufe fehlt - fuer die Anzeige."""
    level = normalize(level)
    if level == TOTAL_RETURN:
        return None
    if level == SPLIT_ADJUSTED:
        return ("Ohne Dividenden gerechnet. Bei einem Ausschuetter liegt die "
                "tatsaechliche Gesamtrendite darueber.")
    if level == RAW:
        return ("Weder Splits noch Dividenden beruecksichtigt. Ein Split im "
                "Zeitraum erscheint als Kurssturz, obwohl kein Wert verloren ging.")
    return ("Die Bereinigungsstufe dieser Reihe ist nicht dokumentiert. "
            "Die Zahl ist nicht interpretierbar.")


def describe(level, metric=None):
    """Der Block, der in jede erzeugte JSON-Datei gehoert."""
    level = normalize(level)
    block = {
        "adjustment": level,
        "adjustmentLabel": label(level),
        "adjustmentCaveat": caveat(level),
        "semanticsVersion": config().get("methodologyVersion", "price-adjustment-v1.0.0"),
    }
    if metric:
        block["metric"] = metric
        block["metricLabel"] = return_label(level) if metric in ("price_return", "total_return") else metric
    return block


if __name__ == "__main__":
    print(f"Methodik: {METHODOLOGY}")
    print(f"  geladen: {bool(config())}")
    for lvl in (RAW, SPLIT_ADJUSTED, TOTAL_RETURN, UNKNOWN):
        allowed = check("total_return", lvl)["allowed"]
        print(f"  {lvl:<15} {label(lvl):<16} total_return={'ja' if allowed else 'nein':<5} "
              f"Renditename: {return_label(lvl)}")
