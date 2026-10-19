# Supertrader – Source-faithful Strategy Implementation: Abschlussbericht

Stand: 19. Oktober 2026. Reihe SF-1 … SF-9 als Draft-PRs (#784 … #791 und SF-9), gestapelt auf `main` @ `d9fd2f5`. Keine Merges, keine Live-Aktivierung, keine Handelsausführung, keine Änderung bestehender Strategien oder Portfolios. Alle historischen Ergebnisse sind `DIAGNOSTIC_NOT_CERTIFIED`.

Maschinenlesbar: `scripts/supertrader/source-faithful/artifacts/`
- `STRATEGY-SOURCE-CONTRACTS.json`
- `STRATEGY-IMPLEMENTATION-STATUS.json`
- `STRATEGY-REGISTRY.json`
- `STRATEGY-REGISTRY-VALIDATION.json`
- `STRATEGY-COVERAGE-MATRIX.json`
- `STRATEGY-GOLDEN-CASE-CATALOGUE.json`
- `STRATEGY-GOLDEN-CASE-RESULTS.json`
- `STRATEGY-SNAPSHOT-PROVENANCE.json`
- `STRATEGY-EXECUTION-REVIEW.json`
- `STRATEGY-IMPLEMENTATION-READINESS.json`

Generierte Berichte:
- [Coverage-Matrix](SUPERTRADER_STRATEGY_COVERAGE_MATRIX.md)
- [Source-to-Code-Traceability](SUPERTRADER_SOURCE_TO_CODE_TRACEABILITY.md)
- [Backtest-Readiness](SUPERTRADER_STRATEGY_BACKTEST_READINESS.md)

Methodenberichte:
- [Verträge](SUPERTRADER_SOURCE_FAITHFUL_CONTRACTS.md)
- [Turtle](SUPERTRADER_SF_TURTLE.md)
- [Darvas](SUPERTRADER_SF_DARVAS.md)
- [Weinstein](SUPERTRADER_SF_WEINSTEIN.md)
- [Pocket Pivot/BGU](SUPERTRADER_SF_POCKET_PIVOT_BGU.md)
- [Minervini](SUPERTRADER_SF_MINERVINI.md)
- [Kullamägi](SUPERTRADER_SF_KULLAMAGI.md)
- [Holy Grail](SUPERTRADER_SF_HOLY_GRAIL.md)

## Architektur in einem Absatz

`scripts/supertrader/source-faithful/` nutzt die bestehende Foundation und baut keine zweite Supertrader-Welt:
- Snapshot-Öffnung und `loadPitData` aus `snapshot/` bzw. `validation/analyze-methods.mjs`;
- `research-v1`-Primitive aus `validation/accounting-contract.mjs`;
- Delisting-Szenarien aus `validation/portfolio.mjs`;
- Split-Konvention aus `validation/lib.mjs` (ADR-002).

Neu sind:
- ein gemeinsamer Strategievertrag (`contract.mjs`) mit abgeleiteten Status;
- 13 Verträge;
- 8 Methodenmodule;
- ein diagnostischer Runner, der nur Snapshot und `research-v1` akzeptiert.

Methodenmodule importieren einander nicht. Kein Legacy-Modul importiert den neuen Baum (Test SF-INDEPENDENCE).

## Antworten an den Owner

### 1. Welche 13 Kandidaten standen tatsächlich in der Source-Registry?

Laut #709 `SUPERTRADER-TOP-IMPLEMENTATION-CANDIDATES.json`, hash-geprüft 20/20:

| # | Kandidat |
|---|---|
| C01 | Turtle System 1 |
| C02 | Turtle System 2 |
| C03 | Darvas Q&A-Box und Stops |
| C04 | Weinstein Stage 2 Investor |
| C05 | Weinstein Stage 2 Trader |
| C06 | Minervini SEPA/VCP mit manueller Rangfolge |
| C07 | Minervini Power Play |
| C08 | Kullamägi Common Breakout |
| C09 | Kullamägi Episodic Pivot |
| C10 | Kullamägi Parabolic Short |
| C11 | Morales/Kacher Pocket Pivot |
| C12 | Morales/Kacher Buyable Gap-Up |
| C13 | Raschke Holy Grail |

CAN SLIM ist **kein** Kandidat (B04 nur teilweise vorhanden, GAP-B04). Es ist dokumentiert, aber nicht gezählt.

### 2. Welche sind vollständig implementiert?

Keiner im Sinne von `IMPLEMENTED_SOURCE_EXACT` oder `IMPLEMENTED_SOURCE_DERIVED`. Der Status wird aus den Regeln abgeleitet. Jede Methode hat mindestens eine wesentliche Regel, die manuell, datenblockiert oder quellenseitig offen ist.

Am nächsten dran sind Turtle S1/S2. Die mechanischen Regeln sind vollständig umgesetzt, und die Equity-Adaption ist ausführbar (`RESEARCH_EXECUTABLE`, `DIAGNOSTIC_READY`). Formal bleibt der Status `PARTIAL_DATA_BLOCKED`, weil zwei Teile fehlen:
- die Korrelationsgrenzen TUR-LIMIT6/10 (keine PIT-Gruppen);
- die Short-Seite (kein Borrow).

### 3. Welche sind nur teilweise implementiert?

Alle 13:

| Status | Kandidaten |
|---|---|
| `PARTIAL_DATA_BLOCKED` | C01, C02, C04, C05, C06, C09, C10 |
| `PARTIAL_MANUAL_REVIEW` | C03, C07, C08, C11, C12, C13 |

### 4. Welche benötigen manuelle Prüfung?

Alle Screen-Methoden: C03–C13. Ihre Ausgabe ist ausschließlich `MANUAL_REVIEW_REQUIRED` mit `buyDeclarationAllowed=false`. Evidenz und offene Fragen tragen #709-IDs.

Durch das Design manuell:
- SEPA-Priorisierung (MIN-PROCESS-04);
- Darvas-Auswahl, Volumen und Größe (C03);
- Weinstein-Stage und Support-Stops;
- Pocket-Pivot-/BGU-Kontext und Exits;
- KK-Setup und -Level;
- Holy-Grail-Order und -Stop (nicht offengelegt).

### 5. Welche benötigen zusätzliche Daten?

| Fehlende Daten | Betroffene Methoden |
|---|---|
| PIT-Branchengruppen / Korrelationsgruppen | Weinstein C04/C05 (WEIN-GROUP), Turtle C01/C02 (TUR-LIMIT6/10) |
| NYSE-Breadth (Advances/Declines, neue Hochs/Tiefs) | Weinstein (WEIN-MARKET) |
| IBD-RS-Rating; Estimates, Surprises, Guidance | Minervini C06 |
| Katalysatoren mit Zeitstempel, Intraday-Volumen/ORH | KK EP C09 |
| Intraday/VWAP, Borrow/Locates | KK Parabolic Short C10; Turtle-Short |
| Intraday-ORH (optional) | KK Breakout C08 |
| PIT-Marktkapitalisierung (Megacap-Ausnahme) | BGU C12 |
| Listing-to-date-Historie (Allzeithoch) | Darvas (Snapshot beginnt 2015) |
| Futures-Ketten und Rolls | Original-Turtle-Replikation |

### 6. Welche Originalregeln wurden exakt umgesetzt?

`SOURCE_EXACT` nur auf #709-Regeln mit HARD, HIGH, geprüftem Originalwortlaut und `SCOPE_AND_EXCEPTIONS_REQUIRED`; der Validator erzwingt das. Exakt umgesetzt sind:

- **Turtle (7 je System):**
  - TUR-TR, TUR-N;
  - TUR-LIMIT4;
  - TUR-STOP und TUR-STOPADD (Stops je Unit);
  - S1: TUR-FAILSAFE;
  - S2: TUR-S2NOSKIP;
  - TUR-SIGNAL-CONSISTENCY.
- **Darvas:** DAR-Q1, DAR-Q2 (Drei-Tage-Bestätigung mit Touch-Reset), DAR-Q3, DAR-B6.
- **Kullamägi:** KK-031 (ADR20), KK-012 (Tagestief-Stop ≤ ADR, Ablehnung statt Clamp), KK-034 (EP-Stop ≤ 1,5 ADR), KK-027 (Stop-Market), KK-001 (30 % Übernacht).
- **Morales/Kacher:** MOKAPP-003 (Down-Volume), MOKA12-004 (Gap ≥ 0,75 × ATR40), MOKA24-VOL (1,5×).
- **Holy Grail:** RAS04-002 (Wilder-ADX14 > 30), RAS04-004 (3/10-Oszillator).
- **Weinstein:** WEIN-SELL4 (nur technische Exits).

Minervini hat **keine** exakte Regel: Alle Minervini-Regeln in #709 sind MEDIUM und nur in Übersetzung belegt.

### 7. Wo waren notwendige Anpassungen unvermeidlich?

Alle Anpassungen sind als `SOURCE_DERIVED` mit schriftlicher Ableitung deklariert:

- **Turtle:**
  - Equity statt Futures: 1 $ je Punkt, ganze Aktien, nur Long, Cash-Konto.
  - Ein Tick = 0,01 roh, split-bereinigt; Tagesbalken-Füllungen zu max(Open, Trigger).
  - N des Ersteinstiegs für Add-Abstand und Stops.
  - Nach dem Stop-out einer Unit keine weiteren Adds (sonst Whipsaw-Re-Entry).
  - Rang (C − C₆₃)/N.
  - Jahresstart des notionellen Kontos = tatsächliches Kapital.
  - Research-Universum aus #705 (Rohschluss ≥ 5, 20-Tage-Dollarvolumen ≥ 1 Mio.) als Messkonvention für alle Methoden.
- **Darvas:** „ein Bruchteil“ = ein Roh-Cent. Beginn der Bodensuche: Standard `AFTER_TOP_DAY`, die Variante bleibt erhalten (#709 UNRESOLVED).
- **Weinstein:**
  - Wochenbalken = ISO-Wochen.
  - Basis ab der Wende der MA30w; Trader-Widerstand = letztes Swing-Hoch.
  - MA-Gate auf den Kauf-Stop-Preis.
- **Minervini:** Monat = 21 Sitzungen, 52 Wochen = 252, acht Wochen = 40 Sitzungen.
- **KK Breakout:** Tagesvariante mit Einstieg zum Schluss des Ausbruchstags, damit das endgültige Tagestief für KK-012 feststeht.
- **BGU:** Gap = Open − Vortagesschluss; ATR40 als einfaches Mittel ohne den Gap-Tag. Das Volumenfenster ist `SOURCE_AMBIGUOUS`.
- **Holy Grail:** nur die Tages-Zeitebene (RAS04-006).

### 8. Welche bisherigen VU-Regelabweichungen wurden behoben?

Alle in den neuen Methoden; die Legacy-Pfade bleiben unverändert. Abweichungen laut #709 VU-Gap-Matrix und #712:

- **Turtle:**
  - V41-F1: Stops je Unit statt eines gemeinsamen Stops.
  - Adds, eigenständiges S2, Short-Ausbrüche im S1-Filter.
  - S1-Filter überspringt nur nach einem profitablen Ausbruch.
- **Darvas:**
  - Touch-Reset auch für den Boden.
  - Entfernt: 1 %-Stop, 20-Tage-Hoch, Boxhöhe 3–25 %, RS80, SPY200, KK-Risiko, 252-Tage-Verdopplung.
- **Weinstein:**
  - Kein RS > 0-Gate und kein pauschaler MA30-Schlussbruch-Exit.
  - Keine festen Steigungs- und Basisschwellen.
  - Investor und Trader getrennt, Support-Stops als Vorschlag.
- **Minervini:** kein GAAP-EPS-25 %-AND-Gate, keine starren VCP-Zahlen, keine 3R-Pflicht, keine Start-Exposure-Quote, kein pauschaler MA50-Exit.
- **Kullamägi:** Tagestief-Stop wird abgelehnt statt per ADR-Clamp ersetzt; EP und Parabolic Short haben eigene Verträge.
- **Pocket Pivot / BGU:** universelles 1,5×-Hard-Gate durch MCD-Ausnahmeprüfung ersetzt.

### 9. Welche Golden Cases bestanden?

106/106 katalogisierte Golden Cases PASS (`STRATEGY-GOLDEN-CASE-RESULTS.json`). Darunter die #709-Rechenbeispiele:

| Beispiel | Ergebnis |
|---|---|
| TUR-HO2002 | 16 Kontrakte |
| TUR-GOLD | 310 / 311,25 / 312,50 / 313,75 |
| TUR-CRUDE normal | Stops 27,70 ×4 |
| TUR-CRUDE mit Lücke | 27,70 / 27,70 / 27,70 / 28,40 |
| MOKA24-MCD | +47,09 % → Ausnahmeprüfung |

Dazu kommt jeder Zustandsübergang der Darvas-Box. Die #709-Fallsammlungen (Charts, persönliche Trades) sind als Katalog verknüpft. Sie sind ausdrücklich keine Performance-Stichprobe.

### 10. Welche Tests und Reviews wurden abgeschlossen?

**Tests:**
- `node --test "scripts/supertrader/tests/*.test.mjs"`: 435/435 grün (Basis vorher 306).
- Source-, Temporal-, Signal-, Execution-, Accounting-, Missing-Data-, Independence- und Regressionstests.
- Gate A, Secret-Grep und Test-Isolation sauber.

**Vier unabhängige adversariale Reviews:**
- Source Fidelity ×2;
- Temporal / Execution / Accounting;
- Snapshot / Data Coverage / Legacy / Security.

**Befunde:**

| Schwere | Anzahl | Stand |
|---|---|---|
| CRITICAL | 0 | – |
| HIGH | 2 | behoben |
| MEDIUM | 12 | behoben |
| LOW | 14 | 11 behoben, 3 dokumentiert |

Die beiden HIGH-Befunde:
- Turtle-Adds nach dem Stop-out einer Unit;
- das Weinstein-MA-Gate auf dem Vorwochenschluss.

Offen ist kein HIGH oder CRITICAL (`STRATEGY-EXECUTION-REVIEW.json`).

Die Behebungen stehen in SF-9, nicht rückwirkend in SF-2…SF-8. Wer nur einen früheren PR der Reihe mergt, übernimmt den dort dokumentierten Vor-Review-Stand.

### 11. Welche PRs wurden erstellt?

Alle als Draft, gestapelt:

| PR | Inhalt |
|---|---|
| #784 SF-1 | Verträge und Snapshot-Durchreichung |
| #785 SF-2 | Turtle und Runner |
| #786 SF-3 | Darvas |
| #787 SF-4 | Weinstein |
| #788 SF-5 | Pocket Pivot / BGU |
| #789 SF-6 | Minervini |
| #790 SF-7 | Kullamägi |
| #791 SF-8 | Holy Grail |
| SF-9 | Review-Fixes, Registry-Abschluss, Berichte |

### 12. Was verhindert derzeit eine produktive Freigabe?

- **Messung nicht zertifiziert:** #705 NOT_CERTIFIED; V4-D1 (nicht deklarierte Reverse-Splits im kanonischen Kern) und V4-D2 (Share-Class-Audit) sind offen.
- **Methoden:** keine ist vollständig automatisierbar. 11 von 13 brauchen eine manuelle Ebene, deren Entscheidungen nur vorwärts protokolliert werden können.
- **Datenlücken** wie unter Frage 5.
- **Fehlende Owner-Freigaben:** Merge der Draft-PRs, Freigabe eines diagnostischen Laufs und seiner Auswertung, Produktentscheidung zur Review-Oberfläche.
- **Keine Live-Pfade:** Live-Signal- und Ausführungspfade für diese Methoden existieren bewusst nicht.

### 13. Welche Methoden sind bereit für reproduzierbare diagnostische Backtests?

- **Turtle S1 und Turtle S2:** voll mechanische Equity-Adaption; Snapshot und `research-v1`; fünf Szenarien. Der Runner verweigert jede andere Methode als `DIAGNOSTIC_READY`.
- **Darvas:** nur als Komponentenstudie, gekennzeichnet `COMPONENT_SIGNAL_STUDY_NOT_A_METHOD_RETURN`.
- **Alle übrigen:** `NOT_READY`. Sie haben keinen mechanischen Exit oder blockierte Daten, und eine Haltedauer festzulegen hieße, Parameter zu erfinden.

Der Lauf ist vorbereitet: Workflow-Modus `sf-research` mit Snapshot-Marke und `research-v1`. Das Ergebnis wird für den Owner verschlüsselt; öffentlich erscheinen nur Hashes.

### 14. Welche nächsten Schritte führen am schnellsten zu einem quellentreuen, messbaren System?

1. **Quant-PR für V4-D1:** kausale Erkennung nicht deklarierter Splits im kanonischen Kern, danach eine neue Snapshot-Generation und die Rekalibrierung mit unveränderten Toleranzen. Das ist der einzige Weg zu zertifizierbaren Turtle-Messungen.
2. **SF-1 … SF-9 prüfen und mergen**, in Stack-Reihenfolge.
3. **Diagnostische Turtle-Läufe** (`sf-research`) auf dem Snapshot laufen lassen; danach entscheidet der Owner auf Basis der versiegelten Ergebnisse.
4. **PIT-Branchengruppen beschaffen.** Das schaltet gleichzeitig Weinstein-WEIN-GROUP und Turtle-Korrelationsgrenzen frei. Das ist der größte Hebel unter den Datenlücken.
5. **Englischen Originalwortlaut für Minervini (B12) prüfen.** Damit können die Trend-Template-Schwellen gehärtet werden.
6. **Manuelle Review-Ebene als Vorwärts-Log einrichten**, zuerst für Darvas, Pocket Pivot und BGU, die die präzisesten Maschinenkomponenten haben. Entscheidungen werden mit #709-Begründungen protokolliert und nie rückwirkend in Backtests eingefügt.
7. **Eingefrorene Intraday-Daten bereitstellen.** Ohne sie bleiben KK EP, Parabolic Short und ORH blockiert.
