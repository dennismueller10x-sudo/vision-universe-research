#!/usr/bin/env python3
"""Prueft die Bereinigungs-Sperre, ohne Produktionsdaten anzufassen.

Phase 3, §2. Die nachgelagerten Dashboard-Skripte verweigern seit Phase 3 die
Berechnung, wenn die Bereinigungsstufe der Kursreihe fehlt oder zu niedrig ist.
Genau das soll in der CI geprueft werden - aber ohne die committeten
Datendateien neu zu erzeugen.

Der naheliegende Weg (die Kette einfach laufen lassen) hat zwei Nachteile: er
schreibt in den Arbeitsbaum, und er prueft nur den Fall, in dem alles stimmt.
Ein Test, der den Fehlerfall nicht ausloest, prueft die Sperre nicht.

Dieses Skript arbeitet deshalb auf einer Kopie in einem temporaeren
Verzeichnis und loest beide Faelle aus.

Ausfuehren:
    python3 scripts/dashboard/verify_adjustment_gate.py
"""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts" / "dashboard"
MARKET = ROOT / "dashboard" / "data" / "market_data.json"

CONSUMERS = ["calculate_technicals.py", "backtest_technicals.py"]


def run_in(workdir, script):
    """Fuehrt ein Verbraucherskript in einer Kopie aus und gibt (code, stderr) zurueck."""
    result = subprocess.run(
        [sys.executable, str(workdir / "scripts" / "dashboard" / script)],
        cwd=workdir, capture_output=True, text=True)
    return result.returncode, (result.stderr or "").strip()


def make_workdir(tmp, adjustment):
    """Baut eine minimale Kopie des Repositories mit gesetzter oder fehlender Stufe."""
    work = Path(tmp) / ("with" if adjustment else "without")
    (work / "scripts" / "dashboard").mkdir(parents=True)
    (work / "dashboard" / "data").mkdir(parents=True)
    (work / "quant" / "methodology").mkdir(parents=True)

    for name in CONSUMERS + ["price_semantics.py"]:
        shutil.copy(SCRIPTS / name, work / "scripts" / "dashboard" / name)
    shutil.copy(ROOT / "quant" / "methodology" / "price-adjustment-v1.json",
                work / "quant" / "methodology")

    market = json.loads(MARKET.read_text(encoding="utf-8"))
    if adjustment:
        market["adjustment"] = adjustment
    else:
        market.pop("adjustment", None)
    (work / "dashboard" / "data" / "market_data.json").write_text(
        json.dumps(market), encoding="utf-8")
    return work


def main():
    committed = json.loads(MARKET.read_text(encoding="utf-8"))
    declared = committed.get("adjustment")

    print("Bereinigungs-Sperre der Dashboard-Kette")
    print(f"  Committete Stufe: {declared or '(fehlt)'}")

    problems = []
    if not declared:
        problems.append("dashboard/data/market_data.json traegt keine Bereinigungsstufe.")
    if committed.get("schema_version", 0) < 2:
        problems.append("schema_version < 2 - die Migration ist nicht angewandt.")

    with tempfile.TemporaryDirectory() as tmp:
        # Fall 1: Stufe vorhanden -> muss durchlaufen.
        good = make_workdir(tmp, declared or "SPLIT_ADJUSTED")
        print("\n  Mit Bereinigungsstufe:")
        for script in CONSUMERS:
            code, err = run_in(good, script)
            state = "laeuft durch" if code == 0 else f"BRICHT AB (Code {code})"
            print(f"    {script:<28} {state}")
            if code != 0:
                problems.append(f"{script} bricht trotz gesetzter Stufe ab: {err.splitlines()[0] if err else ''}")

        # Fall 2: Stufe fehlt -> muss abbrechen. Das ist der eigentliche Test.
        bad = make_workdir(tmp, None)
        print("\n  Ohne Bereinigungsstufe (die Sperre muss greifen):")
        for script in CONSUMERS:
            code, err = run_in(bad, script)
            state = f"bricht ab (Code {code})" if code != 0 else "LAEUFT DURCH"
            print(f"    {script:<28} {state}")
            if code == 0:
                problems.append(
                    f"{script} rechnet auf einer Reihe ohne bekannte Bereinigungsstufe. "
                    "Die Sperre greift nicht.")

    if problems:
        print("\nFEHLER:")
        for p in problems:
            print(f"  · {p}")
        sys.exit(1)

    print("\n  Die Sperre greift in beide Richtungen. Keine Datei veraendert.")


if __name__ == "__main__":
    main()
