# Supertrader – Turtle System 1 / System 2, quellentreu (C01 / C02)

Stand: 19. Oktober 2026. Research-Code, keine Live-Signale. Gestapelt auf SF-1 (#784).

Code: `scripts/supertrader/source-faithful/methods/turtle.mjs`. Vertrag: `contracts/turtle.mjs`. Runner: `runner/run-research.mjs`. Tests: `tests/sf-turtle.test.mjs` (26), `tests/sf-runner.test.mjs` (5).

## 1. Drei Ebenen, nicht vermischt

| Ebene | Inhalt | Status |
|---|---|---|
| Original (Futures) | W-TUR: Long und Short, Kontraktmonate, Rolls, Korrelationsgruppen 6/10 | Replikation `DATA_BLOCKED` (keine Futures-Ketten, kein Borrow) |
| Mechanische Regeln | N, Unit, Entries, S1-Filter, Failsafe, Adds, Stops je Unit, Exits, Rang, Limits 4/12 | exakt bzw. deklariert abgeleitet umgesetzt |
| Equity-Adaption | US-Aktien, nur Long, 1 $ je Punkt, ganze Aktien, Cash-Konto, Research-Universum | deklarierte Übersetzung, **nicht** identisch mit dem Futures-System |

Abgeleiteter Status beider Systeme: `PARTIAL_DATA_BLOCKED`. Die wesentlichen Regeln TUR-LIMIT6/10 (Korrelationsgruppen) und die Short-Seite fehlen mangels Daten. Ausführung: `RESEARCH_EXECUTABLE`, Backtest: `DIAGNOSTIC_READY`.

## 2. Umgesetzte Regeln (#709 W-TUR)

- **TUR-TR / TUR-N.** N = (19·N₋₁ + TR)/20, Start mit dem 20-Tage-Mittel.
- **TUR-UNIT.** Unit = ⌊1 % · Notional / (N · 1 $)⌋ ganze Aktien (Golden Case TUR-HO2002: 16 Kontrakte).
- **TUR-NOTIONAL / TUR-DRAWDOWN.** Je 10 % Verlust wird das Notional um 20 % gekürzt; die Kürzungen verketten sich und gelten bis zum Jahresstart.
- **Entries.**
  - System 1: 20-Tage-Hoch + 1 Tick, intraday; bei einer Eröffnungslücke zur Eröffnung.
  - System 2: 55-Tage-Hoch + 1 Tick.
  - Füllung zu max(Eröffnung, Trigger).
- **S1-Filter.** Hypothetische 20-Tage-Ausbrüche in beide Richtungen, genommen oder nicht (TUR-S1DIR). Ein Signal wird nur übersprungen, wenn der letzte Ausbruch profitabel war; dann gilt der 55-Tage-Failsafe. System 2 hat keinen Filter.
- **TUR-ADD.** Weitere Units je ½ N über dem letzten tatsächlichen Fill, mehrere am selben Tag, höchstens 4 je Titel und 12 long.
- **Stops je Unit (TUR-STOP, TUR-STOPADD).**
  - Jede Unit startet 2N unter ihrem eigenen Fill.
  - Jeder Add hebt die Stops aller früheren Units um ½ N.
  - Jede Unit wird einzeln ausgestoppt.
  - Golden Case TUR-CRUDE: normal 27,70 ×4; nach einer Lücke 27,70 / 27,70 / 27,70 / 28,40.
- **Exits.** 10-Tage-Tief (S1) bzw. 20-Tage-Tief (S2) − 1 Tick schließt alle Units.
- **TUR-RANK.** Gleichzeitige Signale: stärkste zuerst, (Schluss − Schluss vor 63 Sitzungen)/N.
- **TUR-CONSISTENT.** Jedes Signal; kein Regime-, Fundamental- oder Cooldown-Filter.

## 3. Behobene Abweichungen

| Befund | Vorher | Jetzt |
|---|---|---|
| #712 V41-F1 (MAJOR) | eingefrorene V4-Engine: alle Units 2N unter dem neuesten Fill | Stops je Unit gemäß TUR-STOPADD; Lücke ergibt unterschiedliche Stops (Test GC-TUR-CRUDE-GAP) |
| #709 VU-TUR | VU DONCHIAN_TURTLE 2.x: eine Unit, kein Add, kein S2, Short-Ausbrüche nicht im Filter | 4 Units, eigenes S2, Short-Ausbrüche zählen im S1-Filter |
| S1-Filter-Lesart (#705) | ein 10-Tage-Exit mit Verlust ohne 2N-Bewegung führte zum Überspringen | TUR-S1SKIP überspringt nur nach einem profitablen Ausbruch; ein unprofitabler Exit lässt das nächste Signal zu (Test GC-TUR-S1-TAKE-AFTER-UNPROFITABLE-EXIT) |

Die bestehenden VU-Pfade (`engine/strategies/donchian*.mjs`, Live-Signale) sind unverändert.

## 4. Deklarierte Ableitungen und Konventionen

- **Failsafe-Exit (SOURCE_AMBIGUOUS).** Die Quelle nennt keinen Exit. Umgesetzt ist der 10-Tage-Exit; jeder Trade trägt den Pfad `FAILSAFE_55`.
- **Offener hypothetischer Ausbruch.** Gilt als nicht verlierend und führt zum Überspringen (Quelle schweigt).
- **N für Add-Abstand und Stops** ist das N des Ersteinstiegs; die Druckbeispiele halten N konstant.
- **Tagesbalken.**
  - Bei einer gehaltenen Position wird das eröffnungsnähere Niveau zuerst erreicht.
  - Am Tag eines Unit-Stops gibt es keinen Add.
  - Nach Adds oder einem Einstieg wird ein Tief am (angehobenen) Stop pessimistisch danach angenommen.
  - Alle Fälle werden gezählt.
- **Universum.** Das vorab registrierte Research-Universum aus #705 gilt identisch für alle Methoden: Rohschluss ≥ 5 und 20-Tage-Dollarvolumen ≥ 1 Mio. am Vortag. Das ist keine Turtle-Zahl.
- **Abrechnung research-v1.**
  - Orders nur auf realen Balken.
  - Stale-Grenze 5 Sitzungen, dann Abrechnung zum letzten gültigen Schluss.
  - Wirtschaftliches Delisting nach Szenario (S0/S1/S2), Datenlücken nur über die Stale-Grenze.
  - Kosten 10 bp Slippage und 1 bp Kommission je Seite.
  - Ledger-Replay muss die Kasse exakt treffen.

## 5. Diagnostischer Runner

`run-research.mjs --snapshot sts1-… --accounting research-v1` bricht vor jeder Rechnung ab, wenn eine dieser Bedingungen gilt:
- keine `research-v1`-Abrechnung;
- kein oder ein ungültiger Snapshot;
- kein unabhängiger RESTORE-Beleg;
- Hash- oder Fingerprint-Abweichung;
- eine Methode ist nicht `DIAGNOSTIC_READY`.

Szenarien: BASE_S0, DELIST_S1_MINUS_30, DELIST_S2_DISTRESS_ZERO, COST2_S1 und DATA_EVENT_MINUS_30.

Kennzahlen: CAGR, MaxDD, Volatilität, Sharpe, Sortino, Win Rate, Profit Factor, Exposure, Turnover, Trades, Median-Haltedauer, Kostenbelastung, SPY-Abstand, Jahres- und Periodenwerte. Alle sind `DIAGNOSTIC_NOT_CERTIFIED`.

Ausgabe: verschlüsselt für den Owner; öffentlich nur Hashes und Zählungen. Workflow: `[supertrader-validation:sf-research]` zusammen mit `[supertrader-validation-snapshot:sts1-…]` und `[supertrader-validation-accounting:research-v1]`. Ohne beide Marken bricht der Lauf ab.

## 6. Grenzen

- Nur Long; Net-Long-Beta statt des Futures-Risikoprofils.
- Korrelationsgrenzen fehlen.
- Im Cash-Konto passen bei 1 %/N-Units oft nur wenige Units (`rejectNoCash` wird gezählt).
- V4-D1 (offene Reverse-Split-Signaturen im kanonischen Kern) gilt für jede historische Messung; Ergebnisse bleiben diagnostisch.
