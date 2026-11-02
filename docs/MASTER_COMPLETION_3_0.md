# Master Product Completion 3.0 – gemeinsame Completion-Matrix (Technical, Quant, Supertrader)

Stand 02.11.2026 · Basis `main` @ `122f5d9`. Auftrag „VISION UNIVERSE – MASTER PRODUCT COMPLETION 3.0“ (Owner).

Dieses Dokument ist der Wiederaufnahmepunkt über alle drei Produktwelten. Die Einzelheiten stehen in den Übergaben der jeweiligen Welt. Jede Welt hat einen eigenen PR, weil die Isolations-Gates (CLAUDE.md) eine Querschnittsänderung verbieten.

| Welt | PR (Draft) | Branch | Übergabe |
|---|---|---|---|
| Technical | #1245 | `claude/technical-assistant-t1-t3` | [technical/TECHNICAL_ASSISTANT.md](technical/TECHNICAL_ASSISTANT.md) |
| Quant | #1246 | `claude/quant-backtest-coverage-q1-q2` | [quant/BACKTEST_COVERAGE_MATRIX.md](quant/BACKTEST_COVERAGE_MATRIX.md) (im PR) |
| Supertrader | #1247 | `claude/supertrader-13-methods-evidence` | [SUPERTRADER_13_METHODS_EVIDENCE.md](SUPERTRADER_13_METHODS_EVIDENCE.md) (im PR) |

Keiner der drei PRs ist gemergt. Merges brauchen die Owner-Freigabe.

## 1. Statusdimensionen

Die Dimensionen werden getrennt bewertet; eine implementierte Funktion ist nicht automatisch zertifiziert.

| Kürzel | Bedeutung |
|---|---|
| IMPL | implementiert (Code auf einem Branch oder auf `main`) |
| GET | getestet (automatischer Test im Repository) |
| VAL | fachlich validiert (unabhängige Gegenrechnung oder Regeltreue-Nachweis) |
| ZERT | zertifiziert (bestehende Zertifizierungsgates erfüllt) |
| REIF | produktreif (öffentlich nutzbar, Owner-Freigabe) |
| DEAKT | implementiert, absichtlich ausgeschaltet |
| BLOCK | wartet auf Daten, Zeit oder eine Owner-Entscheidung |
| ZURÜCK | vom Owner zurückgestellt |

Zeichen: ✔ ja · ◐ teilweise · ✘ nein · – nicht zutreffend.

## 2. Matrix

### Technical

| Funktion | IMPL | GET | VAL | ZERT | REIF | DEAKT | BLOCK | ZURÜCK | Nachweis | Einschränkung |
|---|---|---|---|---|---|---|---|---|---|---|
| Analyse-Assistent, 8 Ziele (T1/T2) | ✔ | ✔ | ✔ | – | ◐ | ✘ | ✘ | ✘ | #1245; Test: Screener-Treffer = „Erfüllt“ für jedes Ziel; Browser-QA 66/66 | Produktsprache durch den Owner lesen (L4); Merge offen |
| Vier Ebenen, Vorteil „nicht nachgewiesen“ | ✔ | ✔ | ✔ | – | ◐ | ✘ | ✘ | ✘ | Evidenz-Verweise gegen `signal-evidence.json`, `formation-evidence.json`, S4 | keine neuen historischen Zahlen |
| 13 Vorlagen mit Checkliste | ✔ | ✔ | ✔ | – | ✔ | ✘ | ✘ | ✘ | main (#1139, #1151) | – |
| S4 historische Tests der Vorlagen | ✔ | ✔ | ◐ | ✘ | ✘ | ✔ | ◐ | ✘ | S4_TEMPLATE_STUDY.md, `RESEARCH_LIMITED` | Formations-, Ausbruchs- und ADX-Vorlagen brauchen Tages-OHLC-Historie; Produktaussage braucht Freigabe |
| Nachtlauf und GIBO-Bereinigung | ✔ | ✔ | ✔ | – | ✔ | ✘ | ✘ | ✘ | `c307119` (01.11.), GIBO ohne Kennzeichnung, DQ-TW-1..8 PASS | – |
| KI-Suche | ✔ | ✔ | ◐ | – | ✘ | ✔ | ✔ | ✘ | AI_SEARCH_EVAL.md | Anbieter, Kosten, Datenschutz (Owner) |
| Lange Wochen-OHLC (5J/Max) | ✘ | – | – | – | ✘ | – | ✔ | ✔ | WEEKLY_FORMATIONS.md §4 | Lizenzentscheidung |

### Quant (Backtesting)

| Art | IMPL | GET | VAL | ZERT | REIF | DEAKT | BLOCK | Hauptblocker (Lösungsweg) |
|---|---|---|---|---|---|---|---|---|
| SAME_STOCK_REPLAY | ✔ | ✔ | ✔ | ✘ LIMITED | ✘ | ✔ | ✔ | Survivorship, beschreibend statt Regeltest (Owner, FV-7) |
| PATTERN_EVIDENCE | ✔ | ✔ | ✔ | ✘ LIMITED | ✘ | ✔ | ✔ | `returnBasis` technisch lösbar (P4.1); Survivorship (Owner) |
| SIGNAL_BACKTEST | ✔ | ✔ | ✔ | ✘ LIMITED | ✘ | ✔ | ✔ | Survivorship erst ab 2016 (Daten); 0/5 Regeln zertifiziert (Befund) |
| SETUP_BACKTEST | ✔ | ✔ | ✔ | ✘ COLLECTING_HISTORY | ✘ | ✔ | ✔ | Historie (Zeit), OOS A1–A6 (Owner); frühestens 2028-04 |
| STRATEGY_BACKTEST | ✔ | ✔ | ✔ | ✘ COLLECTING_HISTORY | ✘ | ✔ | ✔ | Mitgliedschafts- und Faktorhistorie 2/24 Monate (Zeit); frühestens 2028-08 |
| FACTOR_RANKING_BACKTEST | ✔ | ✔ | ✔ | ✘ COLLECTING_HISTORY | ✘ | ✔ | ✔ | Faktorhistorie 2/24, Forward 0/12 (Zeit); frühestens 2028-08 |

| Funktion | Stand | Nachweis |
|---|---|---|
| Coverage-Matrix (6 Arten × 7 Methoden, 21 Auswahlen) | IMPL, GET | #1246; 31/42 Kombinationen zugelassen, 16 davon nie vorgerechnet |
| `run-backtest --help`, Prüfung der Ausgabe gegen den Vertrag (P0.5) | IMPL, GET | #1246 |
| Kennzahlen-Hash ohne Laufzeitbezug (P0.7) | IMPL, GET, VAL | #1246: zwei Node-Binäre, gleicher Kennzahlen-Hash; 16/16 Katalogfälle gleich dem CI-Bau |
| PIT-Snapshot-Integrität und Gate-Prognose (P2.1/P2.2) | IMPL, GET | #1246: kein Integritätsfehler, kein fehlender Monat |
| Gegenrechnung Katalog | VAL | 16 öffentliche Fälle neu gerechnet, Python 16.451/0; 5 private Fälle brauchen das Archiv (FV-4) |
| Interne Backtest-Vorschau | IMPL, GET, DEAKT | #1227/#1242 (Owner) |
| Öffentliche Backtest-Darstellung | BLOCK | Praxistest, Freigabe, UI-Revision (H4) |

### Supertrader

Für alle 13 Methoden gilt: IMPL ✔, GET ✔, ZERT ✘, REIF ✘. Die Kandidatenanzeige läuft produktiv; CC-5 (Corporate-Action-Quelle) und CC-8 (Paper 2027) sind bei allen blockiert. Quelle: `SUPERTRADER_13_METHODS_EVIDENCE.md` (#1247).

| | Methode | Zustand | VAL (Regeltreue) | Kausalität getestet | Hauptblocker (Owner) |
|---|---|---|---|---|---|
| C01 | Turtle S1 | RCWE | ◐ TOP5 14/14 | ✔ | zwei mehrdeutige Lesarten |
| C02 | Turtle S2 | RCWE | ◐ TOP5 17/17 | ✔ | keine PIT-Korrelationsgruppen (CC-4) |
| C03 | Darvas | RCWE | ◐ TOP5 16/16 | ✔ (#1247) | Beginn der Bodensuche (Lesart) |
| C04 | Weinstein Investor | RCWE | ◐ | ✔ (#1247) | 14 Ermessensfragen (CC-3) |
| C05 | Weinstein Trader | RCWE | ◐ | ✔ (#1247) | Ermessensfragen (CC-3) |
| C06 | Minervini SEPA | RCWE | ◐ | ✔ (#1247) | nur Übersetzung der Quelle (CC-1) |
| C07 | Minervini Power Play | RCWE | ◐ | ✔ (#1247) | nur Übersetzung der Quelle (CC-1) |
| C08 | Kullamägi Breakout | RCWE | ◐ TOP5 15/15 | ✔ (#1247) | Setup-Proxy (CC-3) |
| C09 | Kullamägi Episodic Pivot | VALIDATION_BLOCKED | ✘ | ✘ (Entscheidung auf IEX-Minuten) | konsolidierte SIP-Minuten (Lizenz) |
| C10 | Kullamägi Parabolic Short | VALIDATION_BLOCKED | ✘ | ✘ | keine Borrow-Historie |
| C11 | Pocket Pivot | SOURCE_BLOCKED | ✘ | ✔ (#1247) | Stopregel fehlt in der Quelle |
| C12 | Buyable Gap-Up | RCWE | ◐ TOP5 14/14 | ✔ (#1247) | Volumenfenster als Konvention (CC-1) |
| C13 | Holy Grail | SOURCE_BLOCKED | ✘ | ✔ (#1247) | Primärquelle für Einstieg, Stop und Trailing |

Produktreife des Kandidatenlaufs:
- V1: S1 3/5, S5 1/2, S6 und S7 nicht erfüllt.
- `SF8_AUTO_PUBLISH` ist nicht gesetzt.
- Der Sprachtest über alle Supertrader-Produkttexte ist ohne Befund.

## 3. Owner-Entscheidungen, nach Dringlichkeit

| # | Entscheidung | Frist | Vorlage |
|---|---|---|---|
| 1 | **Security Master 1.3.0 produktiv** (Quant H1). Ohne ihn bricht der Supertrader-Kandidatenlauf ab dem 11.11. mit Exit 3 ab. | **Laufdatum 10.11.2026** | #1240 |
| 2 | Merge der drei Draft-PRs dieses Auftrags | – | #1245, #1246, #1247 |
| 3 | Setup-OOS A1–A6 (FV-6) und Lesart des Gates `independence`: Monate oder Wochen (FV-1) | vor etwa 2027-03-26 | BACKTEST_COVERAGE_MATRIX.md §H |
| 4 | Supertrader: Lesarten und Proxys (PS-C01, PS-C03, PS-C08, PS-C12, PS-C02-CC4), lizenzierte CA-Quelle (CC-5), Paper 2027 aktivieren | vor dem 01.01.2027 (Paper) | SUPERTRADER_13_METHODS_EVIDENCE.md §5 |
| 5 | #1233 und #1234 nachziehen und reviewen, danach die V13-Studie mit Secrets; #1235 Konflikt und `token` → `sourcePhrase` | – | Evidenzdokument, S1-Tabelle |
| 6 | Quant FV-2 bis FV-5, FV-7, FV-8 (Runner-Feld, CI mit zwei Node-Versionen, private Gegenrechnung, Sensitivitäten in Gates, Replay/Pattern als Beschreibung, Snapshot-Alarm) | – | BACKTEST_COVERAGE_MATRIX.md §H |
| 7 | Interne Backtest-Vorschau und Praxistest (H2) | – | #1242, #1227 |
| 8 | Technical: Produktsprache des Assistenten (L4), KI-Suche, Wochen-OHLC-Lizenz | – | TECHNICAL_ASSISTANT.md, TECHNICAL_COMPLETION_2_0.md §G |

## 4. Wiederaufnahmepunkt

1. CI und Reviews der Draft-PRs #1245–#1247 prüfen.
2. Nach dem Security Master 1.3.0 (#1 oben): Quant H6/H7 und den Supertrader-Nachweis S6.
3. Ohne Owner-Freigabe bleiben als autonome Pakete:
   - Quant P4.1, Pattern auf Gesamtrendite als Research, technisch lösbar laut Matrix;
   - Supertrader-Nachweise S1 und S5 mit den nächsten echten Lauf-IDs.
