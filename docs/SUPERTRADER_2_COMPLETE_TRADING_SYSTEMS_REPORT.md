# Supertrader 2.0 – Von quellentreuer Forschung zu prüfbaren Handelssystemen: Abschlussbericht

Stand: 20. Oktober 2026. Ausgangspunkt: `main` @ `7f7cf82` mit den gemergten Arbeiten #779, #781 und #784–#792. Keine Merges, keine Live-Aktivierung, keine Orders, kein Modellportfolio geändert. Alle historischen Aussagen sind `DIAGNOSTIC_NOT_CERTIFIED`.

**Generierte Begleitdokumente:**
- [Completion-Matrix](SUPERTRADER_2_STRATEGY_COMPLETION_MATRIX.md)
- [Data Gaps](SUPERTRADER_2_DATA_GAPS.md)
- [Backtest-Readiness](SUPERTRADER_2_BACKTEST_READINESS.md)

**Maschinenlesbare Artefakte** in `scripts/supertrader/source-faithful/artifacts/`:

| Artefakt | Inhalt |
|---|---|
| `STRATEGY-COMPLETION-GAPS.json` | 13 Kandidaten × 15 Dimensionen, Lückenklasse je Lücke |
| `STRATEGY-COMPLETION-STATUS.json` | Engine-Zustand, Flags, Turtle Acceptance Gate |
| `STRATEGY-SOURCE-FIDELITY-RESULTS.json` | Regelstatus, Ableitungen, Golden Cases je Methode |
| `STRATEGY-EXECUTION-RESULTS.json` | Ausführungskonventionen, Snapshot-Läufe (nur öffentliche Belege) |
| `STRATEGY-RISK-VALIDATION.json` | Stop-, Sizing-, Pyramiding- und Portfolio-Regeln mit Tests |
| `STRATEGY-DATA-DEPENDENCIES.json` | Datenbedarf, Bestand im Repository, Beschaffungsvertrag |
| `STRATEGY-BACKTEST-READINESS.json` | die acht Messfragen aus Abschnitt 14 |
| `STRATEGY-LIVE-READINESS.json` | `LIVE_NOT_APPROVED` mit Voraussetzungen |

Die Registry-Artefakte aus #784–#792 wurden mit ihren Erzeugern neu gebaut, nicht von Hand geändert.

## Kernaussage

Die Gap-Analyse aller 13 Kandidaten zeigt: Nach #784–#792 gab es kaum noch reine Implementierungslücken. Ein Implementierungslücke heißt hier: Die Regel ist belegt, aber der Code fehlt. Fast alle offenen wesentlichen Regeln sind laut Primärquelle manuell, datenblockiert oder quellenoffen. Das sind keine Lücken, die Code schließen kann.

Diese Arbeit hat
- die verbleibenden echten Lücken und Fehler geschlossen (zwei davon fachliche Fehler, siehe Frage 6);
- jede Methode mit einer abgeleiteten Vollständigkeitsprüfung versehen;
- Turtle bis an das Acceptance Gate gebracht.

Ergebnis heute:

| Zustand | Kandidaten |
|---|---|
| `RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION` (nach Gate) | Turtle S1, Turtle S2 |
| `MECHANICAL_SCREEN_COMPLETE` | C03–C08, C11, C12 |
| `MECHANICAL_COMPONENTS_ONLY` | C09 KK Episodic Pivot, C10 KK Parabolic Short, C13 Holy Grail |
| Offene Implementierungslücken | **0** (abgeleitet, nicht gesetzt) |

Das Turtle-Acceptance-Gate ist mit allen sieben Prüfungen bestanden, darunter die Abstimmung eines Snapshot-Laufs des aktuellen Codes (siehe [Snapshot-Lauf](#snapshot-lauf-der-neuen-engines)).

## Antworten an den Owner

### 1. Welche der 13 Methoden sind jetzt mechanisch vollständig?

**Turtle S1 und S2: als Research-Engine für den deklarierten Equity-Umfang.**
- Jede Regel ist umgesetzt und getestet.
- Ausnahme sind die Korrelationslimits TUR-LIMIT6/10. Ihre Mechanik ist umgesetzt und getestet, aber ohne PIT-Branchengruppen kann sie kein Lauf durchsetzen. Deshalb lautet der Zustand ehrlich `RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION` und nicht `RESEARCH_ENGINE_COMPLETE`.
- Das Futures-Original (Short-Seite, Kontraktmonate, Rolls) ist nicht Teil des Equity-Umfangs. Es ist datenblockiert und wird nie als identisch mit der Equity-Version dargestellt.

**Mechanisch vollständige Screens** (`MECHANICAL_SCREEN_COMPLETE`): Darvas, Weinstein Investor und Trader, Minervini SEPA/VCP und Power Play, KK Breakout, Pocket Pivot, BGU.
- Jede maschinell entscheidbare, belegte Regel ist umgesetzt und getestet.
- Der Rest ist laut Quelle Reviewer-Entscheidung, datenblockiert oder quellenoffen.
- Ein Screen ist keine Kaufstrategie. Jede Ausgabe ist `MANUAL_REVIEW_REQUIRED` mit `buyDeclarationAllowed=false`.

**Nur Komponenten** (`MECHANICAL_COMPONENTS_ONLY`):
- KK Episodic Pivot: Einstieg verlangt Intraday-Daten und Katalysatoren.
- KK Parabolic Short: verlangt Intraday-Daten, VWAP und Borrow.
- Holy Grail: Einstieg, Stop und Größe sind in der Quelle nicht offengelegt.

### 2. Welche können mit vollständigen Entries und Exits diagnostisch gemessen werden?

Nur **Turtle S1/S2**. Erlaubte Messart: `DIAGNOSTIC_RUN_WITH_DECLARED_DATA_EXCEPTION`, also mit dem Snapshot und `research-v1`.

Jedes Ergebnis nennt die nicht durchgesetzten Korrelationslimits (`correlationLimits: NOT_EVALUATED_NO_PIT_GROUPS`). Eine vollständige Messung im Sinne von Abschnitt 14 (`FULL_DIAGNOSTIC_METHOD_RUN`) ist das nicht, solange die PIT-Gruppen fehlen.

**Darvas** bleibt Komponentenstudie (`COMPONENT_SIGNAL_STUDY_ONLY`). Auswahl und Größe sind manuell. Es gibt keine Methodenrendite.

**Alle übrigen:** keine historische Messung. Exit oder Stop sind manuell, quellenoffen oder datenblockiert. Eine feste Haltedauer wäre erfunden.

### 3. Welche brauchen zwingend manuelle Prüfung?

Alle Screen-Methoden C03–C13. Die blockierenden Review-Fragen stehen je Kandidat in der Matrix (Spalte „manuelle Entscheidungen“; insgesamt 103 MANUAL-Lücken über alle Dimensionen).

Durch das Design der Quelle sind manuell:

| Methode | Manuelle Entscheidung |
|---|---|
| Darvas | Auswahl, Volumenurteil, Markt, Größe |
| Weinstein | Stage, Volumen, RS-Urteil, Overhead, Support-Stops und Trailing |
| Minervini | Priorisierung, Qualität, VCP, Pivot, Stop, Größe, Verkauf |
| Kullamägi | Setup, Level, Größe, Teilverkäufe |
| Morales/Kacher | Basis, Thema, Extension, Exits; BGU zusätzlich Megacap-Ausnahme |
| Holy Grail | Impuls, Ausführung |

Turtle braucht keine manuelle Prüfung.

### 4. Welche sind aufgrund konkreter fehlender Daten blockiert?

| Methode | Blockierte wesentliche Regel | Fehlende Daten |
|---|---|---|
| Turtle S1/S2 | TUR-SF-LIMIT-CORR | PIT-Branchen- bzw. Korrelationsgruppen. SIC im Repo ist `CURRENT_ONLY`. |
| Weinstein C04/C05 | WEIN-SF-GROUP, WEIN-SF-MARKET | PIT-Branchengruppen; NYSE-Breadth-Historie |
| Minervini SEPA C06 | MIN-SF-TT-8 | IBD-RS-Rating (proprietär) |
| KK Episodic Pivot C09 | KK-SF-EP-CATALYST, -VOLUME, -ENTRY | Katalysator-Zeitstempel; konsolidiertes Minutenvolumen; 1-Minuten-Opening-Range |
| KK Parabolic Short C10 | KK-SF-PS-ENTRY, -STOP, -BORROW | Intraday-Balken/VWAP; Borrow/Locate/Gebühren |

Daten, die Methoden nur teilweise einschränken:
- Darvas: Allzeithoch erst ab Listing (ab 2015 nur „unverified“).
- BGU: PIT-Marktkapitalisierung (nur Evidenz).
- KK Breakout: optionale ORH-Variante.

### 5. Welche Source-Regeln wurden zusätzlich vollständig umgesetzt?

| Regel | Umsetzung |
|---|---|
| TUR-LIMIT6 / TUR-LIMIT10 | Engine-Mechanik mit PIT-Gruppenanbieter `groupsOf(securityId, priorDate)`. Abdeckung wird gezählt (`ENFORCED_PARTIAL_GROUP_COVERAGE`). Datenbindung `DATA_BLOCKED`. |
| TUR-FAILSAFE (Exit) | Beide Lesarten der quellenoffenen Regel: 10-Tage-Exit (Standard) und 20-Tage-Exit als Szenario `FAILSAFE_EXIT_20D` |
| TUR-S1EX/S2EX am Einstiegsbalken | Kanal-Exit als ruhender Stop, Reihenfolge Einstieg → Adds → Unit-Stops → Kanal. Der S1-Filter nutzt dieselbe Konvention. |
| DAR-Q12 | Review-Daten: Allzeithoch, Hoch/Tief über 2 und 3 Jahre, Wochenspanne und Volumen über 4–6 Monate. Nur Evidenz. |
| DAR-Q6 | Stop-Anhebung auch dann, wenn die Box an einem übersprungenen Balken bestätigt wurde |
| MOKA12-008 / MOKASTOP-001 | Sell-Guide-Evidenz (10DMA nach ≥ 7 Wochen Respekt, sonst 50DMA) unter beiden Lesarten der MA-Verletzung (MOKA-C2). Nie ein automatischer Exit. Ersetzt den bisherigen `NOT_IMPLEMENTED`-Platzhalter. |

Keine qualitative Regel wurde durch eine erfundene Schwelle ersetzt. Alle neuen Regeln sind `SOURCE_DERIVED` mit schriftlicher Ableitung. Evidenzregeln tragen `gate: false` und zählen in der Coverage nie als Umsetzung einer manuellen Regel.

### 6. Welche bisherigen Implementierungslücken wurden geschlossen?

**Fachliche Fehler**

| Fehler | Fix |
|---|---|
| Darvas `AFTER_TOP_DAY`: Ein fehlender Balken (low = null) wurde als Bodenkandidat mit Tief 0 gewertet. | Nur Balken mit Hoch und Tief zählen. |
| Darvas: Eine Box, die an einem synthetischen oder Open-losen Balken bestätigt wurde, hob den Stop nie an. | Anhebung greift ab dem nächsten echten Balken. |
| Turtle: Ein einziges fehlendes Tief schaltete den Kanal-Exit für 10 bzw. 20 Sitzungen ab. | Exit-Niveau aus den vorhandenen Tiefs |
| Turtle: Der S1-Filter hielt einen Ausbruch für offen, den die Engine am selben Balken schon geschlossen hatte. | Gleiche Konvention im Filter |

**Fehlende Prüfungen und Schutzmechanismen**
- Synthetic-Bar-Execution-Guard für Darvas (keine Order, keine Stopausführung ohne echten Open).
- Turtle-Liquiditätsdiagnose (nur Evidenz).
- Pocket-Pivot-Exit-Platzhalter ersetzt (siehe Frage 5).

**Messung und Produkt**
- Abgeleitete Gap-Matrix über 15 Dimensionen.
- Mehrdimensionaler Status (Abschnitt 18).
- Acceptance Gate, gebunden an den Code-Fingerabdruck.
- Research-Signal-Vertrag (Abschnitt 19).

### 7. Welche Hindernisse verhindern eine vollständige Trading-Engine?

- **Turtle:** PIT-Gruppen für TUR-LIMIT6/10.
- **Turtle, Zertifizierung:** V4-D1 (nicht deklarierte Reverse-Splits, Quant-PR) und V4-D2 (Aktiengattungen).
- **Screens:** Die Quellen verlangen bewusst ein manuelles Urteil (Abschnitt 3). Daraus wird nur über ein vorwärts protokolliertes Review eine Strategie, nie rückwirkend.
- **KK EP / PS:** eingefrorene Intraday-Daten, konsolidiertes Minutenvolumen, Katalysator-Zeitstempel, Borrow.
- **Holy Grail:** Einstieg und Stop sind in der Quelle nicht offengelegt.

### 8. Welche zusätzlichen Datenquellen wären wirklich erforderlich?

In der Reihenfolge des größten Hebels, Details in [Data Gaps](SUPERTRADER_2_DATA_GAPS.md):

1. **PIT-SIC je Filing aus EDGAR** (öffentlich, kostenlos). Damit lassen sich die Turtle-Korrelationslimits und Weinstein WEIN-GROUP binden.
   - Die Zuordnung „SIC-4 = eng, SIC-Division = lose korreliert“ ist eine Ableitung ohne Quellenzahl.
   - Sie braucht eine Owner-Freigabe.
2. **SEC-PIT-Store mit Politik `original`.** Er liegt schon privat vor. Er liefert Evidenz für Minervini-Fundamentaldaten und die BGU-Marktkapitalisierung.
3. **SEC 8-K Item 2.02** mit Acceptance-Zeitpunkt (öffentlich) für KK-Episodic-Pivot-Katalysatoren. Die Urteile „unerwartet“ und „signifikant“ bleiben manuell.
4. **Snapshot-Generation mit eingefrorenen IEX-Minutenbalken** (lizenziert, intern). Für Volumenregeln reicht IEX nicht. Dafür wären SIP-Minuten nötig (Kosten).
5. **Kostenpflichtig, Owner-Entscheidung:**
   - NYSE-Breadth-Historie;
   - Estimates/Surprises;
   - Borrow/Locate;
   - IBD-RS.

Es wurde nichts abonniert und keine Massenabfrage ausgeführt.

### 9. Welche Tests und Reviews sind bestanden?

**Tests**

| Prüfung | Ergebnis |
|---|---|
| `node --test "scripts/supertrader/tests/*.test.mjs"` | 475 bestanden, 0 Fehler, 1 übersprungen (vorher 435). Übersprungen ist SF-PIN-REBUILD; es braucht das #709-Verzeichnis. |
| Golden Cases | 114/114 PASS (vorher 106) |
| Supertrader Gate A | sauber |
| Test-Isolation | sauber |

**Neue Testkategorien je Methode (Abschnitt 16):**
- Source Golden Cases, Entry/Exit, Stop, Risk/Sizing, Gap-Szenarien;
- Missing Data, darunter ein Fuzz-Test über alle Screens;
- PIT, Synthetic-Bar-Guard, Accounting, Snapshot;
- Strategieunabhängigkeit, Legacy-Isolation.

Jede Kategorie ist durch einen benannten Test abgedeckt oder mit Begründung als N/A erklärt. Die Gap-Matrix prüft das bei jedem Build (`D15_TESTS`).

**Reviews:** Vier unabhängige adversariale Reviews, die die acht Prüfbereiche aus Abschnitt 17 abdecken:

| Review | Prüfbereich |
|---|---|
| SF2-R1 | Quellentreue, manuelle Klassifikation |
| SF2-R2 | Temporal/Lookahead, Risk/Execution |
| SF2-R3 | Accounting, Backtest-Readiness, Datenvollständigkeit |
| SF2-R4 | Regression/Legacy-Isolation, Completion-Modul, Signalvertrag |

Befunde:

| Schwere | Anzahl | Stand |
|---|---|---|
| CRITICAL | 0 | – |
| HIGH | 4 | behoben |
| MEDIUM | 15 | behoben |
| LOW | 25 | 21 behoben, 4 dokumentiert |

Offen ist kein HIGH oder CRITICAL (`STRATEGY-EXECUTION-REVIEW.json`).

Die vier HIGH-Befunde:
- Turtle wurde trotz nicht durchsetzbarer Korrelationslimits als voll messbar ausgewiesen.
- Die Backtest-Readiness widersprach dem Status.
- Darvas verlor eine Stop-Anhebung.
- Der Signal-Validator ließ Review-Kandidaten als mechanisch durch.

### 10. Welche Draft-PRs wurden erstellt?

#804 (Engines, Basis `main`) und #805 (Completion-Schicht und Berichte, gestapelt auf #804). Beide sind Draft, kein Merge. Details im Abschnitt [Draft-PRs](#draft-prs).

### 11. Welche Methoden können als Nächstes realistisch produktiv vorbereitet werden?

1. **Turtle S1/S2 als Research-Signal-Quelle.**
   - Voraussetzungen: PIT-SIC-Gruppen und V4-D1.
   - Danach Signale im Format `signals/research-signal.mjs`, zunächst nur intern und protokolliert.
2. **Darvas, Pocket Pivot und BGU als Review-Queue mit Vorwärts-Log.** Sie haben die präzisesten Maschinenkomponenten und die kleinsten manuellen Flächen. Reviewer-Entscheidungen werden protokolliert und nie rückwirkend in Backtests eingefügt.

### 12. Welche minimale Abfolge führt zur nächsten belastbaren Entwicklungsstufe?

1. **Draft-PRs prüfen und mergen**, in Stack-Reihenfolge.
2. **Quant/SEC-PR „PIT-SIC je Filing“** und eine Owner-Entscheidung zur Gruppenzuordnung. Danach einen Turtle-Lauf mit `groupsOf`. Der Engine-Zustand kann dann `RESEARCH_ENGINE_COMPLETE` werden, und eine volle diagnostische Messung ist möglich.
3. **Quant-PR für V4-D1** und eine neue Snapshot-Generation. Erst dann ist eine Zertifizierung möglich.
4. **Versiegelte Ergebnisse auswerten** (Owner). Keine Parameteränderung nach Rendite.
5. **Review-Vorwärts-Log einrichten**, zuerst für Darvas, Pocket Pivot und BGU.

## Snapshot-Lauf der neuen Engines

<!-- snapshot-run -->
**Lauf:** Workflow-Modus `sf-research`, Run 39392734794 vom 20.10.2026, Commit `6023a92`.
- Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Datensatz `EXACT`.
- 586.282.893 Bytes geprüft, kein `--limit`.
- 9.211 Wertpapiere (davon 2.932 delistet), 2.701 Sitzungen.
- Code-Fingerabdruck `9372a8f8f92b…`, identisch mit dem Branch-Stand.
- Ergebnisse versiegelt für den Owner (`claude/supertrader-validation-results`, Stempel `20261020T083513Z`). Öffentlich sind nur Belege und Zählwerte.

**Abstimmung:** Alle sechs Szenarien beider Systeme bestehen die Ledger-Abstimmung und die Endbestandsprüfung (PASS). Damit besteht AG-3 des Acceptance Gates.

**Trades je Szenario (Vorher/Nachher):**

| Methode | Engine | Lauf | Beleg | BASE_S0 | DELIST_S1 | DELIST_S2 | COST2 | DATA_EVENT | FAILSAFE_EXIT_20D |
|---|---|---|---|---|---|---|---|---|---|
| Turtle S1 | 1.0.0 (Referenz) | 39271055007 | `64b9aece4cb32f43` | 827 | 789 | 789 | 805 | 796 | – |
| Turtle S1 | **1.1.0** | 39392734794 | `6b860bb6d72836bd` | 820 | 980 | 980 | 841 | 747 | 574 |
| Turtle S2 | 1.0.0 (Referenz) | 39271055007 | `d32dd805a3a4429b` | 609 | 578 | 578 | 578 | 659 | – |
| Turtle S2 | **1.1.0** | 39392734794 | `4cc089e9e5fdc640` | 559 | 524 | 524 | 604 | 586 | 559 |
| Darvas (Komponentenstudie) | 1.0.0 → 1.1.0 | beide | `2fd60c59…` → `f6c0386d…` | 22.577 Signale | | | | | |

Die Unterschiede zwischen 1.0.0 und 1.1.0 haben benannte Ursachen und sind keine Optimierung:
- **Reihenfolge am Einstiegsbalken:** Einstieg → Adds → Stops (SF2-R2-01).
  - Adds fallen jetzt auch dann an, wenn derselbe Balken danach den Stop erreicht. Das bindet Cash und verschiebt den weiteren Pfad.
  - Zählwerte im Basisszenario: S1 `sameBarEntryStops` 124, `sameBarAddStops` 64; S2 114 und 40.
- **Kanal-Exit am Einstiegsbalken:** sehr selten. S1 hat 1 Fall im Basisszenario, S2 keinen.
- **S1-Filter mit derselben Einstiegsbalken-Konvention** (SF2-R2-02).
- **Kanal-Exit über vorhandene Tiefs** statt Abschaltung bei einem fehlenden Balken (SF2-R2-04).

Darvas hat dieselbe Signalzahl wie in der Referenz. Die Korrekturen betreffen nur Bodenwahl und Stop-Anhebung an fehlenden oder synthetischen Balken. Der Beleg ändert sich schon durch den neuen Code-Fingerabdruck; ein Vergleich der Trade-Hashes liegt öffentlich nur für den neuen Lauf vor.

**Wichtigste Beobachtung: Die Failsafe-Lesart ist wesentlich.**
- S1 mit 20-Tage-Exit für Failsafe-Positionen: 574 Trades statt 820. Im Basisszenario sind 710 von 825 Einstiegen Failsafe-Einstiege.
- Diese quellenoffene Regel (TUR-SF-FAILSAFE-EXIT) prägt System 1 also stark.
- Beide Lesarten werden ausgewiesen. Eine Wahl nach Rendite ist ausgeschlossen.
- S2 hat keinen Failsafe; dort ist das Ledger identisch.

**Korrelationslimits** sind in jedem Ergebnis als `NOT_EVALUATED_NO_PIT_GROUPS` ausgewiesen.

**Liquidität:** Der Median-Anteil einer Order am Balkenvolumen liegt in allen Szenarien bei ≤ 0,04 %. Das ist reine Diagnose, kein Gate.
<!-- /snapshot-run -->

## Draft-PRs

<!-- prs -->
Beide als Draft, gestapelt, nicht gemergt:

| PR | Branch | Inhalt |
|---|---|---|
| [#804](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/804) (1/2) | `claude/supertrader-2-systems-completion-2on9j3-p1-engines` → `main` | Engine-Änderungen Turtle 1.1.0, Darvas 1.1.0, Pocket Pivot/BGU 1.1.0 mit Tests, Review-Dokumentation und Vorher/Nachher-Lauf |
| [#805](https://github.com/dennismueller10x-sudo/vision-universe-research/pull/805) (2/2) | `claude/supertrader-2-systems-completion-2on9j3` → #804 | Completion-Matrix, Statusdimensionen, Acceptance Gate, Signalvertrag, Artefakte, Berichte |

Die Aufteilung folgt dem gemeinsamen Code. Die Engine-Änderungen sind Fachmodell-Änderungen mit eigenem Vorher/Nachher-Vergleich (CLAUDE.md). Die Completion-Schicht liest alle 13 Verträge und die Golden-Ergebnisse gemeinsam; eine Aufteilung je Methode würde dieselben generierten Artefakte in jedem PR erneut ändern.
<!-- /prs -->

## Grenzen dieser Arbeit

**Turtle-Konventionen.** Die Equity-Adaption bleibt Long-only mit Cash-Konto, ganzen Aktien und 1 $ je Punkt. Die Intrabar-Reihenfolge auf Tagesbalken ist eine deklarierte, gezählte Konvention.

**Leere Liquiditätsdiagnose.** Für die Liquiditätsdiagnose gibt es keine Quellenschwelle (TUR-MARKETS, „liquide Märkte“ = Universumsprotokoll aus #705). Sie lehnt deshalb keine Order ab.

**Rangierte Evidenz.** Evidenzregeln (Darvas-Review-Daten, Sell-Guide) entscheiden nichts. Sie liegen in der Coverage nie über der manuellen Regel, die dieselbe #709-ID trägt.

**Minervini-Grenzen.** Der 10-%-Stop und das 25-%-Positionslimit bleiben manuell. Die #709-Regeln sind MEDIUM und nur in Übersetzung belegt (SF2-R1-09, dokumentiert).

**Kopplung an den Signal-Workflow.** Der produktive Signal-Workflow führt alle Supertrader-Testdateien aus (SF2-R4-14, vorbestehend). Eine Entkopplung gehört in einen eigenen Workflow-PR.
