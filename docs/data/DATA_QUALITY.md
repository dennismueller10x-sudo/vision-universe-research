# Datenqualität

**Engine:** `core/data-quality.js` (reine Regeln) · **CLI:** `node scripts/core/data-quality.mjs [--json] [--strict]` ·
**CI:** `core-ci.yml` (Bericht auf jedem PR, streng täglich gegen `main`).

Jede Regel ist deterministisch. Gleiche Artefakte ergeben dasselbe Ergebnis. Es gibt keine Stichproben und keinen Anbieterabruf.

| Regel | Schwere | Prüft | Fängt (belegter Fall) |
|---|---|---|---|
| DQ-ID-1 | ERROR | jede `securityId` in Konfiguration, Universum und Gate-Universen folgt `core/identity.js` | BRK-B als `ref_BRKB` |
| DQ-ID-2 | ERROR | kein doppelter Ticker und keine doppelte `securityId` im Produktuniversum | – |
| DQ-ID-3 | WARN | ein aktives Symbol hat genau ein aktives Instrument im Company Master | SGI, COHR (Börsenwechsel) |
| DQ-PX-1 | ERROR | Reihen sind sortiert, ohne Doppeldaten, haben nur positive Kurse, und der Kopf (`to`, `barCount`) passt zum Inhalt | CPTAF, DMN mit Kurs 0 |
| DQ-PX-2 | WARN | Reihen tragen die letzte abgeschlossene Sitzung; Histogramm des Rückstands | 53 Reihen ≥ 5 Sitzungen alt (AVB, LEG, WBS …) |
| DQ-PX-3 | WARN | kein Tagessprung über ±60 % in split-bereinigten Reihen; ganzzahliger Faktor = Split-Verdacht | AMOD 1,17 → 3,49 (Faktor 3) |
| DQ-PX-4 | ERROR | Tages- und Wochenreihe zeigen am selben Tag denselben Schluss (eine Preiswahrheit) | – |
| DQ-PX-5 | ERROR | die Aktienseite zeigt den letzten Schluss ihrer Reihe | – |
| DQ-PR-1 | ERROR | Discover-Aktienindex und Aktienseiten sind deckungsgleich | – |
| DQ-PR-2 | ERROR | jeder ausgelieferte Pfad (Chartreihen, Supertrader-Kartenlinks) existiert | 4 Supertrader-Charts, 11 Kartenlinks |
| DQ-IX-1 | WARN | Indexmitglieder sind aktive, geeignete Titel; nicht zuordenbare Bestände werden genannt | TEL, DD, DOW, MRNA, COHR, P, ECHO INACTIVE; NRG, VLTO, SNDK, Q, BNY fehlen |

## Erster Lauf (03.10.2026, Repository-Stand)

```
PASS   DQ-ID-1 [0/25071]  DQ-ID-2 [0/7803]  DQ-ID-3 [0/7794]
ERROR  DQ-PX-1 [2/6484]   CPTAF, DMN: Kurs 0           → behoben im Publisher, wirksam beim nächsten Refresh
WARN   DQ-PX-2 [60/6484]  {"0":6418,"1":4,"2":2,"3":5,"4":2,"5+":53}
WARN   DQ-PX-3 [203/6484] davon viele Rundungsartefakte unter 1 $ → behoben, wirksam beim nächsten Refresh
PASS   DQ-PX-4 [0/5952]   DQ-PX-5 [0/5982]   DQ-PR-1 [0/5982]
ERROR  DQ-PR-2 [15/7323]  Supertrader-Pfade → behoben im Erzeuger, wirksam beim nächsten supertrader-signals-Lauf
WARN   DQ-IX-1 [7/628]
```

Die ERROR-Befunde sind im Code behoben. Sie verschwinden aus den Daten, sobald die jeweiligen Läufe neu erzeugt haben.
Deshalb prüft `core-ci.yml` auf PRs nur als Bericht und **streng nur im täglichen Lauf gegen `main`**.

## Neue Regel hinzufügen

1. Reine Funktion in `core/data-quality.js` (Eingabe: geladene Artefakte; Ausgabe über `result()`).
2. Laden der Eingaben in `scripts/core/data-quality.mjs`.
3. Test in `core/tests/data-quality.test.mjs`: der Fehler, für den die Regel geschrieben ist, und eine Gegenprobe.
4. Zeile in dieser Tabelle.
