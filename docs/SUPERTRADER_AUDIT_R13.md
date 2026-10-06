# Supertrader – Forensischer Methoden- und Backtest-Audit (Runde 13)

Stand: 03.10.2026. Vorab festgelegt in `scripts/supertrader/validation/PREREGISTRATION-R13-AUDIT.json`, Entscheidungen in `DECISION-R13.json`.
Kennzahlen aus Tiingo-Daten liegen nur in den verschlüsselten Ergebnissen. Öffentlich gilt „In Prüfung“.

**Grundsatz:** Geprüft werden VU-Versionen. Ein negatives Ergebnis betrifft unsere Umsetzung. Es widerlegt weder Darvas, Minervini, Weinstein, Kullamägi oder die Turtles noch ein fremdes Musterdepot. Ein bekanntes Gewinnerbeispiel ersetzt keinen Portfoliotest.

## 1. Fragestellung und Einordnung

Für jeden Befund ist festgehalten, zu welcher der vier Klassen er gehört:

1. Quellenmethode falsch verstanden oder unvollständig übertragen.
2. Fehler in Daten, Universum, Signal, Portfolio, Ausführung oder Renditerechnung.
3. Bewusst abweichende VU-Variante.
4. Korrekt gerechnet, aber ohne Vorteil.

## 2. Reproduktion und Versionslinie

- Die Live-Versionen wurden mit unverändertem Code und unveränderter Listentabelle neu gerechnet.
  - Vier Methoden liefern identische Ergebnisse.
  - Momentum weicht ab, weil die privaten Kursreihen täglich nachgeführt werden: Die Segmentzahl hat sich geändert, nicht der Code.
  - **Korrektur (Klasse 2, Nachvollziehbarkeit):** Jeder Lauf schreibt jetzt einen Datenfingerabdruck.
- **Turtle-Versionslinie:**

  | Version | Inhalt | Status |
  |---|---|---|
  | 2.0.0 | Basis | Ersetzt |
  | 2.0.1 | 2.0.0 + Marktampel (R12) | Zurückgenommen in R13 |
  | 2.0.2 | Regeln wie 2.0.0 | Live |
  | 2.1.0 | Eigene Forschungsvariante aus R11 | Nie live; kein Nachfolger von 2.0.1 |

  Signale, die unter 2.0.0 oder 2.0.1 entstanden sind, werden unter ihrer Version weitergeführt. Ein kompatibel weitergeführtes Signal zählt nicht als neuer Trade.
- **Weinstein:** 3.0.0-Setups laufen unter 4.0.0 weiter. Neu ist nur der Fortsetzungskauf.

## 3. Daten- und Buchungsprüfung

| Prüfpunkt | Ergebnis |
|---|---|
| Kurse in der Tagesspanne, Ausstieg nach Einstieg, Anteile, Delisting-Abschluss nur am letzten Balken | Keine Verletzung an allen Trades der fünf Methoden |
| Überlappende oder doppelte Trades derselben Notierung | Keine |
| Ticker-Wiederverwendung mit überlappender Notierung | Keine |
| Unabhängige zweite Depotbuchung | Stimmt mit dem Portfoliomodul überein |
| Benchmark | SPY-Gesamtrendite (mit Dividenden), eigene Rechnung = Tiingo-adjClose |
| ETF/ETN/Fonds | Im bereinigten Universum ausgeschlossen (seit R10) |
| Look-ahead | Einstieg frühestens am Folgetag; SEC-Daten zum Einreichungsdatum |
| Cash | Kein Hebel; übersprungene Einstiege mit Grund protokolliert |
| **Delisting-Bewertung** | **Bestätigter Fehler, siehe unten** |

**Bestätigter Bewertungsfehler (Klasse 2):** Das bisherige Entscheidungsszenario S1 buchte jede Delistung mit einem Abschlag von 30 %, auch Barübernahmen.

Beweisfälle:
- **SYNT:** letzter Handelstag 10.10.2018, Barangebot von Atos zu 41 USD, letzter Kurs 40,99 USD.
- **SCMP:** letzter Handelstag 13.02.2018, Barangebot von Mallinckrodt zu 18 USD, letzter Kurs 18 USD.

Korrektur:
- Jede delistete Notierung wird anhand der SEC-Einreichungen klassifiziert (Übernahmeformulare im Fenster um den letzten Handelstag).
- Neues Entscheidungsszenario **S1C:** Übernahme zum letzten Kurs, sonst wie bisher mit Abschlag.
- Die Mehrheit der zuordenbaren Delistings sind Übernahmen.
- Alle früheren Urteile wurden mit S1C neu angewendet (Abschnitt 6).

## 4. Zerlegung des Rückstands

- **Momentum (Kullamägi), Minervini, Weinstein:** Der Rückstand zu SPY entsteht fast vollständig durch nicht investiertes Kapital. Das Risiko je Trade geteilt durch den Stopabstand ergibt kleine Positionen, und es gibt wenige gleichzeitige Signale. Auf dem investierten Kapital liegt das Ergebnis etwa auf Marktniveau. → Klasse 3/4
- **Darvas, Turtle:** Der Rückstand entsteht überwiegend auf dem investierten Kapital. Gründe sind enge Stops, häufige Ausstoppungen und Umschlagskosten. Bei Darvas fehlen Plätze (maximale Positionszahl), bei Turtle fehlt Bargeld. → Klasse 4
- **Gegenproben** (nur Diagnose, je eine Ursache):
  - Gleiche Einstiege sechs Monate ohne Stop gehalten: Der Rückstand wird bei Darvas, Turtle und Minervini deutlich kleiner und bei Momentum fast geschlossen.
  - Reine Gleichgewichtung ändert wenig.
  - Daraus folgt keine Live-Regel. Alle Fälle 2016–2026 sind angesehen; eine neue Ausstiegsregel bräuchte eine eigene Präregistrierung und eine Vorwärtsprüfung.

## 5. Quellenkette je Methode (Auszug)

**Darvas / NEO-DARVAS / VU Trendfolge 52W** werden getrennt geführt:

- **VU Darvas 3.0.2 (VU Adaptation):** Box-Ausbruch per Kauforder; die Marktampel (R12, mit S1C bestätigt) stammt aus einer TraderFox-Variante, nicht von Darvas. *Korrektur R14: Einen Gewinnfilter gibt es im Code nicht (frühere Fassung irrtümlich).*
- **TraderFox NEO-DARVAS:**
  - Klasse: mindestens 70 % seit Tief, neues Hoch in 20 Tagen, „weitere Regeln“ nicht öffentlich.
  - Screening vom 24.03.2018: Verkaufstext mehrdeutig.
  - Musterdepot ab April 2018: Regeln im Kundenbereich.
  - „Mit Pivotal-Points“ (Regeln veröffentlicht 13.02.2021): 100 % seit Tief, Kurslücke, Gewichtsregeln.
- **VU Trendfolge 52W 1.0.0:** folgt der Pivotal-Points-Fassung. Die „Trendstabilität“ ist nicht öffentlich und wird durch einen VU-Ersatz abgebildet. Die Regeln des aktuell beworbenen Musterdepots sind nicht öffentlich. **Keine Reproduktion des TraderFox-Backtests behauptet.**
- Die Schwelle „100 % seit Tief“ stammt von TraderFox und ist in Darvas' eigenem Material nicht belegt.

**Minervini 2.0.0:**
- Umgesetzt: Trend Template, VCP (VU-Formalisierung), Pivot. *Korrektur R14: EPS/Umsatz aus SEC nutzt erst Version 3.0.0 (Forschung); live 2.0.0 hat keinen Fundamentalfilter.*
- Fehlend: Verkauf in die Stärke (Hälfte mit Gewinn verkaufen, Stop auf Einstand), Aufstocken.
- Positionsgröße: 1,25 % Risiko und 25 % je Position stammen aus Minervinis eigenen Beiträgen (original); Höchstzahl 10 und die Risikohalbierung nach einer Verlustserie sind VU. *Korrektur Migration Phase 1: früher als „VU-Annahme“ geführt.*
- Version 3.0.0 bleibt Forschung.

**Weinstein 4.0.0:**
- Stufe-2-Ausbruch und Fortsetzungskauf (mindestens 8 Wochen Basis nach einem 52-Wochen-Hoch über der 30-Wochen-Linie, höchstens 25 % tief, Kauf-Stop am Basishoch; VU-Formalisierung einer Checkliste von stageanalysis.net). *Korrektur Migration Phase 1: Es ist kein „Rücksetzer zur Ausbruchszone“.*
- Positionsgröße: eine Fremdregel (Kullamägis Risikozahl 0,5 %, über die Portfolio-Standardwerte geerbt), keine Weinstein-Regel. Sie führt zu niedriger Investitionsquote.

**Momentum/Kullamägi 3.2.0:**
- Umgesetzt: Ausbruch nach Basis, Stop am Tagestief, Teilverkauf nach Kullamägis öffentlicher Beschreibung.
- Folge der engen Stops: Viele spätere Gewinner werden früh verkauft.

**Turtle 2.0.2:**
- Umgesetzt: System 1 (20/10), N-basierte Units.
- Mangel: Pyramidisierung und Bargeld begrenzen die Aufnahme, sehr viele Einstiege werden mangels Bargeld übersprungen.
- Die Marktampel ist kein Turtle-Bestandteil; sie wurde zurückgenommen.

Vollständige Regel-für-Regel-Herkunft (Original / dokumentierte Variante / technische Umsetzung / VU-Annahme / unbelegt) im Produkt unter „Prozesskette“ und in `docs/SUPERTRADER_METHOD_FIDELITY.md`.

## 6. Entscheidungen

| Methode | Entscheidung |
|---|---|
| Weinstein 4.0.0 | Live. R11-Bedingung (b) war unter S1 verfehlt und ist unter S1C erfüllt; (a) war bereits erfüllt. |
| Turtle 2.0.1 (Marktampel) | Zurückgenommen, jetzt 2.0.2. Die R12-Regel ist unter S1C im ersten Teilzeitraum verfehlt. |
| Darvas 3.0.2 (Marktampel) | Bleibt live; auch unter S1C bestätigt. |
| Marktampel für Momentum, Weinstein, Minervini | Bleibt aus. |
| VU Trendfolge 52W | Bleibt Live-Modell zur Vorwärtsbeobachtung. Unter S1C ist der Abstand kleiner als zuvor berichtet, R1–R4 sind weiter nicht erfüllt. |
| Minervini 3.0.0, Turtle 2.1.0 | Bleiben Forschung. |

**Für keine Methode ist ein historischer Vorteil gegenüber SPY belegt.**

## 7. Überholte Aussagen aus R8–R12

- Alle Urteile, die auf S1 beruhen, haben Barübernahmen als Verlust gebucht. Sie sind mit S1C neu berichtet.
- Überholt sind R11 „Weinstein 4.0.0 verfehlt“ und R12 „Turtle-Marktampel bestanden“.
- Der Abstand von VU Trendfolge 52W zum Markt war in R12 überzeichnet.
- Exakte Momentum-Zahlen aus R12 sind wegen nachgeführter Kursreihen nicht bitgenau reproduzierbar. Seit R13 trägt jeder Lauf einen Datenfingerabdruck.

## 8. Nicht entscheidbar ohne externe Information

- Detailregeln und Trendstabilität des aktuellen TraderFox-Musterdepots (Kundenbereich).
- Minervinis nicht öffentliche Ermessensregeln (Aufstocken, Teilverkauf im Einzelfall).
- Kullamägis diskretionäre Auswahl.
- Point-in-Time-Marktkapitalisierung: Das Universum „größte Unternehmen“ wird über den Umsatz ersetzt.
