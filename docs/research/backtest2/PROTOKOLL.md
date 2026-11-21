# Backtest 2.0 – Protokoll (Entwurf, 21.11.2026)

**Forschung, nicht zertifiziert.** Status: **ENTWURF**. Das Protokoll wird vor dem ersten Lauf eingefroren (SHA-256 im Lauf-Manifest und
hier eingetragen). Danach ändern sich Regeln, Rahmen und Auswahl nicht mehr; jede spätere Änderung ist eine neue, als nachträglich
gekennzeichnete Variante. Anlass: [BEFUND-POSITIONSGROESSE.md](BEFUND-POSITIONSGROESSE.md).

## 1. Frage

Hätte eine feste, vorab beschriebene Regel aus Supertrader oder Quant in der Vergangenheit nach Kosten mehr erzielt als ein
gewöhnlicher Index-ETF, insgesamt oder in bestimmten Marktphasen, und zu welchem Risiko?

Die Antwort ist offen. Gesucht wird keine Variante, die gewinnt, sondern das ehrliche Ergebnis jeder Regel. Alle Ergebnisse werden
berichtet, auch die schlechten.

## 2. Gemeinsamer Depotrahmen (für jede Methode gleich)

Der Rahmen ersetzt die bisherige je Methode verschiedene Kapitalbehandlung. Er ist eine Konvention, keine Quellenregel; die
Einstiegs- und Ausstiegsregeln der Methoden bleiben unverändert (Fachmodelle werden nicht geändert).

| Baustein | Festlegung |
|---|---|
| Startkapital | 100.000 $, kein Hebel, keine Leerverkäufe (C10 entfällt), Cash unverzinst |
| Positionen | höchstens 10 gleichzeitig |
| Größe | Risiko 1 % des Depots bis zur Stopp-Marke der Methode, **höchstens 10 % des Depots je Titel**; ohne Stopp-Marke 10 % |
| Nachkauf (Pyramide) | nur wenn die Quelle ihn vorsieht, innerhalb der 10-%-Kappe |
| Auswahl bei mehr Kandidaten als freien Plätzen | relative Stärke 6 Monate (126 Sitzungen) zum Vortag, absteigend; Gleichstand nach securityId |
| Universum | zum Vortag: Rohkurs ≥ 10 $ **und** Rang ≤ 1.000 nach Ø Dollarumsatz 20 Sitzungen unter allen US-Stammaktien des Snapshots |
| Marktfilter | nur wo die Quelle ihn verlangt (O'Neil/Minervini: Marktrichtung, Weinstein: Stufe des Gesamtmarkts); sonst keiner. Zusätzlich je Methode die Variante F1 aus E3 (SPY über SMA200, sonst keine neuen Einstiege) |
| Kosten | wie E3: 1 bp Gebühr + 5 bp Slippage + halber Spread nach ADV20 je Seite (`quant/engines/portfolio-construction.cjs#halfSpreadBps`) |
| Delistings | Endwerte wie E3: Übernahme 100 %, unbekannt 70 %, Insolvenz 0 % |
| Tagesbalken-Mehrdeutigkeit | beide Lesarten (pessimistisch und optimistisch) werden gerechnet und als Spanne berichtet; Urteil nur, wenn beide gleich ausfallen |

## 3. Kandidaten

- Supertrader: alle auf Tagesbalken rechenbaren Methoden aus C01–C13 (`docs/SUPERTRADER_9_HANDOVER.md` §4), je einzeln, ohne Auswahl
  nach Ergebnis. C09/C10 entfallen (Minutendaten erst ab 2017 bzw. Leerverkauf). Methoden mit Status `SOURCE_BLOCKED` laufen mit der
  dokumentierten Lesart und tragen den Vermerk.
- Quant: die sechs Profile aus E3 mit N = 10 und 20, Umschichtung 13 und 26 Wochen (wie E3), im selben Rahmen (Kappe 10 %).
- Referenz „Marktführer halten“: Kauf der 10 Titel mit der höchsten relativen Stärke 6 Monate über der 200-Tage-Linie, Ausstieg bei
  Schluss unter der 200-Tage-Linie oder Verlust von 25 % ab Hoch seit Kauf. Sie beantwortet die Frage, ob eine einfache Regel die
  großen Gewinner (zum Beispiel Nvidia 2023) erkannt und gehalten hätte.

## 4. Zeiträume und Vergleich

- Gesamt 2008-01-01 bis zum letzten vollständigen Monat vor dem Einfrieren; Teilzeiträume 2008–2015 und 2016–Ende getrennt berichtet.
- Ehrlicher Vermerk: 2008–2015 wurde im Holdout vom 06.11.2026 bereits geöffnet, 2016–2026 in E3 und im Labor. Es gibt **keinen
  unberührten Zeitraum** mehr; die Unabhängigkeit kommt allein aus dem vorab eingefrorenen Rahmen, der für alle Methoden gleich ist.
- Marktphasen: SPY über bzw. unter seiner 200-Tage-Linie; je Phase Rendite von Methode und Benchmark.
- Vergleich (Gesamtrendite, gleiche Stichtage): SPY, QQQ, RSP (`vorsorge/data/series/*.json`).
- Kennzahlen: CAGR, Volatilität, Sharpe (rf = 0), maximaler Verlust, Trefferquote, Ø Haltedauer, Umschlag, Kosten, Anteil der
  Rendite aus den 5 besten Titeln.

## 5. Urteil

Je Methode genau eines, nach Holm-Korrektur über alle Kandidaten und beide Lesarten (Monte-Carlo-p wie E3, 9.999 Replikate):

- **schlägt SPY** (Gesamtzeitraum, beide Teilzeiträume nicht negativ gegenüber SPY, Holm-p ≤ 0,05);
- **schlägt SPY nur in Phasen** (in einer Marktphase Holm-p ≤ 0,05, im Gesamtzeitraum nicht);
- **nur risikobereinigt** (Sharpe höher und maximaler Verlust kleiner als SPY, Rendite nicht);
- **schlägt nicht**; **nicht bestimmbar** (Lesarten widersprechen sich oder Daten fehlen).

## 6. Ausführung und Veröffentlichung

- Läufe über GitHub Actions auf dem eingefrorenen Snapshot (R2), Ergebnisse zuerst versiegelt an den Owner wie E3 und Holdout.
- Öffentliche Renditezahlen nur nach Owner-Freigabe (CLAUDE.md, „öffentliche Aussagen über Rendite“) und Abstimmung mit der
  Rechtsberatung; Rechte an abgeleiteten Kennzahlen (Tiingo) vorher klären.
- Vor dem ersten Lauf: Gegentest des Rahmens auf künstlichen Kursen (`scripts/research/backtest2/sizing-check.mjs` erweitert um
  den Rahmen): 10 Positionen, Kappe 10 %, Abgleich bestanden.
