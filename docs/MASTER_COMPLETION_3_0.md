# Master Product Completion 3.0–3.2 – gemeinsame Completion-Matrix (Technical, Quant, Supertrader)

Stand 02.11.2026, 15 Uhr UTC (Auftrag 3.2, kontrollierte Integration). Basis `main` @ `558b574`. Merge-Stand in §0 nachgezogen am 02.11.2026 abends (Bündel A nach Owner-Freigabe vom 02.11.2026).

Dieses Dokument ist der Wiederaufnahmepunkt über alle drei Produktwelten. Die Einzelheiten stehen in den verlinkten Übergaben. Jede Welt hat eigene PRs, weil die Isolations-Gates (CLAUDE.md) eine Querschnittsänderung verbieten.

## 0. Merge-Liste

**Merge-Stand (nachgezogen 02.11.2026 abends).** Owner-Freigabe vom 02.11.2026: Bündel A in Abhängigkeitsreihenfolge, #1236 und #1251; ausdrücklich nicht freigegeben: #1252, #1259, #1262. Jeder PR wurde vor dem Merge mit `main` zusammengeführt (Merge-Commit, kein Rebase) und erst nach grüner CI auf diesem Stand gemergt. Vercel-Vorschau meldet durchgehend „Deployment rate limited“ (extern, kein Befund).

| PR | Merge-Commit auf `main` | Anmerkung |
|---|---|---|
| #1260 | `95a6bb8` | – |
| #1236 | `0a416dc` | Quant Browser QA `experience` danach grün |
| #1240 | `e81368c` | Lauftag 1.3.0 weiter offen (E1, §2) |
| #1246 | `0516fcb` | – |
| #1254 | `33c7278` | Erzeuger-Ausgabe `backtest-certification` ohne `generatedAt`/`asOf` vorher/nachher identisch |
| #1245 | `3fd7446` | – |
| #1251 | `741c691` | Basis auf `main` umgestellt; 21 Listen: Treffer, Zählungen und `index-v1.json` unverändert |
| #1233 | `e79e359` | – |
| #1234 | `7caac1f` | – |
| #1235 | `ce8ffbe` | – |
| #1257 | `42c44a9` | ALL13-Plan 1.0.2 auf den neuen TOP5-Pin (1.1.2) nachgezogen, Pins neu gesetzt |
| #1247 | `96b35c5` | Evidenzdokument mit dem Erzeuger neu erzeugt: BELEGT 23, TEILWEISE 58, OFFEN 0, BLOCKIERT 49 |
| #1248 | dieses Dokument | – |
| #1252 | – | am 02.11. geschlossen, nicht gemergt |
| #1259, #1262 | – | offen, nicht freigegeben |

Die Tabelle unten ist der Planungsstand vor dem Merge (Stand 15 Uhr UTC).

Probe-Merge 02.11. 15 Uhr UTC: alle damals 12 PRs (#1257, #1259, #1260 kamen danach hinzu und berühren getrennte Pfade) gegen `main` und paarweise untereinander **konfliktfrei** (`git merge-tree`). Die neuen Commits auf `main` (Logos, Konten, Reels, Intraday) berühren weder Security Master noch Eingangsprüfung.

| # | PR | Inhalt | CI | Voraussetzung / Entscheidung | Nach dem Merge |
|---|---|---|---|---|---|
| 0 | **#1240** | Security Master 1.3.0: Freigabepaket, Prüfhilfe `security-master-switch-preflight.mjs`, Testkorrektur `v10-population` | grün | **E1** (zeitkritisch, §2) | Lauftag nach §2 |
| 1 | #1245 | Technical-Assistent mit Abnahmevorlage | grün | **E3** (T-1 Texte) | – |
| 1a | #1251 | T-2: Titel mit Kurssprung-Kennzeichnung nachrangig (Basis #1245) | – (gestapelt) | **E4** | Basis auf `main` umstellen |
| 2 | #1246 | Quant: Coverage-Matrix, P0.5/P0.7/P2.1/P2.2, P2-Defizite, Research P3.1/P4.1 | grün | **E5** (nur Werkzeuge und Research, keine Gates) | – |
| 2a | #1254 | Quant FV-1: Schwelle heißt `eventCalendarMonths`, Monatssemantik unverändert, Gate-Ergebnis identisch | grün außer `experience` (Quant Browser QA)* | **E6** | Materialisierung rechnet Evidenz neu, Ergebnis gleich |
| 3 | #1233 | Supertrader: Turtle-Einheitsstopps | grün | **E7** | – |
| 3 | #1234 | Supertrader: V13-Delisting-Studie (Workflow) | grün | **E7**; der echte Lauf braucht Secrets (E12) | – |
| 4 | #1235 | Supertrader: ALL13-Zertifizierungsvorbereitung (Plan 1.0.1, neue Pins) | grün | **E7** | – |
| 5 | #1247 | Supertrader: Evidenzmatrix 1.2.0 mit 10 Freigabepaketen | grün | **E7** | **Pflicht nach #1233/#1234/#1235:** `node scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs --out docs/SUPERTRADER_13_METHODS_EVIDENCE.md` und `node --test scripts/supertrader/tests/sf-mc3-evidence-matrix.test.mjs`. Erwartet: BELEGT 23, TEILWEISE 58, OFFEN 0, BLOCKIERT 49 (Probe-Merge geprüft) |
| 6 | #1248 | dieses Dokument | – | E8 | nachziehen |
| – | #1252 | Strategie-Akademie A0 (nur Doku) | – | E9 (A-1..A-4) | unabhängig |
| 2b | #1259 | Quant: Musterstudie optional auf Gesamtrendite (`--return-basis total`), Standard bytegleich; Freigabevorlage FV-5 Schritt 2 | grün | **E15** | Aktivierung: Prüflauf → Fachmodell-PR → Gate-Umverdrahtung (FV-5) |
| 3a | #1257 | Supertrader: X-LEDGER und C12-LEDGER geschlossen (8 Quellen im Ledger), Ableitungstexte F-TUR/F-KK/F-DAR im Vertrag; Code-Fingerabdrücke und Ergebnisse unverändert, Vertragspins neu | grün bis auf `ask-ci` (behoben in #1260) | **E16** | danach Evidenzdokument neu erzeugen |
| 5a | #1262 | Supertrader C09 (Fachmodell): Zuteilung nach Füllminute (F-MC3M-01, Blick in die Zukunft bei knapper Kapazität) und Eröffnung als einzige Pflichtquelle (F-MC3M-02). Golden Cases 120/120, 282/282 andere Ausgaben bytegleich | rot an 5 Pin-Tests (gepinnte Studienläufe, ST9-Registrierung), gewollt nicht nachgezogen | **E18** | Cache-Reruns mit Secrets, dann Pins, ST9 neue Registrierungsversion |
| – | #1260 | Ask: Chartbild-Test unabhängig vom Datum (war ab November rot) | – | E17 | – |

\* `experience` ist auf jedem PR ohne #1236 rot (NVDA-Setup-Karte, richtungsabhängige Prüfung). Das ist kein Befund dieses PRs. #1236 (NVDA-Browser-QA, versionierte UI-Sperre) wartet seit 01.11. auf die Owner-Freigabe (**E10**).

Reihenfolge: zuerst #1240 (Frist), dann die Welten unabhängig voneinander. Innerhalb Supertrader: #1233 → #1234 → #1235 → #1247 → Neuerzeugung des Evidenzdokuments (eigener kleiner PR, Erzeuger-Ausgabe).

## 1. Statusdimensionen

Getrennt bewertet; eine implementierte Funktion ist nicht automatisch zertifiziert.

| Kürzel | Bedeutung |
|---|---|
| IMPL | implementiert |
| GET | getestet |
| VAL | fachlich validiert (Gegenrechnung, Regeltreue) |
| ZERT | zertifiziert (bestehende Gates erfüllt) |
| REIF | produktreif (öffentlich, Owner-Freigabe) |
| DEAKT | absichtlich ausgeschaltet |
| BLOCK | wartet auf Daten, Zeit oder eine Owner-Entscheidung |
| ZURÜCK | vom Owner zurückgestellt |

Zeichen: ✔ ja · ◐ teilweise · ✘ nein · – nicht zutreffend.

## 2. P0 – Security Master 1.3.0

Freigabepaket: [data/security-master/SECURITY_MASTER_1_3_0_FREIGABE.md](data/security-master/SECURITY_MASTER_1_3_0_FREIGABE.md) (#1240).

| Prüfpunkt | Befund |
|---|---|
| Nachprüfung 02.11., 15 Uhr UTC | #1240 (`f8a1818`) mit `main` @ `558b574` probeweise gemergt: konfliktfrei; Security-Master-Tests 147/0 (inkl. SMP-1…5, SMA, SMF, MG, MCH), Core 308/0; `preflight --deadline`: Stamm CURRENT bis Lauftag 10.11., STALE ab 11.11.; Firmennamen STALE ab 26.11. Kein `main`-Commit seit der Freigabeliste berührt Stamm oder Eingangsprüfung. |
| Frist | **Letzter zulässiger Lauftag 10.11.2026; ab 11.11. ist der Stamm STALE.** Erster blockierter Kandidatenlauf 11.11., 11:43 UTC. Grund: `input-gate.mjs` Z. 37 (`master: 60`), Z. 46–47 (`ageDays > maxDays`). Stamm `generatedAt` 2026-09-11T14:43Z: am 10.11. 59,39 Tage alt, am 11.11. 60,39 Tage. Danach Exit 3 (`build-candidates.mjs` Z. 178). |
| Firmennamen | STALE ab 26.11. (45 Tage). Der Wechsel löst diese Frist mit. |
| Probelauf | Lokal und in CI (41400342624): Gate PASS. Der Folgestand ändert sich innerhalb eines Tages. Deshalb müssen Probelauf und produktiver Lauf direkt nacheinander laufen. |
| Freigabeliste | Neu erzeugt: +4 Deaktivierungen, +1 Eignung, Namen −3/+4. Mit neuer Liste PASS ohne ungenutzten Eintrag. **canonical_id 24/25: nur ein Eintrag Spielraum.** |
| Auswirkungen | 7.803 securityIds unverändert, 0 neu, 0 entfallen. Discover: 270 Dateien, nur Namen. Supertrader: 3.368 Kandidaten unverändert. Quant: ein Testfehler in diesem PR behoben, Kapazitäts-Projektion wird mit dem Marktdaten-Lauf grün. DQ-ID-4: 112 → 60. |
| Freezes | unverändert (SMF, MG, MCH grün; 1.1.0 bleibt gepinnt) |
| Rücknahme | R1: Revert des Lauf-Commits, lokal geprüft (Baum identisch, Stamm wieder `26c82617`). R2: Marktdaten-Lauf erneut. |
| Unabhängig vom Wechsel | `eligibility.json` ist seit 20.10. STALE (eigener Erzeuger, eigene Entscheidung). |

## 3. Matrix

### Technical

| Funktion | IMPL | GET | VAL | ZERT | REIF | DEAKT | BLOCK | Nachweis | Einschränkung |
|---|---|---|---|---|---|---|---|---|---|
| Analyse-Assistent, 8 Ziele | ✔ | ✔ | ✔ | – | ◐ | ✘ | ✘ | #1245; Screener-Treffer = „Erfüllt“ (Test); Browser-QA 66/66; Abnahmevorlage A1–A8 ✔ | Texte zur Owner-Lektüre (T-1) |
| Vier Ebenen, Vorteil „nicht nachgewiesen“ | ✔ | ✔ | ✔ | – | ◐ | ✘ | ✘ | Evidenz-Verweise gegen die Artefakte (Test) | keine neuen historischen Zahlen |
| Datenqualität in Treffern und Chart | ✔ | ✔ | ✔ | – | ✔ | ✘ | ◐ | gemeinsame Trefferkarte, Prüfleiste | T-2 gemergt (#1251): gekennzeichnete Titel innerhalb jeder Einordnung hinten; Ausschluss (Option C) nicht umgesetzt |
| 13 Vorlagen mit Checkliste | ✔ | ✔ | ✔ | – | ✔ | ✘ | ✘ | `main` | – |
| S4 historische Tests | ✔ | ✔ | ◐ | ✘ | ✘ | ✔ | ◐ | `RESEARCH_LIMITED` | Tages-OHLC-Historie fehlt |
| Nachtlauf, GIBO-Bereinigung | ✔ | ✔ | ✔ | – | ✔ | ✘ | ✘ | `c307119`, DQ-TW-1..8 PASS | – |
| KI-Suche | ✔ | ✔ | ◐ | – | ✘ | ✔ | ✔ | AI_SEARCH_EVAL.md | Anbieter, Kosten |
| Lange Wochen-OHLC | ✘ | – | – | – | ✘ | – | ✔ | WEEKLY_FORMATIONS.md | Lizenz (zurückgestellt) |

### Quant (Backtesting)

Die Zustände stammen aus `backtest-certification-v1.json`. Zertifiziert sind 0/6 Arten. Gates und Schwellen sind unverändert.

| Art | IMPL | GET | VAL | ZERT | DEAKT | Hauptblocker → Lösungsweg | Research-Nachweis neu (#1246) |
|---|---|---|---|---|---|---|---|
| SAME_STOCK_REPLAY | ✔ | ✔ | ✔ | ✘ LIMITED | ✔ | Survivorship und `ruleTest`, strukturell → nur Kennzeichnung (FV-7) | – |
| PATTERN_EVIDENCE | ✔ | ✔ | ✔ | ✘ LIMITED | ✔ | `returnBasis` → FV-5 (Erzeuger in Gesamtrendite, Umverdrahtung); Survivorship → FV-5 mit Secret; `certifiedAsBacktest` → Norm (Owner) | P4.1: Gesamtrendite wie Runner (62/62 Ereignisse), +0,75 Pp aus Ausschüttungen; P3.1 vorbereitet, Delisted-Lauf braucht das Archiv |
| SIGNAL_BACKTEST | ✔ | ✔ | ✔ | ✘ LIMITED | ✔ | Survivorship → Daten vor 2016 fehlen, P3.1-Lauf (FV-5); `ruleCertified` 0/5 ist ein Befund | P3.1 Überlebenden-Lauf gerechnet, Delisted-Lauf vorbereitet |
| SETUP_BACKTEST | ✔ | ✔ | ✔ | ✘ COLLECTING_HISTORY | ✔ | Historie (Zeit), OOS A1–A6 (FV-6), Unabhängigkeit (FV-1) | FV-1 analysiert: Lesart A (Monate) frühestens 2028-04, B (Wochen) 2027-03-26 |
| STRATEGY_BACKTEST | ✔ | ✔ | ✔ | ✘ COLLECTING_HISTORY | ✔ | Mitgliedschafts- und Faktorhistorie 2/24 (Zeit), frühestens 2028-08 | PIT-Integrität ohne Fehler; FV-8 technisch fertig |
| FACTOR_RANKING_BACKTEST | ✔ | ✔ | ✔ | ✘ COLLECTING_HISTORY | ✔ | Faktorhistorie 2/24, Forward 0/12 (Zeit), frühestens 2028-08 | wie oben |

**Gegenrechnung:** 16 öffentliche Katalogfälle neu gerechnet, Python 16.451 Prüfungen und 0 Abweichungen. Die 5 privaten Fälle sind als Runbook R1 vorbereitet (`catalog-private-recheck.cjs`) und brauchen das Archiv mit Secret. Backtest-Ergebniszahlen erscheinen nicht im Produkt; die Research-Zahlen stehen nur unter `docs/quant/`.

### Supertrader

Für alle 13 Methoden gilt: IMPL ✔, GET ✔, ZERT ✘, REIF ✘. Quelle: `SUPERTRADER_13_METHODS_EVIDENCE.md` 1.2.0 (#1247).

**Prüfpunkte (130 = 13 Methoden × 10 Dimensionen):**

| | Zyklus 1 | Zyklus 2 | 3.2 | nach #1233–#1235, #1257 (neu erzeugt in #1247) |
|---|---|---|---|---|
| BELEGT | 20 | 21 | 21 | 23 |
| TEILWEISE | 51 | 60 | 60 | 58 |
| OFFEN | 16 | 3 | **0** | 0 |
| BLOCKIERT | 43 | 46 | 49 | 49 |

Die 3 offenen Punkte (Quellen- und Regeltreue C06, C07, C09) bleiben nach Prüfung blockiert:
- #1235 belegt Regeltreue-Tests;
- CC-1 und CC-3 bleiben laut ALL13-Plan eine Owner-Frage.

**49 blockierte Punkte nach Klasse:**
- Klasse 1, Owner-Fachentscheidung: 14;
- Klasse 2, lizenzierte Daten: 22;
- Klasse 4, historische Voraussetzung: 13;
- Klasse 3, vorhandener, nicht ausgewerteter Nachweis: 0.

**Zehn Freigabepakete** (jeder blockierte Punkt in genau einem Paket, Test `MC3-EV-PACKAGES`):

| Paket | Inhalt | Punkte | Klasse | Frist | Empfehlung |
|---|---|---|---|---|---|
| FP-ST-01 | Lizenzierte Corporate-Action-Quelle, Snapshot-Generation 3 (CC-5) | 13 | 2 | vor der Paper-Auswertung | Anfrage ohne Kauf, Kauf erst nach Musterabnahme |
| FP-ST-02 | Aktivierung SF6-PAPER-2027 (CC-8) | 11 | 4 | **Aktivierungs-PR vor 01.01.2027** | aktivieren |
| FP-ST-03 | Turtle: PIT-Gruppenquelle | 2 | 1 | – | PIT-SIC aus EDGAR |
| FP-ST-04 | Weinstein/SEPA: Gruppen-, A/D-, RS-Historie | 3 | 2 | – | nur Gruppen-Stage über FP-ST-03 |
| FP-ST-05 | Minervini: Originalquelle, Ermessensfragen | 2 | 1 | vor dem Öffnen von Kennzahlen | Option A |
| FP-ST-06 | Pocket Pivot: Stopregel, Ermessensfragen | 2 | 1 | dito | Option A |
| FP-ST-07 | Holy Grail: Primärquelle | 3 | 1 | dito | zuerst prüfen |
| FP-ST-08 | EP/Parabolic Short: Zertifizierungsweg | 5 | 1 | – | zurückstellen |
| FP-ST-09 | EP/PS: SIP-Minuten, Borrow-, Delisting-Daten | 6 | 2 | – | nur bei FP-ST-08 A |
| FP-ST-10 | EP/PS: eigenes Forward-Protokoll | 2 | 4 | – | zurückstellen |

| | Methode | Zustand | Regeltreue | Kausalität | Hauptblocker (Klasse) |
|---|---|---|---|---|---|
| C01 | Turtle S1 | RCWE | ◐ TOP5 14/14, ALL13 #1235 | ✔ | zwei Lesarten (1) |
| C02 | Turtle S2 | RCWE | ◐ TOP5 17/17, ALL13 #1235 | ✔ | PIT-Korrelationsgruppen (1/2) |
| C03 | Darvas | RCWE | ◐ TOP5 16/16 | ✔ | Beginn der Bodensuche (1) |
| C04 | Weinstein Investor | RCWE | ◐ ALL13 #1235 | ✔ | Ermessensfragen CC-3 (1) |
| C05 | Weinstein Trader | RCWE | ◐ ALL13 #1235 | ✔ | Ermessensfragen CC-3 (1) |
| C06 | Minervini SEPA | RCWE | ◐ ALL13 #1235 | ✔ | Übersetzung der Quelle CC-1 (1) |
| C07 | Minervini Power Play | RCWE | ◐ ALL13 #1235 | ✔ | Übersetzung der Quelle CC-1 (1) |
| C08 | Kullamägi Breakout | RCWE | ◐ TOP5 15/15 | ✔ | Setup-Proxy CC-3 (1) |
| C09 | Episodic Pivot | VALIDATION_BLOCKED | ✘ | ✘ | SIP-Minuten (2) |
| C10 | Parabolic Short | VALIDATION_BLOCKED | ✘ | ✘ | Borrow-Historie (2) |
| C11 | Pocket Pivot | SOURCE_BLOCKED | ◐ ALL13 #1235 | ✔ | Stopregel fehlt in der Quelle (1) |
| C12 | Buyable Gap-Up | RCWE | ◐ TOP5 14/14 | ✔ | Volumenfenster CC-1 (1) |
| C13 | Holy Grail | SOURCE_BLOCKED | ◐ ALL13 #1235 | ✔ | Primärquelle (1/2) |

CC-5 (lizenzierte Quelle für Kapitalmaßnahmen, Klasse 2) und CC-8 (Paper-Test 2027, Klasse 4) sind bei allen 13 blockiert. ALL13-Regeltreue (#1235): Konformität 13/13, Mutationsproben 41/41 korrekt verworfen.

**Produktreife Kandidatenlauf:**
- V1: S1 3/5, S5 1/2, S6 erst nach 1.3.0, S7 nach dem ersten automatischen Lauf.
- Kandidatenstand 30.10.: ab 05.11. ist DQ-SF8-1 rot, solange `SF8_AUTO_PUBLISH` nicht gesetzt ist.

## 4. Tatsächlich offene Owner-Entscheidungen (gebündelt)

| # | Entscheidung | Frist | Vorlage | Empfehlung |
|---|---|---|---|---|
| **E1** | **Security Master 1.3.0:** #1240 mergen und den Lauftag nach den Schritten 1–8 freigeben | **Lauftag spätestens Mo 09.11.**; harte Grenze Mi 11.11., 11:43 UTC | SECURITY_MASTER_1_3_0_FREIGABE.md §4 (Freigabetext im Wortlaut) | freigeben, Lauftag Do 05.11. oder Fr 06.11. (Puffer für einen zweiten Versuch vor dem 09.11.) |
| E2 | `SF8_AUTO_PUBLISH` setzen, sobald Nachweis 1 vorliegt (S1–S6 mit Lauf-IDs, S6 erst nach E1) | ab 05.11. ist DQ-SF8-1 rot | SUPERTRADER_9_OWNER_APPROVALS.md §15 | nach E1 |
| E3 | Technical T-1: Texte des Assistenten freigeben, dann #1245 mergen | – | TECHNICAL_ASSISTANT_ABNAHME.md | freigeben |
| E4 | Technical T-2: Titel mit Datenverdacht nachrangig sortieren (#1251) | – | PR #1251 (Vorher/Nachher) | freigeben |
| E5 | #1246 mergen (Werkzeuge und Research, keine Gate-Änderung) | – | BACKTEST_COVERAGE_MATRIX.md | freigeben |
| E6 | FV-1 (#1254): Bezeichnung `eventCalendarMonths`, Monatssemantik bleibt (Setup frühestens 2028-04). Die Unabhängigkeit über N_eff ist eine eigene spätere Entscheidung | vor FV-6 | PR #1254 | freigeben |
| E7 | Supertrader #1233, #1234, #1235, #1247 mergen (Reihenfolge §0) | – | §0 | freigeben |
| E8 | #1248 mergen | – | – | zuletzt |
| E9 | Strategie-Akademie A-1..A-4 (Ort, Begriffsquelle, Namensnennung, feste Beispiele) | – | STRATEGY_ACADEMY_PLAN.md (#1252) | A-1 ja, A-2 Referenz mit Test, A-3 ohne Namen, A-4 zurückstellen |
| E10 | #1236 (NVDA-Browser-QA, UI-Sperre versioniert) – macht die Quant Browser QA auf allen PRs wieder grün | – | PR #1236 | freigeben |
| E11 | `eligibility.json` (§6) | – | §6 | nach E1, eigener Neubau-PR mit Vorher/Nachher |
| E12 | Läufe mit Secrets: V13-Studie (#1234), Quant R1–R3 (private Katalogfälle, Survivorship-Delisted, Gesamtrendite auf der kanonischen Historie) | nach E1 und E7 | BACKTEST_P2_DEFIZITE.md, SUPERTRADER_9_HANDOVER.md §0 | nach E1 |
| E13 | Supertrader FP-ST-01..10 (vor allem **FP-ST-02 bis 01.01.2027**) | siehe §3 | SUPERTRADER_13_METHODS_EVIDENCE.md §10 | siehe §3 |
| E15 | #1259 mergen (Erzeuger-Option, keine Wirkung ohne Schalter); danach FV-5 Schritt 1 (Prüflauf ohne Commit im Materialisierungs-Workflow) | – | PR #1259 | freigeben |
| E16 | #1257 mergen. Offen bleiben die Owner-Fragen FP-KK-ADR-DENOMINATOR-STATUS (SOURCE_EXACT oder SOURCE_DERIVED) und FP-DAR-Q7-READING (Lesart „nicht in der neuen Box“) | – | PR #1257 | freigeben; beide Fragen in FP-ST-05/-07 bündeln |
| E17 | #1260 mergen (nur Test) | – | PR #1260 | freigeben |
| E18 | #1262 (C09-Rechenbefund): Behebung freigeben; dazu die Cache-Reruns `run-kk-intraday.mjs`/`run-sf5-lifecycle.mjs` mit Secrets und neue Pins bzw. ST9-Registrierungsversion | vor jeder Kennzahl zu C09 | PR #1262 | freigeben |
| E14 | Quant FV-2, FV-3, FV-5 (Umverdrahtung `survivorship`/`returnBasis`), FV-6 (Setup-OOS A1–A6, vor etwa 2027-03-26), FV-7, FV-8 (ein Workflow-Schritt) | FV-6 | BACKTEST_COVERAGE_MATRIX.md §H | – |

Stand nach dem Merge-Lauf vom 02.11. abends (§0): Die Merges zu E3, E4, E5, E6, E7, E10, E16 und E17 sind erledigt, E8 mit diesem PR. Von E1 ist nur der Merge von #1240 erledigt, der Lauftag ist offen. E9 ist offen (#1252 geschlossen), E15 und E18 sind nicht freigegeben.

## 5. Wiederaufnahmepunkt

Stand 02.11.2026 abends. Alle autonom ausführbaren Quant- und Supertrader-Pakete sind als PR umgesetzt. Was übrig ist, braucht E1–E18, Secrets oder einen Lauftag.

**Nächste ausführbare Aufgaben, in dieser Reihenfolge:**
1. **Lauftag 1.3.0 (E1):** `node scripts/market/security-master-switch-preflight.mjs --deadline`, dann die Schritte 1–8 der Freigabe.
2. **Nach jedem Merge aus §0:** dieses Dokument nachziehen.
   - Nach #1233–#1235 und #1257: Evidenzdokument mit `build-evidence-matrix.mjs --out` neu erzeugen (erledigt in #1247 am 02.11.).
   - Nach #1262 und #1247: die Finding-Tests MC3-FINDING-C09-* in #1247 auf „behoben“ umstellen.
3. **Supertrader S1/S5:** die Nachtläufe 03.11./04.11. und den SEC-Montagslauf mit Lauf-IDs im Handover §4 belegen.
4. **Nach E1:** Neubau von `eligibility.json` als PR mit Vorher/Nachher (E11), Katalog-Generation 2 gegen 1.3.0 (H7) mit den 16 bisher nie vorgerechneten Kombinationen.
5. **Nach E15:** FV-5 Schritt 1, der Prüflauf der Musterstudie auf Gesamtrendite im Materialisierungs-Workflow.
6. **Nach E9 und dem Merge von #1245:** Academy A1/A2 mit dem Pilot „Trendfolge verstehen“.

## 6. Datenqualität: `eligibility.json`

- **Stand:** `generatedAt` 2026-09-15. Laut Frischevertrag (`core/registry/domains.json`, `staleAfter` 840 h) ist die Datei seit 20.10. veraltet.
- **Erzeuger:** `scripts/market/build-us-eligibility.mjs`. Er hat keinen Workflow und läuft nur manuell (`workflow: null`, bekannte Lücke). Er ruft keine Kurse ab (Tiingo-Anfragen 0).
- **Trockenlauf 02.11.** auf dem heutigen Stamm 1.1.0 (`--dry-run`, nichts geschrieben):
  - **439 Eignungsänderungen**, darunter EXCLUDED → ELIGIBLE 146, ELIGIBLE → EXCLUDED 129 und 128 Wechsel nach REVIEW;
  - die Nachbearbeitungen `apply-name-layer-class.mjs` und `apply-exchange-directory.mjs` sind dabei nicht eingerechnet.
- **Bewertung:** Ein Neubau verändert das Produktuniversum (Discover, Screener, Faktoren, Supertrader-Abrufumfang). Er ist deshalb nicht autonom. Er gehört nach E1 auf den neuen Stamm, als eigener PR mit Vorher/Nachher der gesamten Kette.
- **Empfehlung:** Danach einen geplanten Erzeuger-Lauf einrichten (Workflow mit `permissions`, Concurrency, Push-Skript nach ADR-005). Das ist eine eigene Freigabe.
