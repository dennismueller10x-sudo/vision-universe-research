# Vision Universe – Abschlussbericht Kursdaten-Audit

Stand: 18. Oktober 2026. Diagnostisch, **nicht zertifizierend**. Dieser Bericht fasst zwei Detailberichte zusammen: den [Root-Cause-Audit](VISION_UNIVERSE_CANONICAL_DATA_ROOT_CAUSE_AUDIT.md) und den [Backtest-Impact-Audit](VISION_UNIVERSE_BACKTEST_IMPACT_AUDIT.md). Alle Zahlen stammen aus Actions-Run 39100831867 (Datenstand `862c4242…`) und sind in [`docs/data-quality/root-cause-audit/`](data-quality/root-cause-audit/) nachvollziehbar.

## Das Wichtigste in fünf Sätzen

1. **Nachweislich falsch sind wenige Aktien.** 17 Wertpapiere enthalten eine Kapitalmaßnahme, die Tiingo nicht meldet und die eine unabhängige Quelle eindeutig belegt.
2. **Diese Fehler verändern die Backtests nicht.** Ihre Korrektur bewegt CAGR und Drawdown aller sechs Methoden um 0,0 Prozentpunkte.
3. **Was die Backtests verändert, sind VU-eigene Rechenfehler.** Gemeint ist das Accounting bei Quarantäne und fehlenden Kursen: Turtle +2,0, Weinstein −0,7 Punkte CAGR.
4. **Keine Methode schlägt SPY.** Das gilt vor und nach allen Korrekturen; die Datenfehler erklären die Unterperformance nicht.
5. **Wir können mit den buchbasierten Strategien beginnen**, sobald die VU-Rechenfehler im Backtest-Runner behoben sind. Weitere Datenforschung ist dafür nicht nötig.

## 1. Welche Aktien sind betroffen?

| Gruppe | Wertpapiere | Was bedeutet das |
|---|---|---|
| **nachweislich fehlerhaft** | **17** (0,19 % von 8.994) | nicht deklarierte Splits, unabhängig belegt (SEC 8-K, FINRA, SEC-Aktienzahl) |
| auffällig, aber nicht entscheidbar | ≤ 287 | Kurssprünge ≥ 10× ohne Split-Faktor; weder als Fehler noch als echte Bewegung belegt |
| in Schutzmaßnahmen (Holds/Quarantänen) | 687 insgesamt (7,6 %) | vorsorglich gesperrte Zeiträume; meist Listing-Lücken |

- **Ursachen der 17:** 16 nicht deklarierte Reverse-Splits und 1 nicht deklarierter Forward-Split. Tiingo meldet keinen Split-Faktor, und VUs Kern lässt den Sprung ungeprüft durch.
- **Zeiträume:** Die Auffälligkeiten liegen vor allem in 2017–2019. 570 von 707 Ereignistagen betreffen Aktien mit einem Kurs unter 1 $.
- **Konkrete Ticker:** Ticker und Fälle stehen nur an den Owner versiegelt in `run-39100831867/sealed/POPULATION-CASES.owner.sealed.json`. Die Daten sind lizenzpflichtig, deshalb gibt es keine öffentliche Liste.

## 2. Top-30-Analyse

**Verursachen höchstens 30 Aktien den Großteil der Verzerrung? Ja, soweit messbar.**
- Die bestätigten Fehler (17 Aktien) erzeugen keine messbare Verzerrung.
- Die einzige größere Datenwirkung, +2,0 Punkte bei Turtle unter lockerer Zählung, hängt an **einem einzigen Trade in einer Aktie**. Bei diesem Ereignis lässt sich ein Split nicht von einer Verwässerung unterscheiden.
- Die Lücke in der externen French-Kalibrierung (0,145 → 0,992) hängt an höchstens 55 Monatswerten von Pennystocks.
- **UNKNOWN:** Ob höchstens 30 Aktien auch den Stress-Effekt tragen (alle ungeklärten Fälle gesperrt, bis zu +0,7 Punkte), ist nicht berechnet. Dafür wäre ein weiterer Lauf nötig, und es wurde auftragsgemäß keiner gestartet.

## 3. Backtest-Auswirkungen

CAGR-Veränderung in Prozentpunkten. Alle Methoden bleiben unter SPY.

| Methode | VU-Rechenfehler behoben (B gegen A) | bestätigte Datenfehler behoben (C2 gegen B) | Drawdown-Änderung durch VU-Fix | Abstand zu SPY |
|---|---|---|---|---|
| Cross-sectional Momentum | +0,2 | 0,0 | 0,0 | 1–5 Punkte darunter |
| 52-Week-High | +0,1 | 0,0 | 0,0 | 1–5 Punkte darunter |
| Low Volatility | +0,1 | 0,0 | 0,0 | mehr als 5 Punkte darunter |
| Turtle | **+2,0** | 0,0 | +1,7 flacher | mehr als 5 Punkte darunter |
| Weinstein | **−0,7** | 0,0 | +2,8 flacher | 1–5 Punkte darunter |
| Kullamägi | 0,0 | 0,0 | 0,0 | mehr als 5 Punkte darunter |

Rangfolge: Nur die VU-Fixes ändern sie. 52-Week-High und Weinstein tauschen die Plätze 2 und 3.

## 4. Ganze Aktien sperren oder nur fehlerhafte Zeiträume?

Diagnostisch verglichen, nichts produktiv deaktiviert.

- **Ganze Aktien entfernen ist die schlechtere Wahl.**
  - Es verwirft 521 vollständige Historien mitsamt ihren gültigen Jahren und bringt Survivorship-Verzerrung.
  - Es verschiebt Ergebnisse stärker als jede Datenkorrektur: Turtle −1,4, Weinstein −0,7 Punkte, und bei Momentum und 52W fallen 342 bzw. 793 Trades weg.
- **Nur die betroffenen Zeiträume sperren ist besser.** Das heißt: gültige Vorgeschichte behalten, ab dem Ereignis sperren oder zurückhalten. Es behält die Daten und verändert die Ergebnisse höchstens geringfügig (≤ 0,7 Punkte).
- Sperren mit späterer Wiederaufnahme ist nicht gemessen; die dafür nötige V3-Regel ist nicht abgenommen.

## 5. Daten-Fingerprints

- **Schlusslauf:** Alle 8 Jobs lasen nachweislich identische Eingaben.
  - Geprüft wurde nicht nur der Fingerabdruck, sondern jede Inhaltsbindung: Hashes aller rund 9.050 Historienobjekte, Quellobjekte, Tiingo-Listing-Tabelle, normalisierte Teile und Eingaben.
- **Vier Datenstände bekannt** (15.10., 17.10., 18.10. 01:53, 18.10. 05:31). Sie unterscheiden sich um je ein Wertpapier. Die Ergebnisse weichen zwischen den letzten beiden Ständen um höchstens 0,1 Punkte ab.
- **Ursache der Änderungen:**
  - Zwischen 15. und 17.10. schrieben VU-Datenläufe neue Provider-Daten in die Ablage.
  - Danach änderte sich nur Tiingos live geladene Ticker-Liste. Im Zeitfenster schrieb kein VU-Lauf in die Ablage.
- **Alte Ergebnisse gelten als nicht reproduziert.** Kein früherer Capture ist aufbewahrt. Welche Kurse sich zwischen den Ständen inhaltlich änderten, ist **UNKNOWN**.

## 6. Klare Ursachen

| Ursache | Nachgewiesen | Was |
|---|---|---|
| **Tiingo-Fehler** | ja | 17 nicht gemeldete Splits; 4 Tage mit widersprüchlichen Kursspalten; Ticker-Liste ändert sich zwischen Abrufen |
| **VU-Fehler** | ja | fehlende Schutzprüfung im Kern (VU-01); Backtest-Accounting A4, A5, A8; Look-ahead in der V4-Prüfung; Rundung im Adapter; Ganzreihen-Verwurf in Quant-Studien |
| **Echte Marktbewegungen** | **UNKNOWN** | ohne zweiten Kursanbieter nicht bestätigbar; 54 Fälle sprechen per SEC-Aktienzahl gegen einen Split |
| **Ungeklärt** | – | 599 von 616 Ereignistagen; 253 von 272 Extremsprüngen; 75 von 83 auffälligen Monatswerten |

## 7. Empfehlung: minimale Korrekturen

Nur drei Korrekturen sind nötig, jeweils als eigener PR mit Vorher/Nachher-Vergleich (CLAUDE.md). Keine davon ist in diesem PR umgesetzt.

| # | Korrektur | Warum | Aufwand |
|---|---|---|---|
| 1 | **VU-Rechenfehler A4/A5/A8 aus `runner-v4` in den Tournament-Runner übernehmen** | die einzige gemessene Verzerrung der Backtests (Turtle +2,0, Weinstein −0,7) | klein; Code existiert schon in runner-v4; braucht keine Daten |
| 2 | **Schutzprüfung VU-01 schließen:** Kurssprünge ≥ 10× ohne Split-Faktor auch bei vorhandener adjClose als *Hold* melden, nicht reparieren | verhindert, dass künftige Tiingo-Auslassungen unbemerkt durchrutschen | klein |
| 3 | **Messungen reproduzierbar machen:** Capture verschlüsselt und versioniert ablegen, Tiingo-Ticker-Liste archivieren, Stichtag festhalten | die heutige Kopie ist live; ohne Snapshot ist kein Ergebnis später nachrechenbar | mittel; Owner-Entscheidung zu Speicherort und Lizenz |

**Nicht nötig:**
- weitere Corporate-Action-Heuristiken
- ein zweiter Kursanbieter
- neue Quarantäne-Regeln
- eine weitere Forschungsrunde zu den 17 Fällen

Die bestätigten Datenfehler haben keine Backtest-Wirkung.

## 8. Können wir mit den buchbasierten Supertrader-Strategien beginnen?

**Ja, nach Korrektur 1.**
- **Messbasis:** Die Strategien sollten auf der korrigierten V4-Infrastruktur (Szenario B) gemessen werden, nicht auf dem alten Runner.
- **Ungeklärte Fälle:** Die 599 ungeklärten Ereignistage werden als Hold- und Sensitivitätsband mitgeführt, nicht als repariert behandelt.
- **Reproduzierbarkeit:** Jede Messung sollte an einen aufbewahrten Datenstand gebunden sein (Korrektur 3). Bis dahin ist die Messung auf dem Live-Stand vertretbar, aber nicht nachrechenbar. Das gehört offen in jedes Ergebnis.

Die Kursdaten sind nicht der Engpass. Die Unterperformance der bisherigen sechs Methoden bleibt nach allen belegten Korrekturen bestehen.

## Grenzen dieses Audits

- Kein zweiter Kursanbieter; echte Bewegungen sind deshalb nicht bestätigbar.
- Bestätigte Zahlen sind Untergrenzen unter den verfügbaren Belegquellen.
- Ältere Datenstände sind nicht aufbewahrt; ihre Ergebnisse gelten nur für ihren Fingerabdruck.
- Absolute Renditen sind nur an den Owner versiegelt; öffentlich sind Differenzen und Richtungen.
- Zwei unabhängige Reviews mit 37 Befunden sind eingearbeitet; kein HIGH ist offen. Ein dritter Durchgang auf dem Schlusslauf fand nicht statt.
