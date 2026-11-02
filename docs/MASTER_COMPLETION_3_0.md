# Master Product Completion 3.0/3.1 – gemeinsame Completion-Matrix (Technical, Quant, Supertrader)

Stand 02.11.2026, nach Zyklus 2 (Auftrag 3.1). Basis `main` @ `edea251`.

Dieses Dokument ist der Wiederaufnahmepunkt über alle drei Produktwelten. Die Einzelheiten stehen in den verlinkten Übergaben. Jede Welt hat eigene PRs, weil die Isolations-Gates (CLAUDE.md) eine Querschnittsänderung verbieten.

## 0. PRs dieses Auftrags und Merge-Reihenfolge

Alle PRs sind Drafts, keiner ist gemergt. Jeder Merge braucht die Owner-Freigabe.

| PR | Welt | Head | CI | gegen `main` | Inhalt |
|---|---|---|---|---|---|
| #1240 | Security Master | `f8a1818` | grün | konfliktfrei | Freigabepaket 1.3.0, lesende Prüfhilfe `security-master-switch-preflight.mjs`, Testkorrektur `v10-population` |
| #1245 | Technical | `46fca1f` | grün | konfliktfrei | Analyse-Assistent mit Abnahmevorlage und Screenshots |
| #1246 | Quant | `34193b0` | grün | konfliktfrei | Coverage-Matrix, P0.5/P0.7/P2.1/P2.2, P2-Defizite, Runbooks R1–R3 |
| #1233 | Supertrader | `f12855d` | grün | konfliktfrei | Turtle-Einheitsstopps (vorher rot wegen veralteter Basis; `main` hineingemergt) |
| #1234 | Supertrader | `5c31527` | grün | konfliktfrei | V13-Delisting-Studie, Workflow (vorher rot, wie #1233) |
| #1235 | Supertrader | `eacfc9e` | grün | konfliktfrei | ALL13-Zertifizierungsvorbereitung (Konflikt gelöst, `token` → `sourcePhrase`, Plan 1.0.1) |
| #1247 | Supertrader | `d3e7e9c` | grün | konfliktfrei | Evidenzmatrix 1.1.0 der 13 Methoden |
| #1248 | gemeinsam | dieses Dokument | – | konfliktfrei | Completion-Matrix |

Paarweiser Probe-Merge aller acht PRs (`git merge-tree`): **keine Konflikte**. Jeder PR liegt einen Commit hinter `main` (Reel #1250, ohne Berührungspunkt).

**Sichere Merge-Reihenfolge:**

| Schritt | PR | Begründung |
|---|---|---|
| 1 | #1240 | zeitkritisch: Vorbedingung des Lauftags 1.3.0, spätestens 09.11. |
| 2 | #1245 | unabhängig; nach Owner-Entscheidung T-1 (Texte) |
| 3 | #1246 | unabhängig; nur Research und Werkzeuge |
| 4 | #1233, danach #1234 | #1234 liest Archivgeneration 1.2.0; vor einer Löschung von 1.2.0 umstellen (Quant H3) |
| 5 | #1235 | neue Pins für den ALL13-Plan |
| 6 | #1247 | zuletzt bei Supertrader: Der Erzeuger erkennt, ob die Nachweise aus #1233–#1235 auf `main` sind. Danach das Dokument mit `--out` neu erzeugen, sonst wird `MC3-EV-DOC-EQUALS-GENERATOR` rot. |
| 7 | #1248 | zuletzt, Stand nachziehen |

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
| Datenqualität in Treffern und Chart | ✔ | ✔ | ✔ | – | ✔ | ✘ | ◐ | gemeinsame Trefferkarte, Prüfleiste | Sortierung gekennzeichneter Titel: Option C, nicht freigegeben (T-2) |
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

Für alle 13 Methoden gilt: IMPL ✔, GET ✔, ZERT ✘, REIF ✘. Quelle: `SUPERTRADER_13_METHODS_EVIDENCE.md` 1.1.0 (#1247).

**Prüfpunkte (130 = 13 Methoden × 10 Dimensionen):**

| | Zyklus 1 | Zyklus 2 |
|---|---|---|
| BELEGT | 20 | 21 |
| TEILWEISE | 51 | 60 |
| OFFEN | 16 | 3 |
| BLOCKIERT | 43 | 46 |

**Die 43 blockierten Punkte aus Zyklus 1 nach Klasse:**

| Klasse | Anzahl |
|---|---|
| 1 Owner-Fachentscheidung | 11 |
| 2 fehlende lizenzierte Daten | 19 |
| 3 vorhandener, noch nicht ausgewerteter Nachweis | 0 (geprüft; zwei Nachweise neu ausgewertet: Referenzcode Turtle, Stichprobe) |
| 4 historische Voraussetzung, heute nicht erfüllbar | 13 |

Einordnung von Zyklus 2:
- Die OFFEN-Punkte ohne technisch lösbaren Blocker zählen jetzt ehrlich als BLOCKIERT.
- Nachweise aus #1233–#1235 sind als „auf Branch, noch nicht gemergt“ gekennzeichnet.

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

## 4. Gebündelte Owner-Entscheidungen

| # | Entscheidung | Frist | Vorlage |
|---|---|---|---|
| **1** | **Security Master 1.3.0:** #1240 mergen, dann den Lauftag nach den Schritten 1–8 freigeben (Probelauf → neue Liste → Listen-PR → Probelauf → produktiver Lauf → Marktdaten-Lauf → Nachprüfung → Generations-PR) | **Lauftag spätestens Mo 09.11.**, harte Grenze 11.11., 11:43 UTC | SECURITY_MASTER_1_3_0_FREIGABE.md §4 (Freigabetext im Wortlaut) |
| 2 | `SF8_AUTO_PUBLISH` setzen, sobald Nachweis 1 vorliegt (S1–S6 mit Lauf-IDs) | nach #1; sonst ist DQ-SF8-1 ab 05.11. rot | SUPERTRADER_9_OWNER_APPROVALS.md §15 |
| 3 | Merge der PRs in der Reihenfolge aus §0 | – | §0 |
| 4 | Technical T-1 (Texte freigeben) und T-2 (Titel mit Datenverdacht nach unten sortieren, eigener Fachmodell-PR) | – | TECHNICAL_ASSISTANT_ABNAHME.md §4 |
| 5 | Quant FV-1: Lesart des Gates `independence`. Empfehlung: A (Monate) beibehalten und das Feld umbenennen; Unabhängigkeit über N_eff als eigene Entscheidung | vor FV-6 | BACKTEST_COVERAGE_MATRIX.md §H, BACKTEST_P2_DEFIZITE.md |
| 6 | Quant FV-6 Setup-OOS A1–A6 | vor etwa 2027-03-26 | SETUP_OOS_DECISION_A1_A6.md |
| 7 | Quant FV-5: private Läufe R2/R3 und Umverdrahtung `survivorship`/`returnBasis`; vorher #1 und die Tiingo-Rechte für delistete Reihen (P3.2) | nach #1 | BACKTEST_P2_DEFIZITE.md |
| 8 | Quant FV-2, FV-3, FV-4 (R1), FV-7, FV-8 (ein Workflow-Schritt) | – | BACKTEST_COVERAGE_MATRIX.md §H |
| 9 | Supertrader Klasse 1 (11 Punkte): Lesarten PS-C01, PS-C03, PS-C08, PS-C12, PS-C02-CC4 sowie die Ermessensfragen CC-3 und CC-1 | vor dem Öffnen der Kennzahlen | SUPERTRADER_13_METHODS_EVIDENCE.md §5, §9 |
| 10 | Supertrader Klasse 2: lizenzierte Quelle für Kapitalmaßnahmen (CC-5), SIP-Minuten (C09), Borrow-Daten (C10) | – | dito |
| 11 | Paper-Test SF6-PAPER-2027 aktivieren | vor dem 01.01.2027 | SUPERTRADER_6_PAPER_VALIDATION_PROTOCOL_2027.md |
| 12 | V13-Studie über #1234 mit Secrets und festgelegter Archivgeneration | nach #3 | SUPERTRADER_9_HANDOVER.md §0 |
| 13 | `eligibility.json` ist seit 20.10. STALE (eigener Erzeuger) | – | SECURITY_MASTER_1_3_0_FREIGABE.md §1 |

## 5. Wiederaufnahmepunkt

1. Vor dem Lauftag 1.3.0: CI von #1240 auf aktuellem `main` grün; `node scripts/market/security-master-switch-preflight.mjs --deadline` zeigt die Frist.
2. Nach jedem Merge aus §0 dieses Dokument nachziehen. Nach #1233–#1235 auch das Evidenzdokument neu erzeugen.
3. Autonome Pakete ohne Freigabe:
   - Supertrader S1/S5 mit den nächsten echten Lauf-IDs belegen;
   - Quant: Research-Läufe ohne Secrets nach Bedarf;
   - Technical: Live-Messung der mobilen Performance nach dem nächsten Deploy (`technical-live-qa.yml`).
