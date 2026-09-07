#!/usr/bin/env python3
"""Einmalige Migration: bestehende Marktdaten mit ihrer Bereinigungsstufe kennzeichnen.

Phase 3, §2 (Auditbefund MEDIUM-7).

Das committete dashboard/data/market_data.json wurde mit schema_version 1
erzeugt und traegt keine Angabe, wie die Kurse bereinigt sind. Die
nachgelagerten Skripte verweigern seit Phase 3 die Berechnung ohne diese
Angabe - richtig so, aber es wuerde die bestehende Pipeline anhalten, bis
der naechste Abruf laeuft. Der braucht einen API-Schluessel, und der ist
nicht Teil dieser Phase.

Diese Migration schliesst die Luecke, ohne eine einzige Zahl zu aendern:
sie ergaenzt die Kennzeichnung an der vorhandenen Datei und prueft dabei
nach, ob die behauptete Stufe zu den Daten passt.

Ausfuehren:
    python3 scripts/dashboard/migrate_adjustment_semantics.py
    python3 scripts/dashboard/migrate_adjustment_semantics.py --check
"""
import argparse
import json
import sys
from pathlib import Path

import price_semantics

ROOT = Path(__file__).resolve().parents[2]
MARKET = ROOT / "dashboard" / "data" / "market_data.json"

# Bekannte Splits im Zeitraum der Reihe. Wird die Reihe an diesen Tagen
# NICHT von einem Sprung durchbrochen, ist sie splitbereinigt.
KNOWN_SPLITS = [
    {"symbol": "NVDA", "date": "2021-07-20", "ratio": 4,  "note": "4:1"},
    {"symbol": "NVDA", "date": "2024-06-10", "ratio": 10, "note": "10:1"},
    {"symbol": "AMZN", "date": "2022-06-06", "ratio": 20, "note": "20:1"},
]


def verify_split_adjustment(market):
    """Prueft die Behauptung 'splitbereinigt' an den Daten selbst nach.

    Nicht als Beweis gedacht - ein fehlender Sprung kann auch heissen, dass
    der Split ausserhalb des Zeitraums lag. Aber ein VORHANDENER Sprung an
    einem bekannten Splittag widerlegt die Behauptung sofort, und genau
    davor soll die Migration schuetzen."""
    findings = []
    for split in KNOWN_SPLITS:
        rows = market.get("symbols", {}).get(split["symbol"])
        if not rows:
            findings.append({"split": split, "result": "symbol_absent"})
            continue
        by_date = {row["date"]: row for row in rows}
        dates = sorted(by_date)
        if split["date"] not in by_date:
            findings.append({"split": split, "result": "date_outside_range"})
            continue
        index = dates.index(split["date"])
        if index == 0:
            findings.append({"split": split, "result": "no_previous_bar"})
            continue
        previous = by_date[dates[index - 1]]["close"]
        current = by_date[split["date"]]["close"]
        if not previous or not current:
            findings.append({"split": split, "result": "no_close"})
            continue
        observed = previous / current
        # Ein unbereinigter Split zeigt sich als Verhaeltnis nahe dem Splitfaktor.
        if abs(observed - split["ratio"]) / split["ratio"] < 0.15:
            findings.append({"split": split, "result": "UNADJUSTED_SPLIT_FOUND",
                             "observed_ratio": round(observed, 3)})
        else:
            findings.append({"split": split, "result": "adjusted",
                             "observed_ratio": round(observed, 3)})
    return findings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true",
                        help="Nur pruefen und berichten, nichts schreiben.")
    parser.add_argument("--level", default=price_semantics.SPLIT_ADJUSTED)
    args = parser.parse_args()

    if not MARKET.exists():
        print(f"{MARKET} existiert nicht - nichts zu migrieren.")
        return

    market = json.loads(MARKET.read_text(encoding="utf-8"))
    current = market.get("adjustment")
    print(f"Datei:   {MARKET.relative_to(ROOT)}")
    print(f"  schema_version: {market.get('schema_version')}")
    print(f"  adjustment:     {current or '(fehlt)'}")

    print("\nNachpruefung an bekannten Splits:")
    findings = verify_split_adjustment(market)
    contradicted = False
    for f in findings:
        s = f["split"]
        ratio = f.get("observed_ratio")
        detail = f" (beobachtetes Verhaeltnis {ratio})" if ratio is not None else ""
        print(f"  {s['symbol']:<6} {s['date']}  {s['note']:<5} -> {f['result']}{detail}")
        if f["result"] == "UNADJUSTED_SPLIT_FOUND":
            contradicted = True

    if contradicted:
        print("\nABBRUCH: An einem bekannten Splittag steht ein unbereinigter Sprung.")
        print("Die Reihe ist RAW, nicht SPLIT_ADJUSTED. Die Migration wuerde eine")
        print("falsche Zusicherung in die Datei schreiben.")
        sys.exit(1)

    level = price_semantics.normalize(args.level)
    print(f"\nEinstufung: {level} ({price_semantics.label(level)})")
    print(f"  {price_semantics.caveat(level)}")

    if args.check:
        print("\n--check: nichts geschrieben.")
        return
    if current == level and market.get("schema_version") == 2:
        print("\nBereits migriert - nichts zu tun.")
        return

    # Die Zahlen bleiben unberuehrt. Ergaenzt werden ausschliesslich die
    # Felder, die sagen, was die Zahlen bedeuten.
    migrated = {}
    for key, value in market.items():
        migrated[key] = value
        if key == "interval":
            migrated["adjustment"] = level
            migrated["adjustment_label"] = price_semantics.label(level)
            migrated["adjustment_caveat"] = price_semantics.caveat(level)
            migrated["adjustment_evidence"] = (
                "Nachtraeglich eingestuft (Phase 3 §2). Belegt an bekannten Splits in der "
                "Reihe selbst: an keinem von ihnen steht ein unbereinigter Sprung. "
                "Kein adjusted_close-Feld und kein Dividendenendpunkt im kostenlosen "
                "Zugang, daher nicht TOTAL_RETURN."
            )
            migrated["semantics_version"] = price_semantics.config().get("methodologyVersion")
    if "adjustment" not in migrated:
        migrated["adjustment"] = level
    migrated["schema_version"] = 2

    MARKET.write_text(json.dumps(migrated, indent=2) + "\n", encoding="utf-8")
    print(f"\nGeschrieben. schema_version 1 -> 2, {len(market.get('symbols', {}))} Symbole unveraendert.")


if __name__ == "__main__":
    main()
